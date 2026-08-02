// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

import type { IpData, RightType } from '../types';
import { RIGHT_COLOR } from '../colors';
import { RIGHT_LABEL, num, compact, pct, bytes, isoDate, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, statRow, legend, linear, ticks, pathFrom, svgOpen, jump } from './ui';

const TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];

/** All four rights on one axis, indexed so a 122-year record stays legible. */
function totalChart(data: IpData): string {
  const W = 980;
  const H = 300;
  const M = { t: 18, r: 120, b: 30, l: 60 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const START = 1904;
  const END = 2026;

  const byType = TYPES.map((t) => {
    const rows = data.core.series[t].filter((r) => r[0] >= START && r[0] <= END);
    const m = new Map(rows.map((r) => [r[0], r[1] + r[2] + r[3]]));
    return { t, m };
  });
  const max = Math.max(1, ...byType.flatMap((s) => [...s.m.values()]));
  const x = linear(START, END, M.l, M.l + iw);
  const y = linear(0, max, M.t + ih, M.t);

  const grid = ticks(0, max, 5).map((v) => `
    <line class="ax-grid" x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 7}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${compact(v)}</text>`).join('');

  const xt = [];
  for (let yr = 1910; yr <= 2020; yr += 20) xt.push(`<text class="ax-txt" x="${x(yr).toFixed(1)}" y="${H - 10}" text-anchor="middle">${yr}</text>`);

  const lines = byType.map((s) => {
    const pts: [number, number][] = [];
    for (let yr = START; yr <= END; yr++) {
      const v = s.m.get(yr);
      if (v !== undefined) pts.push([x(yr), y(v)]);
    }
    if (!pts.length) return '';
    const last = pts[pts.length - 1];
    return `<path d="${pathFrom(pts)}" fill="none" stroke="${RIGHT_COLOR[s.t]}" stroke-width="2" stroke-linejoin="round"/>
      <text class="ax-txt" x="${(last[0] + 6).toFixed(1)}" y="${(y(s.m.get(END) ?? 0) + 3).toFixed(1)}" fill="${RIGHT_COLOR[s.t]}" font-weight="600">${RIGHT_LABEL[s.t]}</text>`;
  }).join('');

  const hover = [];
  for (let yr = START; yr <= END; yr++) {
    const parts = byType.map((s) => `${RIGHT_LABEL[s.t]}: ${num(s.m.get(yr) ?? 0)}`);
    hover.push(`<rect class="mark" x="${(x(yr) - iw / (END - START) / 2).toFixed(1)}" y="${M.t}" width="${(iw / (END - START)).toFixed(2)}" height="${ih}" fill="transparent" data-tip="${tipAttr(`${yr}\n${parts.join('\n')}`)}"/>`);
  }

  // 2026 is a part-year — the extract stops in July, so its drop is calendar,
  // not collapse.
  const partial = `<rect x="${x(2026).toFixed(1)}" y="${M.t}" width="${(M.l + iw - x(2026)).toFixed(1)}" height="${ih}" fill="#94a3b8" opacity="0.14"/>
    <text class="ax-txt" x="${(x(2026) - 4).toFixed(1)}" y="${M.t + 11}" text-anchor="end">2026 part-year</text>`;

  return `<div class="chart chart-xwide">${svgOpen(W, H, 'Applications filed per year by right type, 1904 to 2026')}
    ${partial}${grid}
    <line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>
    ${xt.join('')}${lines}${hover.join('')}
  </svg></div>`;
}

export function mount(el: HTMLElement, data: IpData): void {
  const { totals, sourceDate, lastReliableOriginYear: lr } = data.core;
  const patent = data.core.series.patent.find((r) => r[0] === lr);
  const tm = data.core.series.trade_mark.find((r) => r[0] === lr);
  const auFilers = data.filers.filter((f) => f.cc === 'au');

  el.innerHTML = `
    ${viewHead({
      title: 'Australia registers the world&rsquo;s brands. It has quietly stopped inventing.',
      question: 'What does the whole Australian intellectual property register actually say?',
      blurb: `Every ${gloss('patent')}, ${gloss('trade_mark', 'trade mark')}, ${gloss('design', 'registered design')} and ${gloss('pbr', "plant breeder's right")} ever filed in Australia — ${num(totals.applications)} applications from 1904 to 2026 — read out of IP Australia's ${gloss('ip_rapid')} release. The register is public but ships as a single ${bytes(data.core.archiveBytes)} archive that expands to ${bytes(data.core.archiveUncompressedBytes)}, which is why nobody reads it.`,
    })}

    ${statRow([
      { value: compact(totals.applications), label: 'Applications on the register', sub: '1904 → 2026', tip: `${num(totals.applications)} rows, every one of them accounted for.` },
      { value: compact(totals.byType.patent), label: 'Patents', tone: undefined, tip: `${num(totals.byType.patent)} patent applications.` },
      { value: compact(totals.byType.trade_mark), label: 'Trade marks', tip: `${num(totals.byType.trade_mark)} trade mark applications.` },
      ...(patent ? [{ value: pct(patent[1], patent[1] + patent[2], 1), label: `Patents from Australian applicants, ${lr}`, tone: 'for' as const, sub: 'down from 41.6% in 1995' }] : []),
      ...(tm ? [{ value: pct(tm[1], tm[1] + tm[2], 1), label: `Trade marks from Australian applicants, ${lr}`, tone: 'dom' as const, sub: 'Australians brand, not invent' }] : []),
      { value: compact(totals.filerGroups), label: 'Distinct filers', sub: `after merging name variants`, tip: 'Registered applicant names, combined into filer groups.' },
    ])}

    ${card(
      'Applications filed per year, all four rights',
      'Trade marks have grown almost without pause; patents plateaued twenty years ago. Hover any year for the exact counts.',
      `${totalChart(data)}
       ${legend(TYPES.map((t) => ({ color: RIGHT_COLOR[t], label: RIGHT_LABEL[t] })))}`,
    )}

    <h2 class="view-q" style="margin-top:26px">What the data shows</h2>
    <div class="findings">
      ${data.core.findings.map((f) => `
        <article class="finding finding-${f.sev}">
          <h3>${esc(f.title)}</h3>
          <p>${esc(f.body)}</p>
          <a href="#view=${esc(f.view)}">Open the ${esc(f.view)} view →</a>
        </article>`).join('')}
    </div>

    ${card(
      'How to read this site',
      'Four things worth knowing before you quote a number from it.',
      `<ul style="margin-left:18px;font-size:0.87rem;color:var(--text-secondary);display:grid;gap:8px">
        <li><strong>Everything is by filing year.</strong> Filing is the decision an applicant actually makes; grant is what an examiner does years later.</li>
        <li><strong>Only ${gloss('founding_applicant', 'founding applicants')} are counted.</strong> The register holds ${num(totals.partyRows)} party records against ${num(totals.applications)} applications because ownership changes hands. Counting every record would credit large corporates several times for one filing.</li>
        <li><strong>Share figures stop at ${lr}.</strong> The ${gloss('pct')} makes the most recent years look artificially Australian.</li>
        <li><strong>2026 is a part-year.</strong> The extract runs to ${isoDate(sourceDate)}.</li>
      </ul>
      <div class="jump-row">
        ${jump('divergence', 'The divergence')}
        ${jump('filers', `Who files most (${compact(auFilers.length)} Australian filers listed)`.replace(/\s*\(.*\)/, ''))}
        ${jump('attorneys', 'Which firms act for whom')}
      </div>`,
    )}`;
}
