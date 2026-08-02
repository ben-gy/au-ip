// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

import type { IpData, Filer, RightType } from '../types';
import { RIGHT_COLOR, ORIGIN_COLOR } from '../colors';
import { RIGHT_LABEL, num, compact, pct, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, statRow, seg, onSeg, sortableTable, legend, linear, svgOpen, jump } from './ui';
import { openDrawer } from '../drawer';

const TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];

/** A filer's filings per year, as a small column chart. */
function portfolioChart(f: Filer): string {
  if (f.series.length < 2) return '<p>Too few filings to chart.</p>';
  const W = 490;
  const H = 150;
  const M = { t: 10, r: 8, b: 22, l: 34 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const y0 = f.series[0][0];
  const y1 = f.series[f.series.length - 1][0];
  const max = Math.max(...f.series.map((s) => s[1]));
  const x = linear(y0, y1, M.l, M.l + iw);
  const y = linear(0, max, M.t + ih, M.t);
  const bw = Math.max(1.5, iw / Math.max(1, y1 - y0) - 1);

  const bars = f.series.map(([yr, n]) => `<rect class="mark" x="${(x(yr) - bw / 2).toFixed(1)}" y="${y(n).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, M.t + ih - y(n)).toFixed(1)}" fill="${ORIGIN_COLOR.domestic}" opacity="0.85" data-tip="${tipAttr(`${yr}: ${num(n)} application${n === 1 ? '' : 's'}`)}"/>`).join('');

  const xt = [];
  const step = y1 - y0 > 40 ? 20 : y1 - y0 > 15 ? 10 : 5;
  for (let yr = Math.ceil(y0 / step) * step; yr <= y1; yr += step) xt.push(`<text class="ax-txt" x="${x(yr).toFixed(1)}" y="${H - 7}" text-anchor="middle">${yr}</text>`);

  return `<div class="chart">${svgOpen(W, H, `Applications per year`)}
    <line class="ax-grid" x1="${M.l}" y1="${y(max).toFixed(1)}" x2="${M.l + iw}" y2="${y(max).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 5}" y="${(y(max) + 3).toFixed(1)}" text-anchor="end">${max}</text>
    <line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>
    <text class="ax-txt" x="${M.l - 5}" y="${M.t + ih + 3}" text-anchor="end">0</text>
    ${bars}${xt.join('')}
  </svg></div>`;
}

export function openFiler(f: Filer, data: IpData): void {
  const total = f.n || 1;
  const peak = f.series.reduce((m, s) => (s[1] > m[1] ? s : m), [0, 0]);
  const recent = f.series.filter(([y]) => y >= 2015).reduce((s, r) => s + r[1], 0);
  const rank = data.filers.findIndex((x) => x.k === f.k) + 1;

  openDrawer(f.name, `
    <h3>Filing record</h3>
    <dl class="kv">
      <dt>Applications filed</dt><dd>${num(f.n)}</dd>
      <dt>Rank</dt><dd>#${rank} of ${num(data.filers.length)} listed</dd>
      <dt>Active</dt><dd>${f.y0}–${f.y1}</dd>
      <dt>Busiest year</dt><dd>${peak[0]} (${num(peak[1])})</dd>
      <dt>Since 2015</dt><dd>${num(recent)} · ${pct(recent, total, 0)} of all its filings</dd>
      <dt>Applicant country</dt><dd>${esc(f.cc ? f.cc.toUpperCase() : 'not recorded')}</dd>
      ${f.st ? `<dt>Australian state</dt><dd>${esc(f.st.toUpperCase())}</dd>` : ''}
      ${f.abn.length ? `<dt>ABN${f.abn.length > 1 ? 's' : ''}</dt><dd>${f.abn.map(esc).join(', ')}</dd>` : ''}
    </dl>

    <h3>Applications per year</h3>
    ${portfolioChart(f)}

    <h3>By right type</h3>
    <ul class="variant-list">
      ${TYPES.map((t, i) => f.t[i] ? `<li><span>${RIGHT_LABEL[t]}</span><span>${num(f.t[i])} · ${pct(f.t[i], total, 0)}</span></li>` : '').join('')}
    </ul>

    <h3>Registered names merged into this filer</h3>
    <p>IP Australia stores applicant names lowercased with punctuation stripped, so one organisation arrives under several spellings. This ${f.nVariants === 1 ? 'filer files under a single registered name' : `filer group combines ${num(f.nVariants)} registered names`}. Every merge is shown so you can judge it yourself.</p>
    <ul class="variant-list">
      ${f.variants.map(([nm, c]) => `<li><span>${esc(nm)}</span><span>${num(c)}</span></li>`).join('')}
      ${f.nVariants > f.variants.length ? `<li><span style="color:var(--text-tertiary)">…and ${num(f.nVariants - f.variants.length)} more, each with fewer filings</span><span>—</span></li>` : ''}
    </ul>
  `);
}

export function mount(el: HTMLElement, data: IpData): void {
  let origin: 'all' | 'au' | 'foreign' = 'all';
  let type: 'all' | RightType = 'all';
  let query = '';

  const filtered = (): Filer[] => data.filers.filter((f) => {
    if (origin === 'au' && f.cc !== 'au') return false;
    if (origin === 'foreign' && (f.cc === 'au' || !f.cc)) return false;
    if (type !== 'all' && !f.t[TYPES.indexOf(type)]) return false;
    if (query && !f.name.toLowerCase().includes(query) && !f.k.includes(query)) return false;
    return true;
  });

  const auTop = data.filers.filter((f) => f.cc === 'au');
  const forTop = data.filers.filter((f) => f.cc && f.cc !== 'au');

  el.innerHTML = `
    ${viewHead({
      title: 'Filers',
      question: 'Who actually files intellectual property in Australia?',
      blurb: `The ${num(data.filers.length)} largest ${gloss('filer_group', 'filer groups')}, out of ${num(data.core.totals.filerGroups)} distinct applicants on the register. Names are merged across the spellings each organisation files under — open any row to see exactly which names were combined and decide for yourself whether the merge is fair. A further ${num(data.core.totals.redactedApplicants)} applicant records are pseudonymised at source and cannot be attributed to anyone, so they are excluded here.`,
    })}

    ${statRow([
      { value: esc(auTop[0]?.name ?? '—'), label: "Australia's most prolific filer", tone: 'dom', sub: `${num(auTop[0]?.n ?? 0)} applications since ${auTop[0]?.y0 ?? '—'}` },
      { value: esc(forTop[0]?.name ?? '—'), label: 'Largest foreign filer', tone: 'for', sub: `${num(forTop[0]?.n ?? 0)} applications · ${esc((forTop[0]?.cc ?? '').toUpperCase())}` },
      { value: compact(data.core.totals.filerGroups), label: 'Distinct filers on the register' },
      { value: pct(data.filers.reduce((s, f) => s + f.n, 0), data.core.totals.foundingApplicants, 1), label: `Share of all filings held by these ${num(data.filers.length)}`, sub: 'the long tail is very long' },
    ])}

    ${card(
      'Search every listed filer',
      'Sort by any column. Click a row for the full portfolio, the year-by-year timeline and the registered names merged into it.',
      `<div class="ctl-row">
        <input type="search" data-q placeholder="Search filers — try CSIRO, Aristocrat, Apple…" aria-label="Search filers" style="min-width:min(300px,100%)" />
        ${seg('origin', [{ id: 'all', label: 'All' }, { id: 'au', label: 'Australian' }, { id: 'foreign', label: 'Foreign' }], 'all', 'Filter by applicant origin')}
        ${seg('type', [{ id: 'all', label: 'Any right' }, ...TYPES.map((t) => ({ id: t, label: RIGHT_LABEL[t] }))], 'all', 'Filter by right type')}
        <span class="ctl-note" data-count></span>
      </div>
      <div data-table></div>`,
    )}

    <div class="jump-row">${jump('attorneys', 'Which firms act for these filers')}${jump('technology', 'What they file about')}${jump('states', 'Where in Australia they sit')}</div>`;

  const tableHost = el.querySelector('[data-table]') as HTMLElement;
  const countHost = el.querySelector('[data-count]') as HTMLElement;

  const columns = [
    { key: 'rank', label: '#', num: true, render: (_f: Filer, i: number) => String(i + 1) },
    {
      key: 'name',
      label: 'Filer group',
      wide: true,
      sort: (f: Filer) => f.name,
      render: (f: Filer) => `<strong>${esc(f.name)}</strong>${f.nVariants > 1 ? ` <span style="color:var(--text-tertiary);font-size:0.72rem">${f.nVariants} names</span>` : ''}`,
    },
    {
      key: 'cc',
      label: 'Origin',
      sort: (f: Filer) => f.cc,
      render: (f: Filer) => f.cc === 'au'
        ? '<span class="pill pill-dom">AU</span>'
        : f.cc ? `<span class="pill pill-for">${esc(f.cc.toUpperCase())}</span>` : '<span class="pill pill-unk">—</span>',
    },
    { key: 'n', label: 'Applications', num: true, sort: (f: Filer) => f.n, render: (f: Filer) => num(f.n) },
    {
      key: 'mix',
      label: 'Right mix',
      wide: true,
      render: (f: Filer) => {
        const t = f.n || 1;
        return `<span style="display:inline-flex;width:120px;max-width:100%;border-radius:2px;overflow:hidden">${TYPES.map((ty, i) => f.t[i] ? `<span class="minibar" style="width:${(f.t[i] / t) * 100}%;background:${RIGHT_COLOR[ty]}" data-tip="${tipAttr(`${RIGHT_LABEL[ty]}: ${num(f.t[i])} (${pct(f.t[i], t, 1)})`)}"></span>` : '').join('')}</span>`;
      },
    },
    { key: 'y0', label: 'First', num: true, sort: (f: Filer) => f.y0, render: (f: Filer) => String(f.y0) },
    { key: 'y1', label: 'Latest', num: true, sort: (f: Filer) => f.y1, render: (f: Filer) => String(f.y1) },
  ];

  const rerender = sortableTable(tableHost, {
    rows: filtered(),
    columns,
    initialSort: 'n',
    clickable: true,
    rowKey: (f) => f.k,
    empty: 'No filer matches those filters.',
    onRowActivate: (k) => {
      const f = data.filers.find((x) => x.k === k);
      if (f) openFiler(f, data);
    },
  });

  const refresh = () => {
    const rows = filtered();
    rerender(rows);
    countHost.textContent = `${num(rows.length)} filer${rows.length === 1 ? '' : 's'}`;
  };
  refresh();

  onSeg(el, 'origin', (v) => { origin = v as typeof origin; refresh(); });
  onSeg(el, 'type', (v) => { type = v as typeof type; refresh(); });

  // 300 ms debounce: re-sorting 600 rows on every keystroke is wasted work.
  let timer: number | undefined;
  (el.querySelector('[data-q]') as HTMLInputElement).addEventListener('input', (e) => {
    window.clearTimeout(timer);
    const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
    timer = window.setTimeout(() => { query = v; refresh(); }, 300);
  });

  el.querySelector('[data-table]')?.insertAdjacentHTML('afterend', `<div>${legend(TYPES.map((t) => ({ color: RIGHT_COLOR[t], label: RIGHT_LABEL[t] })))}</div>`);
}
