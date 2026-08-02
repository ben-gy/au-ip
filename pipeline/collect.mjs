// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Build every JSON the site serves, straight out of IP Australia's IP RAPID
// archive, without ever materialising its 9.51 GB on disk.
//
// Three members are streamed, in this order, because each pass depends on the
// one before it:
//   1. application.csv               → filing year + lifecycle per application
//   2. party_activity.csv            → applicant origin, filers, attorney firms
//   3. application_classification.csv → technology fields and Nice classes
//
// Between passes an `appMap` carries the join key. It packs two facts into one
// integer per application — the filing year, and the origin bucket learned in
// pass 2 — because a 4.3M-entry Map of objects is the difference between this
// running on a CI runner and not.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { readCentralDirectory, streamMemberLines, member } from './zipstream.mjs';
import {
  splitCsvLine, headerIndex, yearOf, daysBetween, cleanState, cleanAuPostcode,
  originOf, filerKey, titleCaseName, parseWipoField, parseNiceClass,
  NICE_CLASSES, NICE_KIND, PATENT_SUBTYPES, pct, ORIGIN_SHARE_LAST_RELIABLE_YEAR, isRedactedName,
} from './parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'public', 'data');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iprapid-'));

const CKAN = 'https://data.gov.au/data/api/3/action/package_show?id=iprapid';
const ABS_ERP = 'https://data.api.abs.gov.au/rest/data/ABS,ABS_ANNUAL_ERP_ASGS2021,/ERP.STE..A?startPeriod=2024&endPeriod=2024&format=csv';
const NE_WORLD = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson';

// These are the literal ip_right_type values in the archive. Plant breeder's
// rights are 'pbr', NOT 'plant_breeders_right' — guessing the readable name
// dropped all 11,649 of them, and the run still looked clean because the type
// filter counted them as "not one of ours". Gate 1 now anchors on the source
// row count so an unrecognised type can never again vanish quietly.
const TYPES = ['patent', 'trade_mark', 'design', 'pbr'];
const TYPE_IX = new Map(TYPES.map((t, i) => [t, i]));
const TYPE_CH = ['p', 't', 'd', 'b'];

// Packed appMap value: year * 4 + originRank.
// originRank: 0 = no founding applicant seen, 1 = all origins blank,
//             2 = foreign only, 3 = at least one Australian applicant.
const ORIGIN_RANK = { none: 0, unknown: 1, foreign: 2, domestic: 3 };
const RANK_NAME = ['none', 'unknown', 'foreign', 'domestic'];

const log = (m) => process.stdout.write(`${new Date().toISOString().slice(11, 19)}  ${m}\n`);
const fail = (m) => { throw new Error(`GATE FAILED — ${m}`); };

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'au-ip-pipeline/1.0 (+https://au-ip.benrichardson.dev)' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'au-ip-pipeline/1.0 (+https://au-ip.benrichardson.dev)' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const sortedTop = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

// ───────────────────────────────────────────────────────── pass 1: applications

const appMap = new Map();

const totals = { byType: new Map(), byTypeSub: new Map(), rows: 0, noYear: 0, badType: 0, badTypeNames: new Set() };
const statusByType = new Map();          // `${type}|${status}` → n
const subtypeByYear = new Map();         // `${sub}|${year}` → n  (patents only)
const grantLagBuckets = new Map();       // `${type}|${decade}|${bucket}` → n
const lifeByType = new Map();            // type → {filed, registered, retired, lagSum, lagN}
const survival = new Map();              // `${type}|${cohortDecade}|${yearsAlive}` → n
const cohortSize = new Map();            // `${type}|${cohortDecade}` → n

const LAG_BUCKETS = [0, 180, 365, 547, 730, 1095, 1460, 1825, 2555, 3650];
function lagBucket(days) {
  for (let i = LAG_BUCKETS.length - 1; i >= 0; i--) if (days >= LAG_BUCKETS[i]) return i;
  return 0;
}

