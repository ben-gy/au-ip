// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Two forms, because there are two different questions.
//
// A matrix heatmap answers "what is patented here, and when did that change" —
// field against decade, so the rise of pharmaceuticals and the flatness of
// mechanical engineering are visible in one glance rather than 35 line charts.
//
// A diverging bar answers "what does AUSTRALIA patent" — and it has to diverge,
// because the finding is over- and under-indexing against a baseline. A ranked
// bar chart cannot express "less than expected"; it can only express "small".

import type { IpData, TechField } from '../types';
import { linearRamp, RAMP_SWATCHES, divergeColor, ORIGIN_COLOR } from '../colors';
import { num, compact, pct, signed, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, statRow, legend, linear, svgOpen, jump, seg, onSeg } from './ui';
import { attachSvgZoom } from '../utils/svgZoom';

function heatmap(fields: TechField[], decades: number[], mode: 'all' | 'au'): string {
  const rows = [...fields].sort((a, b) => (mode === 'au' ? b.au - a.au : b.n - a.n)).slice(0, 24);
  const cellW = 74;
  const cellH = 21;
  const labW = 208;
  const W = labW + decades.length * cellW + 74;
  const H = 30 + rows.length * cellH + 14;

  // Each row is scaled LINEARLY against its own maximum. Row-relative because
  // absolute volumes differ by two orders of magnitude between fields, so one
  // global scale leaves every row but pharmaceuticals blank; linear because the
  // spread within a row is only two- to fivefold, which a log ramp flattens
  // into a solid block of the darkest shade. The tooltip always gives the raw
  // count, so the colour only ever has to carry the shape.
  const cells = rows.map((f, ri) => {
    const vals = mode === 'au' ? f.dAu : f.d;
    const rowMax = Math.max(1, ...vals);
    const y = 30 + ri * cellH;
    const label = `<text class="ax-txt" x="${labW - 8}" y="${y + cellH / 2 + 3}" text-anchor="end" font-size="11">${esc(f.label)}</text>`;
    const boxes = vals.map((v, ci) => {
      const x = labW + ci * cellW;
      const tip = `${f.label} — ${decades[ci]}s\n${num(v)} ${mode === 'au' ? 'Australian-origin ' : ''}patent applications\n${pct(v, rowMax, 0)} of this field's busiest decade`;
      return `<rect class="mark" x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="2" fill="${linearRamp(v, rowMax)}" data-tip="${tipAttr(tip)}"/>`;
    }).join('');
    const total = mode === 'au' ? f.au : f.n;
    return `${label}${boxes}<text class="ax-txt" x="${labW + decades.length * cellW + 6}" y="${y + cellH / 2 + 3}" font-family="var(--font-mono)">${compact(total)}</text>`;
  }).join('');

  const heads = decades.map((d, i) => `<text class="ax-txt" x="${labW + i * cellW + (cellW - 2) / 2}" y="22" text-anchor="middle" font-weight="600">${d}s</text>`).join('');

  return `<div class="chart chart-xwide zoomable">${svgOpen(W, H, 'Patent applications by technology field and decade')}
    ${heads}<text class="ax-txt" x="${labW + decades.length * cellW + 6}" y="22" font-weight="600">Total</text>
    ${cells}
  </svg></div>`;
}

function specChart(fields: TechField[]): string {
  const rows = [...fields].filter((f) => f.au >= 300).sort((a, b) => b.spec - a.spec);
  const W = 780;
  const rowH = 20;
  const labW = 230;
  const H = 30 + rows.length * rowH + 10;
  const max = Math.max(...rows.map((f) => Math.abs(f.spec)), 1);
  const mid = labW + (W - labW - 90) / 2;
  const halfW = (W - labW - 90) / 2;
  const x = linear(-max, max, mid - halfW, mid + halfW);

  const bars = rows.map((f, i) => {
    const y = 30 + i * rowH;
    const xv = x(f.spec);
    const w = Math.abs(xv - mid);
    const tip = `${f.label}\n${pct(f.au, rows.reduce((s, r) => s + r.au, 0), 1)} of Australian-origin patenting\nagainst ${pct(f.n, rows.reduce((s, r) => s + r.n, 0), 1)} of all patenting filed in Australia\n${signed(f.spec)} percentage points ${f.spec >= 0 ? 'over' : 'under'}-indexed\n${num(f.au)} Australian applications of ${num(f.n)} total`;
    return `<text class="ax-txt" x="${labW - 8}" y="${y + rowH / 2 + 3}" text-anchor="end" font-size="11">${esc(f.label)}</text>
      <rect class="mark" x="${Math.min(mid, xv).toFixed(1)}" y="${y + 3}" width="${Math.max(1, w).toFixed(1)}" height="${rowH - 8}" rx="2" fill="${divergeColor(f.spec, max)}" stroke="${f.spec >= 0 ? ORIGIN_COLOR.domestic : ORIGIN_COLOR.foreign}" stroke-width="0.8" data-tip="${tipAttr(tip)}"/>
      <text class="ax-txt" x="${(f.spec >= 0 ? xv + 5 : xv - 5).toFixed(1)}" y="${y + rowH / 2 + 3}" text-anchor="${f.spec >= 0 ? 'start' : 'end'}" font-family="var(--font-mono)" font-size="10">${signed(f.spec)}</text>`;
  }).join('');

  return `<div class="chart chart-wide">${svgOpen(W, H, 'Australian specialisation by technology field')}
    <line class="ax-line" x1="${mid}" y1="24" x2="${mid}" y2="${H - 8}"/>
    <text class="ax-txt" x="${mid}" y="16" text-anchor="middle">same mix as everyone else</text>
    <text class="ax-txt" x="${mid + halfW}" y="16" text-anchor="end" fill="${ORIGIN_COLOR.domestic}" font-weight="600">Australia files here more →</text>
    <text class="ax-txt" x="${mid - halfW}" y="16" fill="${ORIGIN_COLOR.foreign}" font-weight="600">← less</text>
    ${bars}
  </svg></div>`;
}

