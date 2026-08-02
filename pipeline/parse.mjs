// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Pure, dependency-free parsing and normalisation for the IP RAPID pipeline.
// Everything here is imported by BOTH pipeline/collect.mjs and tests/ — the
// tests must never have to pull in node:zlib or reach the network.

/** Split one CSV line, honouring RFC4180 double-quoting and doubled quotes. */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Build a {header: index} lookup so column order changes can't silently corrupt a run. */
export function headerIndex(headerLine, required) {
  const cols = splitCsvLine(headerLine).map((c) => c.trim().replace(/^﻿/, ''));
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });
  const missing = required.filter((r) => idx[r] === undefined);
  if (missing.length) throw new Error(`missing columns: ${missing.join(', ')} (saw: ${cols.join(',')})`);
  return idx;
}

/** Year from an ISO timestamp. Returns 0 for blank/garbage rather than NaN. */
export function yearOf(iso) {
  if (!iso || iso.length < 4) return 0;
  const y = Number(iso.slice(0, 4));
  return Number.isInteger(y) && y >= 1850 && y <= 2100 ? y : 0;
}

/** Whole days between two ISO timestamps, or null when either is absent/inverted. */
export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((b - a) / 86_400_000);
  return d < 0 ? null : d;
}

export const RIGHT_TYPES = ['patent', 'trade_mark', 'design', 'plant_breeders_right'];

export const VALID_STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];

/**
 * state_code is dirty — it contains the literal 'queensland' and even a raw
 * postcode ('5371'). Anything not on the whitelist is dropped, not guessed.
 */
export function cleanState(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (VALID_STATES.includes(s)) return s;
  const long = {
    'new south wales': 'nsw', victoria: 'vic', queensland: 'qld',
    'western australia': 'wa', 'south australia': 'sa', tasmania: 'tas',
    'australian capital territory': 'act', 'northern territory': 'nt',
  };
  return long[s] || '';
}

/**
 * post_code holds FOREIGN postcodes (a Japanese '4488671', DuPont's US '19898').
 * Only ever accept one when the applicant's country is Australia.
 */
export function cleanAuPostcode(raw, countryCode) {
  if ((countryCode || '').trim().toLowerCase() !== 'au') return '';
  const p = (raw || '').trim();
  return /^\d{4}$/.test(p) ? p : '';
}

/** Origin bucket. Blank country is its own bucket — never silently 'foreign'. */
export function originOf(countryCode) {
  const c = (countryCode || '').trim().toLowerCase();
  if (!c) return 'unknown';
  return c === 'au' ? 'domestic' : 'foreign';
}

// Legal-form tokens stripped from the end of a filer name, repeatedly.
// Order matters only in that multi-word forms must be tried before their parts.
const LEGAL_TAIL = [
  'pty ltd', 'pty limited', 'pty', 'proprietary limited', 'proprietary',
  'kabushiki kaisha', 'godo kaisha', 'yugen kaisha',
  'co ltd', 'co limited', 'company limited', 'limited', 'ltd', 'llc', 'llp', 'lp',
  'incorporated', 'inc', 'corporation', 'corp', 'company', 'co',
  'gmbh co kg', 'gmbh', 'ag', 'kg', 'kgaa', 'mbh', 'se',
  'nv', 'bv', 'cv', 'sa', 'sas', 'sarl', 'srl', 'spa', 'spr', 'sl',
  'ab', 'as', 'asa', 'oy', 'oyj', 'aps', 'plc', 'pte', 'bhd', 'sdn bhd',
  'trust', 'holdings', 'holding', 'group', 'ip',
];

// Trailing geographic qualifiers, stripped only when a real name remains.
const GEO_TAIL = ['australia', 'australasia', 'aust', 'anz', 'australia and new zealand', 'international', 'worldwide', 'global'];

/**
 * Normalise a filer name for entity merging.
 *
 * IP RAPID has already lowercased names and stripped punctuation, so
 * 'aristocrat technologies australia pty ltd' and
 * 'aristocrat technologies pty limited' arrive as distinct strings for what is
 * plainly one filer. We strip legal-form tails repeatedly, then at most one
 * geographic tail, and only ever when >= 2 meaningful tokens survive — so
 * 'australia post' and 'ip australia' are never reduced to nothing.
 */