async function passApplications(url, entries) {
  const e = member(entries, 'application.csv');
  log(`application.csv — ${(e.compSize / 1e6).toFixed(0)} MB compressed → ${(e.uncompSize / 1e6).toFixed(0)} MB`);
  let ix = null;
  let n = 0;
  let sourceRows = 0;

  await streamMemberLines(url, e, (line) => {
    if (ix === null) {
      ix = headerIndex(line, ['ip_right_type', 'application_number', 'ip_right_sub_type', 'status',
        'application_date', 'gained_registration_status_date', 'gained_enforceable_status_date', 'deemed_retired_date']);
      return;
    }
    sourceRows++;
    const f = splitCsvLine(line);
    const type = f[ix.ip_right_type];
    const ti = TYPE_IX.get(type);
    if (ti === undefined) { totals.badType++; totals.badTypeNames.add(type); return; }
    n++;

    // Counted before the filing-date check so the four type totals still sum to
    // the headline figure. Only the TIME SERIES need a date; an undated
    // application is still an application, and making the parts fail to add up
    // to the whole is its own kind of wrong.
    inc(totals.byType, type);
    const sub = f[ix.ip_right_sub_type] || 'unspecified';
    inc(totals.byTypeSub, `${type}|${sub}`);
    inc(statusByType, `${type}|${f[ix.status] || 'unknown'}`);

    const num = f[ix.application_number];
    const filedIso = f[ix.application_date];
    const year = yearOf(filedIso);
    if (!year) { totals.noYear++; return; }

    appMap.set(TYPE_CH[ti] + num, year * 4);
    if (type === 'patent') inc(subtypeByYear, `${sub}|${year}`);

    let life = lifeByType.get(type);
    if (!life) { life = { filed: 0, registered: 0, retired: 0, lagSum: 0, lagN: 0 }; lifeByType.set(type, life); }
    life.filed++;

    const regIso = f[ix.gained_registration_status_date];
    const decade = Math.floor(year / 10) * 10;
    if (regIso) {
      life.registered++;
      const lag = daysBetween(filedIso, regIso);
      if (lag !== null) {
        life.lagSum += lag; life.lagN++;
        if (decade >= 1980) inc(grantLagBuckets, `${type}|${decade}|${lagBucket(lag)}`);
      }
    }

    // Survival: of the rights that actually came into force, how many are still
    // alive N years on? Only cohorts old enough to have had the chance count.
    const enforceIso = f[ix.gained_enforceable_status_date] || regIso;
    if (enforceIso && decade >= 1980 && decade <= 2010) {
      inc(cohortSize, `${type}|${decade}`);
      const retiredIso = f[ix.deemed_retired_date];
      const alive = retiredIso ? Math.floor((daysBetween(enforceIso, retiredIso) ?? 0) / 365.25) : 99;
      for (let y = 1; y <= 20; y++) if (alive >= y) inc(survival, `${type}|${decade}|${y}`);
      if (retiredIso) life.retired++;
    }
  });

  totals.rows = n;
  totals.sourceRows = sourceRows;
  log(`  ${sourceRows.toLocaleString()} source rows → ${n.toLocaleString()} applications, ${totals.noYear.toLocaleString()} without a usable filing date`);

  // GATE 1 (source-anchored) — every data row in application.csv must end up in
  // appMap or in a NAMED rejection bucket, and an ip_right_type we do not
  // recognise is a hard failure rather than a silent rejection. An earlier
  // version only reconciled against rows it had already accepted, which is a
  // tautology: it stayed green while dropping every plant breeder's right.
  if (totals.badType > 0) {
    fail(`${totals.badType} rows carry an unrecognised ip_right_type: ${[...totals.badTypeNames].join(', ')}`);
  }
  if (appMap.size + totals.noYear + totals.badType !== sourceRows) {
    fail(`application accounting: ${appMap.size} joined + ${totals.noYear} no-date + ${totals.badType} bad-type != ${sourceRows} source rows`);
  }
  if (sourceRows < 4_300_000) fail(`only ${sourceRows} source rows — expected >4.3M; the archive layout may have changed`);
  // The four type totals must add up to the headline figure, or the About panel
  // publishes a breakdown that does not sum to its own total.
  let typeSum = 0;
  for (const v of totals.byType.values()) typeSum += v;
  if (typeSum !== sourceRows) fail(`type totals sum to ${typeSum}, expected ${sourceRows}`);
  for (const t of TYPES) {
    if (!(totals.byType.get(t) > 0)) fail(`no rows at all for ip_right_type '${t}'`);
  }
}

// ────────────────────────────────────────────────── pass 2: parties & attorneys

const originYear = new Map();     // `${type}|${year}|${origin}` → n   (applications)
const countryType = new Map();    // `${cc}|${type}` → n               (applications)
const countryDecade = new Map();  // `${cc}|${decade}` → n
const stateYear = new Map();      // `${st}|${year}` → n
const stateType = new Map();      // `${st}|${type}` → n
const postcode = new Map();       // pc → n
const postcodeType = new Map();   // `${pc}|${type}` → n
const filerTotal = new Map();     // filerKey → n
const firmTotal = new Map();      // firmKey → n
const firmType = new Map();       // `${firmKey}|${type}` → n
const firmOrigin = new Map();     // `${firmKey}|${origin}` → n
const firmYear = new Map();       // `${firmKey}|${year}` → n

const partyStats = { rows: 0, applicantRows: 0, foundingApplicant: 0, agentRows: 0, orphanApplicant: 0, orphanAgent: 0, redactedApplicant: 0, redactedAgent: 0 };