export function mount(el: HTMLElement, data: IpData): void {
  const { fields, decades } = data.tech;
  const totalAll = fields.reduce((s, f) => s + f.n, 0);
  const totalAu = fields.reduce((s, f) => s + f.au, 0);
  const sorted = [...fields].sort((a, b) => b.spec - a.spec).filter((f) => f.au >= 300);
  const over = sorted[0];
  const under = sorted[sorted.length - 1];
  const topAll = [...fields].sort((a, b) => b.n - a.n)[0];
  const topAu = [...fields].sort((a, b) => b.au - a.au)[0];

  el.innerHTML = `
    ${viewHead({
      title: 'Technology',
      question: 'What gets patented in Australia — and is it the same as what Australians patent?',
      blurb: `No. Patenting <em>in</em> Australia is dominated by ${esc(topAll.label.toLowerCase())}; patenting <em>by</em> Australians leans towards ${esc(over.label.toLowerCase())}. Every patent is placed in one of the ${gloss('wipo35', '35 WIPO technology fields')} by its ${gloss('ipc', 'examiner-assigned classification')}.`,
    })}

    ${statRow([
      { value: compact(totalAll), label: 'Classified patent applications', sub: `across ${fields.length} technology fields` },
      { value: esc(topAll.label), label: 'Largest field overall', sub: `${pct(topAll.n, totalAll, 1)} of all patenting here` },
      { value: esc(topAu.label), label: 'Largest field for Australians', sub: `${pct(topAu.au, totalAu, 1)} of Australian-origin patenting` },
      { value: signed(over.spec), label: `Most over-indexed: ${esc(over.label)}`, tone: 'dom', sub: 'percentage points above the local baseline' },
      { value: signed(under.spec), label: `Most under-indexed: ${esc(under.label)}`, tone: 'for', sub: 'percentage points below' },
    ])}

    ${card(
      'What Australia is unusually good at filing',
      `Each bar is a field's share of Australian-origin patenting minus its share of all patenting filed in Australia. Zero means Australians file there at exactly the rate everyone else does. Fields with fewer than 300 Australian applications are omitted as too thin to read. See ${gloss('specialisation')}.`,
      specChart(fields),
    )}

    ${card(
      'Technology field by decade',
      'Each row is scaled against its own busiest decade, so a small field is still legible next to a huge one — hover for the raw counts. Drag to pan, scroll to zoom.',
      `<div class="ctl-row">${seg('mode', [{ id: 'all', label: 'All patents filed here' }, { id: 'au', label: 'Australian applicants only' }], 'all')}</div>
       <div data-heat>${heatmap(fields, decades, 'all')}</div>
       ${legend([
        { color: RAMP_SWATCHES[1], label: 'quiet decade for this field', tip: 'Shading is relative to the row, not to other rows — compare across a row, never down a column.' },
        { color: RAMP_SWATCHES[4], label: 'about half its busiest decade' },
        { color: RAMP_SWATCHES[8], label: 'this field&rsquo;s busiest decade' },
      ])}`,
    )}

    <div class="jump-row">${jump('divergence', 'How the Australian share fell')}${jump('filers', 'Who files in these fields')}${jump('brands', 'What Australia trade marks instead')}</div>`;

  const heatHost = el.querySelector('[data-heat]') as HTMLElement;
  let handle = attachSvgZoom(heatHost.querySelector('svg') as SVGSVGElement);
  onSeg(el, 'mode', (v) => {
    handle.destroy();
    heatHost.innerHTML = heatmap(fields, decades, v as 'all' | 'au');
    handle = attachSvgZoom(heatHost.querySelector('svg') as SVGSVGElement);
  });
}