export function normaliseFilerName(raw) {
  // Strip punctuation only — NOT everything outside a-z. An ASCII-only class
  // erases any name written in another script entirely: Hitachi
  // (株式会社日立製作所), Samsung (삼성전자주식회사) and every Cyrillic-named
  // applicant all normalised to the empty string, which dropped them from the
  // leaderboard and, worse, merged them into one nameless bucket downstream.
  let s = (raw || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  let changed = true;
  while (changed) {
    changed = false;
    for (const tail of LEGAL_TAIL) {
      if (s.endsWith(` ${tail}`)) {
        const next = s.slice(0, -(tail.length + 1)).trim();
        if (next.split(' ').length >= 1 && next.length >= 3) { s = next; changed = true; break; }
      }
    }
  }
  for (const g of GEO_TAIL) {
    if (s.endsWith(` ${g}`)) {
      const next = s.slice(0, -(g.length + 1)).trim();
      if (next.split(' ').length >= 2 || next.length >= 6) s = next;
      break;
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Some party names arrive as a pseudonymised token rather than a name — a
 * single letter followed by a 32-character hex digest, e.g.
 * "tf9028faec74be6ec9b852b0a542e2f39". These stand in for parties IP Australia
 * has redacted (overwhelmingly individuals rather than firms), and three of
 * them are large enough to rank above every real attorney firm but the top
 * five. Left in, the leaderboard's #6 entry is a hash.
 *
 * They are excluded from every ranking and counted in a named bucket instead,
 * so the total still reconciles and the site can say how much it set aside.
 */
export function isRedactedName(raw) {
  const s = (raw || '').trim().toLowerCase();
  return /^[a-z]?[0-9a-f]{24,}$/.test(s.replace(/[^a-z0-9]/g, ''));
}

/**
 * The merge key for a filer group.
 *
 * ABN is authoritative where present (it is matched to the Australian Business
 * Register upstream), but a single corporate group legitimately holds several
 * ABNs, so ABN alone still fragments. We therefore key on the normalised name
 * and treat ABN only as corroborating evidence surfaced in the drill-down.
 * Keying on party_id would be worse still: CSIRO alone spans six party_ids.
 */
export function filerKey(name) {
  return normaliseFilerName(name);
}

const ALWAYS_UPPER = new Set(['csiro', 'bhp', 'lg', 'nec', 'ibm', 'bp', 'ge', 'hp', 'amp', '3m', 'abb', 'sap', 'kfc', 'nab', 'anz', 'usa', 'uk', 'llc', 'plc', 'nv', 'bv', 'se', 'ag', 'srl', 'spa', 'dsm', 'basf', 'ici', 'rmit', 'unsw', 'qut', 'ansto', 'cea', 'cnrs', 'kaist', 'etri', 'tdk', 'nxp', 'amd', 'arm', 'ppg', 'akzo', 'jsr', 'ntt', 'kddi', 'sca', 'msd', 'gsk', 'bhc']);

// Legal forms read as shouting in ALL CAPS ('Aristocrat Technologies PTY LTD')
// but wrong in plain title case, so they get their own house style.
const LEGAL_CASE = {
  pty: 'Pty', ltd: 'Ltd', inc: 'Inc', gmbh: 'GmbH', kg: 'KG', kgaa: 'KGaA',
  sas: 'SAS', sarl: 'SARL', aps: 'ApS', oyj: 'Oyj', ab: 'AB', as: 'AS', sa: 'SA',
  bhd: 'Bhd', sdn: 'Sdn', pte: 'Pte', lp: 'LP', llp: 'LLP',
};

const LOWER_WORDS = new Set(['of', 'and', 'the', 'for', 'de', 'des', 'du', 'la', 'le', 'van', 'der', 'den', 'di', 'e']);

/** Presentable form of an all-lowercase, punctuation-stripped registered name. */
export function titleCaseName(raw) {
  const words = (raw || '').split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (ALWAYS_UPPER.has(w)) return w.toUpperCase();
      if (LEGAL_CASE[w]) return LEGAL_CASE[w];
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * classification_area carries TWO incompatible vocabularies, and which one you
 * are looking at depends on ip_right_type: named WIPO-35 technology fields for
 * patents ('16_pharmaceuticals'), and bare Nice class numbers for trade marks
 * ('9', '35'). Parsing one as the other silently invents categories.
 */
export function parseWipoField(area) {
  const m = /^(\d{1,2})_(.+)$/.exec((area || '').trim());
  if (!m) return null;
  return { rank: Number(m[1]), key: (area || '').trim(), label: prettyFieldLabel(m[2]) };
}

const FIELD_LABEL_FIX = {
  it_methods_for_management: 'IT methods for management',
  audio_visual_technology: 'Audio-visual technology',
  digital_communication: 'Digital communication',
  computer_technology: 'Computer technology',
  semiconductors: 'Semiconductors',
  micro_structural_and_nano_technology: 'Micro-structural & nanotechnology',
  basic_communication_processes: 'Basic communication processes',
  electrical_machinery_apparatus_energy: 'Electrical machinery & energy',
  medical_technology: 'Medical technology',
  organic_fine_chemistry: 'Organic fine chemistry',
  basic_materials_chemistry: 'Basic materials chemistry',
  materials_metallurgy: 'Materials & metallurgy',
  surface_technology_coating: 'Surface technology & coating',
  chemical_engineering: 'Chemical engineering',
  environmental_technology: 'Environmental technology',
  handling: 'Handling',
  machine_tools: 'Machine tools',
  engines_pumps_turbines: 'Engines, pumps & turbines',
  textile_and_paper_machines: 'Textile & paper machines',
  other_special_machines: 'Other special machines',
  thermal_processes_and_apparatus: 'Thermal processes & apparatus',
  mechanical_elements: 'Mechanical elements',
  transport: 'Transport',
  furniture_games: 'Furniture & games',
  other_consumer_goods: 'Other consumer goods',
  civil_engineering: 'Civil engineering',
  unknown: 'Unclassified',
};

export function prettyFieldLabel(slug) {
  if (FIELD_LABEL_FIX[slug]) return FIELD_LABEL_FIX[slug];
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Bare Nice class number, for trade mark classification rows only. */
export function parseNiceClass(area) {
  const s = (area || '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 45 ? n : null;
}

// WIPO Nice Classification, 12th edition — the 45 classes. Short display forms.
export const NICE_CLASSES = {
  1: 'Chemicals', 2: 'Paints & coatings', 3: 'Cosmetics & cleaning', 4: 'Fuels & lubricants',
  5: 'Pharmaceuticals', 6: 'Common metals', 7: 'Machines & machine tools', 8: 'Hand tools',
  9: 'Computers & electronics', 10: 'Medical apparatus', 11: 'Heating & lighting', 12: 'Vehicles',
  13: 'Firearms', 14: 'Jewellery & watches', 15: 'Musical instruments', 16: 'Paper & printed matter',
  17: 'Rubber & plastics', 18: 'Leather goods', 19: 'Building materials', 20: 'Furniture',
  21: 'Household utensils', 22: 'Ropes & textiles (raw)', 23: 'Yarns & threads', 24: 'Fabrics',
  25: 'Clothing & footwear', 26: 'Lace & trimmings', 27: 'Floor coverings', 28: 'Games & sporting goods',
  29: 'Meat, dairy & preserved food', 30: 'Staple foods', 31: 'Agriculture & live animals',
  32: 'Beers & soft drinks', 33: 'Alcoholic beverages', 34: 'Tobacco', 35: 'Advertising & business',
  36: 'Insurance & finance', 37: 'Construction & repair', 38: 'Telecommunications', 39: 'Transport & storage',
  40: 'Treatment of materials', 41: 'Education & entertainment', 42: 'Science & technology services',
  43: 'Food & accommodation', 44: 'Medical & agriculture services', 45: 'Legal & security services',
};

export const NICE_KIND = (n) => (n >= 35 ? 'services' : 'goods');

/**
 * Foreign applicants enter Australia via the PCT national phase ~30 months
 * after their priority date, so the most recent filing years undercount
 * foreign filings badly while domestic provisionals appear immediately. Any
 * origin-SHARE claim must stop here or it fabricates a domestic renaissance:
 * in the July 2026 extract the Australian share of patent filings reads 17.5%
 * (2022), 19.0% (2024), 24.9% (2025) and 33.0% (2026) — the last two are the
 * artefact, not a recovery.
 *
 * Later years are still charted, but banded and labelled as provisional.
 */
export const ORIGIN_SHARE_LAST_RELIABLE_YEAR = 2023;

/** Human label for a patent sub-type. */
export const PATENT_SUBTYPES = {
  standard_complete: 'Standard',
  provisional: 'Provisional',
  innovation: 'Innovation',
  petty: 'Petty (pre-2001)',
};

/**
 * Innovation patents were closed to new filings on 26 August 2021 (Intellectual
 * Property Laws Amendment (Productivity Commission Response Part 2 and Other
 * Measures) Act 2020). The cliff in the data is legislative, not behavioural.
 */
export const INNOVATION_PATENT_CLOSED = '2021-08-26';

/** Compact percentage helper used across the aggregates. */
export function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}