async function passParties(url, entries) {
  const e = member(entries, 'party_activity.csv');
  log(`party_activity.csv — ${(e.compSize / 1e6).toFixed(0)} MB compressed → ${(e.uncompSize / 1e6).toFixed(0)} MB`);

  const applicantsOut = fs.createWriteStream(path.join(TMP, 'applicants.tsv'));
  const agentsOut = fs.createWriteStream(path.join(TMP, 'agents.tsv'));
  const aBuf = []; const gBuf = [];
  const flush = (buf, stream) => { if (buf.length > 4000) { stream.write(buf.join('')); buf.length = 0; } };

  let ix = null;
  await streamMemberLines(url, e, (line) => {
    if (ix === null) {
      ix = headerIndex(line, ['ip_right_type', 'application_number', 'party_id', 'abn', 'party_role_category',
        'party_type', 'party_name', 'state_code', 'post_code', 'country_code', 'is_current', 'is_founding']);
      return;
    }
    partyStats.rows++;
    const f = splitCsvLine(line);
    const type = f[ix.ip_right_type];
    const ti = TYPE_IX.get(type);
    if (ti === undefined) return;
    const key = TYPE_CH[ti] + f[ix.application_number];
    const role = f[ix.party_role_category];

    if (role === 'applicant') {
      partyStats.applicantRows++;
      // party_activity holds 12.4M rows for 4.3M applications because ownership
      // changes over time. Only the FOUNDING applicant answers "who filed this",
      // and using every row would triple-count the big corporates.
      if (f[ix.is_founding] !== 'true') return;
      partyStats.foundingApplicant++;

      const packed = appMap.get(key);
      if (packed === undefined) { partyStats.orphanApplicant++; return; }
      const year = packed >> 2;

      const cc = (f[ix.country_code] || '').trim().toLowerCase();
      const origin = originOf(cc);
      const rank = ORIGIN_RANK[origin];
      if (rank > (packed & 3)) appMap.set(key, (year * 4) + rank);

      inc(countryType, `${cc || 'zz'}|${type}`);
      inc(countryDecade, `${cc || 'zz'}|${Math.floor(year / 10) * 10}`);

      const name = f[ix.party_name] || '';
      const redacted = isRedactedName(name);
      if (redacted) partyStats.redactedApplicant++;
      const fk = redacted ? '' : filerKey(name);
      if (fk) inc(filerTotal, fk);

      const st = cleanState(f[ix.state_code]);
      const pc = cleanAuPostcode(f[ix.post_code], cc);
      if (cc === 'au') {
        if (st) { inc(stateYear, `${st}|${year}`); inc(stateType, `${st}|${type}`); }
        if (pc) { inc(postcode, pc); inc(postcodeType, `${pc}|${type}`); }
      }

      aBuf.push(`${fk}\t${key}\t${year}\t${ti}\t${cc}\t${st}\t${pc}\t${f[ix.abn] || ''}\t${name}\n`);
      flush(aBuf, applicantsOut);
    } else if (role === 'applicant_agent') {
      // The attorney firm of record. Only current agents — historical transfers
      // would credit a firm for work it no longer does.
      if (f[ix.is_current] !== 'true') return;
      partyStats.agentRows++;
      const packed = appMap.get(key);
      if (packed === undefined) { partyStats.orphanAgent++; return; }
      const agentName = f[ix.party_name] || '';
      if (isRedactedName(agentName)) { partyStats.redactedAgent++; return; }
      const fk = filerKey(agentName);
      if (!fk) return;
      inc(firmTotal, fk);
      inc(firmType, `${fk}|${type}`);
      inc(firmYear, `${fk}|${packed >> 2}`);
      gBuf.push(`${fk}\t${key}\n`);
      flush(gBuf, agentsOut);
    }
  });

  applicantsOut.write(aBuf.join('')); agentsOut.write(gBuf.join(''));
  await Promise.all([
    new Promise((r) => applicantsOut.end(r)),
    new Promise((r) => agentsOut.end(r)),
  ]);

  // Origin per application is only final once every founding applicant row has
  // been seen, so the per-year origin series is rolled up afterwards.
  for (const [key, packed] of appMap) {
    const year = packed >> 2;
    const rank = packed & 3;
    const type = TYPES[TYPE_CH.indexOf(key[0])];
    inc(originYear, `${type}|${year}|${RANK_NAME[rank]}`);
  }

  log(`  ${partyStats.rows.toLocaleString()} party rows → ${partyStats.foundingApplicant.toLocaleString()} founding applicants, ${partyStats.agentRows.toLocaleString()} current agents`);
  log(`  orphans: ${partyStats.orphanApplicant.toLocaleString()} applicant, ${partyStats.orphanAgent.toLocaleString()} agent`);
  log(`  pseudonymised names set aside: ${partyStats.redactedApplicant.toLocaleString()} applicant, ${partyStats.redactedAgent.toLocaleString()} agent`);

  // GATE 2 — orphan applicant rows point at applications we dropped for having
  // no filing date. A large orphan rate would mean the join key itself is wrong.
  const orphanPct = pct(partyStats.orphanApplicant, partyStats.foundingApplicant);
  if (orphanPct > 3) fail(`${orphanPct}% of founding applicant rows do not join to an application`);

  // GATE 3 — the origin buckets must account for every joined application.
  let originSum = 0;
  for (const v of originYear.values()) originSum += v;
  if (originSum !== appMap.size) fail(`origin buckets sum to ${originSum}, expected ${appMap.size}`);
}

// ─────────────────────────────────────────────────── pass 3: classifications

const fieldDecade = new Map();     // `${field}|${decade}` → n  (patents, any origin)
const fieldDecadeAu = new Map();   // `${field}|${decade}` → n  (patents, AU origin)
const fieldTotal = new Map();
const fieldTotalAu = new Map();
const niceOrigin = new Map();      // `${class}|${origin}` → n
const niceDecade = new Map();      // `${class}|${decade}` → n
const classStats = { rows: 0, current: 0, patentMapped: 0, patentUnknownBucket: 0, patentUnparsed: 0, niceMapped: 0, niceUnparsed: 0 };

async function passClassifications(url, entries) {
  const e = member(entries, 'application_classification.csv');
  log(`application_classification.csv — ${(e.compSize / 1e6).toFixed(0)} MB compressed → ${(e.uncompSize / 1e6).toFixed(0)} MB`);

  // One application carries many IPC marks; counting rows would weight a
  // heavily-classified patent more than a lightly-classified one. We count each
  // (application, field) pair once instead. The dedupe key is deliberately
  // short — this Set reaches ~10M entries and the slug would double its size.
  const seen = new Set();
  let ix = null;

  await streamMemberLines(url, e, (line) => {
    if (ix === null) {
      ix = headerIndex(line, ['ip_right_type', 'application_number', 'is_current', 'classification_area']);
      return;
    }
    classStats.rows++;
    const f = splitCsvLine(line);
    if (f[ix.is_current] !== 'true') return;
    classStats.current++;

    const type = f[ix.ip_right_type];
    const ti = TYPE_IX.get(type);
    if (ti === undefined) return;
    const key = TYPE_CH[ti] + f[ix.application_number];
    const packed = appMap.get(key);
    if (packed === undefined) return;
    const year = packed >> 2;
    const rank = packed & 3;
    const decade = Math.floor(year / 10) * 10;
    const area = f[ix.classification_area];

    // classification_area speaks two languages and which one depends on the
    // right type: WIPO-35 field slugs for patents, bare Nice numbers for trade
    // marks. Reading one as the other silently invents categories.
    if (type === 'patent') {
      const wf = parseWipoField(area);
      if (!wf) { classStats.patentUnparsed++; return; }
      if (wf.key.startsWith('99_')) classStats.patentUnknownBucket++;
      const dedupe = `${key}|${wf.rank}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      classStats.patentMapped++;
      inc(fieldDecade, `${wf.key}|${decade}`);
      inc(fieldTotal, wf.key);
      if (rank === ORIGIN_RANK.domestic) {
        inc(fieldDecadeAu, `${wf.key}|${decade}`);
        inc(fieldTotalAu, wf.key);
      }
    } else if (type === 'trade_mark') {
      const nc = parseNiceClass(area);
      if (nc === null) { classStats.niceUnparsed++; return; }
      const dedupe = `${key}|n${nc}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      classStats.niceMapped++;
      inc(niceOrigin, `${nc}|${RANK_NAME[rank]}`);
      inc(niceDecade, `${nc}|${decade}`);
    }
  });

  log(`  ${classStats.rows.toLocaleString()} rows, ${classStats.current.toLocaleString()} current → ${classStats.patentMapped.toLocaleString()} patent field pairs, ${classStats.niceMapped.toLocaleString()} Nice pairs`);

  // GATE 4 — patent classification rows are either mapped to a WIPO field or
  // counted in a named unparsed bucket; nothing may vanish silently.
  if (classStats.patentUnparsed > classStats.current * 0.02) {
    fail(`${classStats.patentUnparsed} patent classification rows had an unparseable classification_area`);
  }
  if (classStats.patentMapped < 1_000_000) fail(`only ${classStats.patentMapped} patent field pairs — expected millions`);
}

// ────────────────────────────────────────────── detail passes over temp files

async function readLines(file, onLine) {
  if (!fs.existsSync(file)) return;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line) onLine(line);
}

async function buildFilers(topN) {
  const top = new Map(sortedTop(filerTotal, topN).map(([k]) => [k, {
    key: k, n: 0, byType: [0, 0, 0, 0], years: new Map(), names: new Map(), abns: new Set(),
    cc: new Map(), st: new Map(), y0: 9999, y1: 0,
  }]));

  await readLines(path.join(TMP, 'applicants.tsv'), (line) => {
    const [fk, , yr, ti, cc, st, , abn, name] = line.split('\t');
    const g = top.get(fk);
    if (!g) return;
    const y = Number(yr);
    g.n++;
    g.byType[Number(ti)]++;
    inc(g.years, y);
    inc(g.names, name);
    if (cc) inc(g.cc, cc);
    if (st) inc(g.st, st);
    if (abn) g.abns.add(abn);
    if (y < g.y0) g.y0 = y;
    if (y > g.y1) g.y1 = y;
  });

  return [...top.values()].map((g) => {
    const topCc = sortedTop(g.cc, 1)[0];
    const topSt = sortedTop(g.st, 1)[0];
    const names = sortedTop(g.names, 8);
    return {
      k: g.key,
      name: titleCaseName(names[0]?.[0] || g.key),
      n: g.n,
      t: g.byType,
      y0: g.y0 === 9999 ? 0 : g.y0,
      y1: g.y1,
      cc: topCc ? topCc[0] : '',
      st: topSt ? topSt[0] : '',
      abn: [...g.abns].slice(0, 4),
      variants: names.map(([nm, c]) => [titleCaseName(nm), c]),
      nVariants: g.names.size,
      series: [...g.years.entries()].sort((a, b) => a[0] - b[0]),
    };
  }).sort((a, b) => b.n - a.n);
}

async function buildAttorneys(topFirms, clientsPerFirm) {
  const firms = sortedTop(firmTotal, topFirms).map(([k, n]) => ({ k, n }));
  const firmSet = new Map(firms.map((f) => [f.k, f]));

  // Which applications each shortlisted firm acts on — the only way to link a
  // firm to its clients, since agent and applicant rows are separate records.
  const appToFirm = new Map();
  await readLines(path.join(TMP, 'agents.tsv'), (line) => {
    const t = line.indexOf('\t');
    const fk = line.slice(0, t);
    if (!firmSet.has(fk)) return;
    appToFirm.set(line.slice(t + 1), fk);
  });

  const edges = new Map();   // `${firm}|${client}` → n
  const clientName = new Map();
  await readLines(path.join(TMP, 'applicants.tsv'), (line) => {
    const p = line.split('\t');
    const fk = appToFirm.get(p[1]);
    if (!fk) return;
    inc(edges, `${fk}|${p[0]}`);
    if (!clientName.has(p[0])) clientName.set(p[0], p[8]);
  });

  const byFirm = new Map();
  for (const [k, v] of edges) {
    const i = k.indexOf('|');
    const f = k.slice(0, i);
    if (!byFirm.has(f)) byFirm.set(f, []);
    byFirm.get(f).push([k.slice(i + 1), v]);
  }

  return firms.map((f) => {
    const clients = (byFirm.get(f.k) || []).sort((a, b) => b[1] - a[1]).slice(0, clientsPerFirm);
    const types = TYPES.map((t) => firmType.get(`${f.k}|${t}`) || 0);
    const years = [];
    for (let y = 1995; y <= 2026; y++) {
      const v = firmYear.get(`${f.k}|${y}`);
      if (v) years.push([y, v]);
    }
    return {
      k: f.k,
      name: titleCaseName(f.k),
      n: f.n,
      t: types,
      clients: clients.map(([ck, cn]) => ({ k: ck, name: titleCaseName(clientName.get(ck) || ck), n: cn })),
      nClients: (byFirm.get(f.k) || []).length,
      series: years,
    };
  });
}

// ───────────────────────────────────────────────────────────── reference data

async function fetchPopulation() {
  const csv = await getText(ABS_ERP);
  const rows = csv.trim().split('\n').slice(1);
  const CODE = { 1: 'nsw', 2: 'vic', 3: 'qld', 4: 'sa', 5: 'wa', 6: 'tas', 7: 'nt', 8: 'act' };
  const pop = {};
  for (const r of rows) {
    const f = splitCsvLine(r);
    const st = CODE[Number(f[3])];
    const v = Number(f[6]);
    if (st && Number.isFinite(v)) pop[st] = v;
  }
  if (Object.keys(pop).length !== 8) throw new Error(`ABS ERP returned ${Object.keys(pop).length} states, expected 8`);
  return pop;
}

async function fetchWorld() {
  const gj = await getJson(NE_WORLD);
  // Natural Earth carries far more attributes than a choropleth needs; keeping
  // them would triple the payload the browser downloads.
  gj.features = gj.features
    .filter((f) => f.properties.ISO_A2 && f.properties.ISO_A2 !== '-99')
    .map((f) => ({
      type: 'Feature',
      properties: { iso: f.properties.ISO_A2.toLowerCase(), name: f.properties.NAME },
      geometry: f.geometry,
    }));
  return gj;
}

// ISO 3166-1 alpha-2 display names for the origin table. Built from the world
// file so the map and the table can never disagree about a country's name.
function countryNames(world) {
  const m = {};
  for (const f of world.features) m[f.properties.iso] = f.properties.name;
  // Applicant countries that are not sovereign polygons in Natural Earth 110m.
  Object.assign(m, {
    hk: 'Hong Kong', sg: 'Singapore', mt: 'Malta', mo: 'Macau', bh: 'Bahrain',
    mu: 'Mauritius', bb: 'Barbados', ky: 'Cayman Islands', vg: 'British Virgin Islands',
    li: 'Liechtenstein', mc: 'Monaco', ad: 'Andorra', sm: 'San Marino', bm: 'Bermuda',
    je: 'Jersey', gg: 'Guernsey', im: 'Isle of Man', gi: 'Gibraltar', ai: 'Anguilla',
    ag: 'Antigua and Barbuda', kn: 'Saint Kitts and Nevis', lc: 'Saint Lucia',
    sc: 'Seychelles', mv: 'Maldives', bn: 'Brunei', zz: 'Not recorded',
  });
  return m;
}

// ──────────────────────────────────────────────────────────────── assembly

function yearSeries() {
  const years = new Set();
  for (const k of originYear.keys()) years.add(Number(k.split('|')[1]));
  const list = [...years].filter((y) => y >= 1900).sort((a, b) => a - b);
  const out = {};
  for (const t of TYPES) {
    out[t] = list.map((y) => [
      y,
      originYear.get(`${t}|${y}|domestic`) || 0,
      originYear.get(`${t}|${y}|foreign`) || 0,
      (originYear.get(`${t}|${y}|unknown`) || 0) + (originYear.get(`${t}|${y}|none`) || 0),
    ]).filter((r) => r[1] + r[2] + r[3] > 0);
  }
  return out;
}

/**
 * The applicant-country field was populated retrospectively and unevenly, and
 * before it was, "origin" is not missing at random — it is simply absent. In
 * 1980, 87% of patents have no recorded applicant country; charting a
 * domestic/foreign split across those years shows the field being filled in,
 * not filings being made, and reads as spectacular growth that never happened.
 *
 * So each right type gets its own start year: the earliest year from which the
 * unrecorded share never again exceeds `maxUnknown` up to the last reliable
 * year. Designs never fall below about 20%, which is a real and permanent
 * property of that collection — the site states it rather than hiding it.
 */
function originCoverage(series, lastReliable, maxUnknown = 0.3) {
  const out = {};
  for (const t of TYPES) {
    const rows = series[t].filter((r) => r[0] <= lastReliable && r[1] + r[2] + r[3] >= 50);
    let from = 0;
    for (let i = 0; i < rows.length; i++) {
      const ok = rows.slice(i).every((r) => r[3] / (r[1] + r[2] + r[3]) <= maxUnknown);
      if (ok) { from = rows[i][0]; break; }
    }
    const span = series[t].filter((r) => r[0] >= from && r[0] <= lastReliable);
    const unk = span.reduce((s, r) => s + r[3], 0);
    const all = span.reduce((s, r) => s + r[1] + r[2] + r[3], 0);
    out[t] = { from: from || (rows[0]?.[0] ?? 1990), unknownPct: pct(unk, all) };
  }
  return out;
}

function findings(series, filers, origin) {
  const out = [];
  const at = (rows, y) => rows.find((r) => r[0] === y);
  const share = (r) => (r ? pct(r[1], r[1] + r[2]) : 0);

  const p = series.patent;
  const a = at(p, 1995);
  const b = at(p, ORIGIN_SHARE_LAST_RELIABLE_YEAR);
  if (a && b) {
    out.push({
      sev: 'alert',
      title: 'Australian patenting fell while foreign filing nearly doubled',
      body: `Australian-origin patent applications went from ${a[1].toLocaleString()} in 1995 to ${b[1].toLocaleString()} in ${b[0]} — a fall in absolute terms, not just in share. Over the same years foreign filings into Australia rose from ${a[2].toLocaleString()} to ${b[2].toLocaleString()}. The Australian share of all patent filings dropped from ${share(a)}% to ${share(b)}%.`,
      view: 'divergence',
    });
  }

  const tm = series.trade_mark;
  const tmb = at(tm, ORIGIN_SHARE_LAST_RELIABLE_YEAR);
  if (tmb && b) {
    out.push({
      sev: 'info',
      title: 'Australians brand far more readily than they invent',
      body: `In ${tmb[0]}, ${share(tmb)}% of trade mark applications came from Australian applicants, against just ${share(b)}% of patent applications. Australia registers its own brands and imports its inventions.`,
      view: 'divergence',
    });
  }

  const auTop = filers.filter((f) => f.cc === 'au').slice(0, 3);
  if (auTop.length >= 2) {
    out.push({
      sev: 'info',
      title: `Australia's most prolific filer is ${auTop[0].name}`,
      body: `${auTop[0].name} has filed ${auTop[0].n.toLocaleString()} applications since ${auTop[0].y0}, ahead of ${auTop[1].name} (${auTop[1].n.toLocaleString()}). Filer groups merge registered-name variants — open a row to see exactly which names were combined.`,
      view: 'filers',
    });
  }

  const foreign = origin.countries.filter((c) => c.iso !== 'au' && c.iso !== 'zz');
  const top5 = foreign.slice(0, 5);
  if (top5.length === 5) {
    const sum = top5.reduce((s, c) => s + c.n, 0);
    const allForeign = foreign.reduce((s, c) => s + c.n, 0);
    out.push({
      sev: 'info',
      title: `Five countries supply ${pct(sum, allForeign)}% of all foreign filing`,
      body: `${top5.map((c) => c.name).join(', ')} together account for ${sum.toLocaleString()} of the ${allForeign.toLocaleString()} applications filed here by an applicant outside Australia, across ${foreign.length} countries in total.`,
      view: 'origin',
    });
  }

  const innov = [...subtypeByYear.entries()].filter(([k]) => k.startsWith('innovation|'))
    .map(([k, v]) => [Number(k.split('|')[1]), v]).sort((x, y) => x[0] - y[0]);
  const peak = innov.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  const last = innov.filter(([y]) => y >= 2023).reduce((s, r) => s + r[1], 0);
  if (peak[1] > 0) {
    out.push({
      sev: 'warn',
      title: 'The innovation patent is gone, and the data shows exactly when',
      body: `Innovation patents peaked at ${peak[1].toLocaleString()} filings in ${peak[0]}. They were closed to new applications on 26 August 2021, and only ${last.toLocaleString()} appear across 2023 onward. This cliff is legislative, not behavioural.`,
      view: 'lifecycle',
    });
  }

  return out;
}

function writeJson(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj));
  log(`  wrote ${name} — ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
}

// ──────────────────────────────────────────────────────────────────── main

async function main() {
  const t0 = Date.now();
  log('resolving IP RAPID from data.gov.au…');
  const pkg = await getJson(CKAN);
  const res = pkg.result.resources.find((r) => /iprapid\.zip$/i.test(r.url));
  if (!res) throw new Error('iprapid.zip resource not found in the CKAN package');
  const zipUrl = res.url;
  const sourceDate = (res.last_modified || pkg.result.metadata_modified || '').slice(0, 10);
  log(`  ${zipUrl}\n         last modified ${sourceDate}, licence ${pkg.result.license_id}`);
  if (pkg.result.license_id !== 'cc-by-4.0') fail(`licence changed to ${pkg.result.license_id} — do not republish without checking`);

  // Offsets move on every weekly rebuild upstream, so the directory is always
  // re-read rather than cached.
  const { size, entries } = await readCentralDirectory(zipUrl);
  log(`  archive ${(size / 1e9).toFixed(2)} GB, ${entries.length} members, ${(entries.reduce((s, e) => s + e.uncompSize, 0) / 1e9).toFixed(2)} GB uncompressed`);

  await passApplications(zipUrl, entries);
  await passParties(zipUrl, entries);
  await passClassifications(zipUrl, entries);

  log('building filer groups…');
  const filers = await buildFilers(600);
  log('building attorney firms…');
  const attorneys = await buildAttorneys(60, 24);

  // GATE 5 — filer groups must account for every founding applicant row that
  // carried a usable name.
  let namedRows = 0;
  for (const v of filerTotal.values()) namedRows += v;
  if (namedRows > partyStats.foundingApplicant) fail(`filer totals (${namedRows}) exceed founding applicant rows (${partyStats.foundingApplicant})`);

  log('fetching reference data…');
  const [pop, world] = await Promise.all([fetchPopulation(), fetchWorld()]);
  const names = countryNames(world);

  const series = yearSeries();

  // ── origin.json
  const ccTotals = new Map();
  for (const [k, v] of countryType) inc(ccTotals, k.split('|')[0], v);
  const decades = [];
  for (let d = 1900; d <= 2020; d += 10) decades.push(d);
  const countries = [...ccTotals.entries()].sort((a, b) => b[1] - a[1]).map(([iso, n]) => ({
    iso,
    name: names[iso] || iso.toUpperCase(),
    n,
    t: TYPES.map((t) => countryType.get(`${iso}|${t}`) || 0),
    d: decades.map((dd) => countryDecade.get(`${iso}|${dd}`) || 0),
  }));
  const origin = { decades, countries };

  // ── tech.json
  const fieldDecades = [];
  for (let d = 1980; d <= 2020; d += 10) fieldDecades.push(d);
  const fields = [...fieldTotal.entries()].sort((a, b) => b[1] - a[1]).map(([key, n]) => {
    const wf = parseWipoField(key);
    const au = fieldTotalAu.get(key) || 0;
    return {
      key,
      label: wf ? wf.label : key,
      rank: wf ? wf.rank : 99,
      n,
      au,
      d: fieldDecades.map((dd) => fieldDecade.get(`${key}|${dd}`) || 0),
      dAu: fieldDecades.map((dd) => fieldDecadeAu.get(`${key}|${dd}`) || 0),
    };
  });
  const totalField = fields.reduce((s, f) => s + f.n, 0);
  const totalFieldAu = fields.reduce((s, f) => s + f.au, 0);
  for (const f of fields) {
    // Specialisation: how much more (or less) of Australia's own patenting sits
    // in this field than of all patenting filed here. 0 = identical mix.
    f.spec = Math.round((pct(f.au, totalFieldAu) - pct(f.n, totalField)) * 10) / 10;
  }

  // ── brands.json
  const nice = [];
  for (let c = 1; c <= 45; c++) {
    const dom = niceOrigin.get(`${c}|domestic`) || 0;
    const forn = niceOrigin.get(`${c}|foreign`) || 0;
    const unk = (niceOrigin.get(`${c}|unknown`) || 0) + (niceOrigin.get(`${c}|none`) || 0);
    if (dom + forn + unk === 0) continue;
    nice.push({
      c, label: NICE_CLASSES[c], kind: NICE_KIND(c),
      n: dom + forn + unk, dom, forn, unk,
      d: decades.map((dd) => niceDecade.get(`${c}|${dd}`) || 0),
    });
  }

  // ── states.json
  const stateRows = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'].map((st) => {
    const t = TYPES.map((ty) => stateType.get(`${st}|${ty}`) || 0);
    const n = t.reduce((s, v) => s + v, 0);
    const yrs = [];
    for (let y = 1990; y <= 2026; y++) {
      const v = stateYear.get(`${st}|${y}`);
      if (v) yrs.push([y, v]);
    }
    return { st, n, t, pop: pop[st], per100k: Math.round((n / pop[st]) * 100000), series: yrs };
  }).sort((a, b) => b.n - a.n);

  const pcRows = sortedTop(postcode, 250).map(([pc, n]) => ({
    pc, n, t: TYPES.map((t) => postcodeType.get(`${pc}|${t}`) || 0),
  }));

  // ── lifecycle.json
  const lagDecades = [];
  for (let d = 1980; d <= 2020; d += 10) lagDecades.push(d);
  const lifecycle = {
    buckets: LAG_BUCKETS,
    lag: TYPES.map((t) => ({
      type: t,
      rows: lagDecades.map((d) => ({
        decade: d,
        v: LAG_BUCKETS.map((_, i) => grantLagBuckets.get(`${t}|${d}|${i}`) || 0),
      })).filter((r) => r.v.some((v) => v > 0)),
    })).filter((x) => x.rows.length),
    survival: TYPES.map((t) => ({
      type: t,
      cohorts: [1980, 1990, 2000, 2010].map((d) => {
        const size = cohortSize.get(`${t}|${d}`) || 0;
        if (!size) return null;
        const pts = [];
        for (let y = 1; y <= 20; y++) pts.push(pct(survival.get(`${t}|${d}|${y}`) || 0, size));
        return { decade: d, size, pts };
      }).filter(Boolean),
    })).filter((x) => x.cohorts.length),
    subtypeByYear: Object.fromEntries(Object.keys(PATENT_SUBTYPES).map((s) => [
      s,
      [...subtypeByYear.entries()].filter(([k]) => k.startsWith(`${s}|`))
        .map(([k, v]) => [Number(k.split('|')[1]), v]).sort((a, b) => a[0] - b[0]).filter(([y]) => y >= 1980),
    ])),
    summary: TYPES.map((t) => {
      const l = lifeByType.get(t);
      return l ? { type: t, filed: l.filed, registered: l.registered, medianLagDays: l.lagN ? Math.round(l.lagSum / l.lagN) : 0 } : null;
    }).filter(Boolean),
  };

  // ── core.json
  const core = {
    generated: new Date().toISOString(),
    sourceDate,
    sourceUrl: zipUrl,
    archiveBytes: size,
    archiveUncompressedBytes: entries.reduce((s, e) => s + e.uncompSize, 0),
    lastReliableOriginYear: ORIGIN_SHARE_LAST_RELIABLE_YEAR,
    originCoverage: originCoverage(series, ORIGIN_SHARE_LAST_RELIABLE_YEAR),
    totals: {
      applications: totals.rows,
      byType: Object.fromEntries(TYPES.map((t) => [t, totals.byType.get(t) || 0])),
      partyRows: partyStats.rows,
      foundingApplicants: partyStats.foundingApplicant,
      agentRows: partyStats.agentRows,
      classificationRows: classStats.rows,
      filerGroups: filerTotal.size,
      firms: firmTotal.size,
      noFilingDate: totals.noYear,
      redactedApplicants: partyStats.redactedApplicant,
      redactedAgents: partyStats.redactedAgent,
    },
    status: Object.fromEntries(TYPES.map((t) => [t, [...statusByType.entries()]
      .filter(([k]) => k.startsWith(`${t}|`))
      .map(([k, v]) => [k.split('|')[1], v]).sort((a, b) => b[1] - a[1])])),
    subtypes: Object.fromEntries(TYPES.map((t) => [t, [...totals.byTypeSub.entries()]
      .filter(([k]) => k.startsWith(`${t}|`))
      .map(([k, v]) => [k.split('|')[1], v]).sort((a, b) => b[1] - a[1])])),
    series,
    lifecycle,
  };
  core.findings = findings(series, filers, origin);

  fs.mkdirSync(OUT, { recursive: true });
  writeJson('core.json', core);
  writeJson('origin.json', origin);
  writeJson('tech.json', { decades: fieldDecades, fields });
  writeJson('filers.json', { filers });
  writeJson('attorneys.json', { firms: attorneys });
  writeJson('brands.json', { decades, nice });
  writeJson('states.json', { states: stateRows, postcodes: pcRows, popYear: 2024 });
  writeJson('world.geojson', world);

  fs.rmSync(TMP, { recursive: true, force: true });
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  process.stderr.write(`\n${err.stack || err}\n`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
