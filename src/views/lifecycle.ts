// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Time-to-event, which no count-based form can express.
//
// A survival curve is the right shape for "how long does a right last": the
// question is not how many lapsed but WHEN, and a bar chart of lapse counts
// answers a different question. The grant-lag chart is a cumulative
// distribution for the same reason — "half are granted within N years" is the
// fact practitioners actually want.

import type { IpData, RightType } from '../types';
import { RIGHT_LABEL, num, days, pct, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, statRow, legend, linear, ticks, pathFrom, svgOpen, jump, seg, onSeg } from './ui';

const SUBTYPE_COLOR: Record<string, string> = {
  standard_complete: '#0f766e',
  provisional: '#4338ca',
  innovation: '#d97706',
  petty: '#94a3b8',
};
const SUBTYPE_LABEL: Record<string, string> = {
  standard_complete: 'Standard patents',
  provisional: 'Provisional applications',
  innovation: 'Innovation patents',
  petty: 'Petty patents',
};

/** Cumulative share granted within N days, per decade cohort. */
function lagChart(data: IpData, type: RightType): string {
  const entry = data.core.lifecycle.lag.find((l) => l.type === type);
  if (!entry || !entry.rows.length) return '<p class="view-blurb">No grant-timing data for this right.</p>';
  const buckets = data.core.lifecycle.buckets;

  const W = 720;
  const H = 300;
  const M = { t: 16, r: 130, b: 40, l: 46 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = linear(0, buckets.length - 1, M.l, M.l + iw);
  const y = linear(0, 100, M.t + ih, M.t);

  const grid = ticks(0, 100, 5).map((v) => `
    <line class="ax-grid" x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}%</text>`).join('');

  const xt = buckets.map((b, i) => `<text class="ax-txt" x="${x(i).toFixed(1)}" y="${H - 22}" text-anchor="middle">${b === 0 ? '0' : b >= 365 ? `${(b / 365).toFixed(b % 365 ? 1 : 0)}y` : `${b}d`}</text>`).join('');

  const lines = entry.rows.map((r) => {
    const total = r.v.reduce((s, v) => s + v, 0) || 1;
    let cum = 0;
    const pts: [number, number][] = r.v.map((v, i) => {
      cum += v;
      return [x(i), y((cum / total) * 100)];
    });
    const colour = ['#c7d2fe', '#a5b4fc', '#818cf8', '#4f46e5', '#3730a3'][Math.max(0, Math.min(4, (r.decade - 1980) / 10))];
    const dots = r.v.map((_, i) => {
      let c = 0;
      for (let j = 0; j <= i; j++) c += r.v[j];
      const tip = `${r.decade}s ${RIGHT_LABEL[type].toLowerCase()}\nWithin ${buckets[i] === 0 ? 'the same day' : days(buckets[i])} of filing: ${pct(c, total, 1)} registered\n${num(total)} in this cohort`;
      return `<circle class="mark" cx="${x(i).toFixed(1)}" cy="${y((c / total) * 100).toFixed(1)}" r="7" fill="transparent" data-tip="${tipAttr(tip)}"/>`;
    }).join('');
    const last = pts[pts.length - 1];
    return `<path d="${pathFrom(pts)}" fill="none" stroke="${colour}" stroke-width="2.2"/>
      <text class="ax-txt" x="${(last[0] + 8).toFixed(1)}" y="${(last[1] + 3).toFixed(1)}" fill="${colour}" font-weight="600">${r.decade}s</text>${dots}`;
  }).join('');

  return `<div class="chart chart-wide">${svgOpen(W, H, `Time from filing to registration, ${RIGHT_LABEL[type]}`)}
    ${grid}
    <line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>
    ${xt}
    <text class="ax-title" x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle">time from filing</text>
    ${lines}
  </svg></div>`;
}

function survivalChart(data: IpData, type: RightType): string {
  const entry = data.core.lifecycle.survival.find((s) => s.type === type);
  if (!entry || !entry.cohorts.length) return '<p class="view-blurb">No survival data for this right.</p>';

  const W = 720;
  const H = 300;
  const M = { t: 16, r: 130, b: 40, l: 46 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = linear(1, 20, M.l, M.l + iw);
  const y = linear(0, 100, M.t + ih, M.t);

  const grid = ticks(0, 100, 5).map((v) => `
    <line class="ax-grid" x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}%</text>`).join('');

  const xt = [];
  for (let n = 5; n <= 20; n += 5) xt.push(`<text class="ax-txt" x="${x(n).toFixed(1)}" y="${H - 22}" text-anchor="middle">${n}y</text>`);

  const lines = entry.cohorts.map((c) => {
    const pts: [number, number][] = c.pts.map((p, i) => [x(i + 1), y(p)]);
    const colour = ['#c7d2fe', '#818cf8', '#4f46e5', '#3730a3'][Math.max(0, Math.min(3, (c.decade - 1980) / 10))];
    const dots = c.pts.map((p, i) => `<circle class="mark" cx="${x(i + 1).toFixed(1)}" cy="${y(p).toFixed(1)}" r="7" fill="transparent" data-tip="${tipAttr(`${c.decade}s ${RIGHT_LABEL[type].toLowerCase()}\n${p.toFixed(1)}% still in force ${i + 1} year${i ? 's' : ''} after taking effect\ncohort of ${num(c.size)}`)}"/>`).join('');
    const last = pts[pts.length - 1];
    return `<path d="${pathFrom(pts)}" fill="none" stroke="${colour}" stroke-width="2.2"/>
      <text class="ax-txt" x="${(last[0] + 8).toFixed(1)}" y="${(last[1] + 3).toFixed(1)}" fill="${colour}" font-weight="600">${c.decade}s</text>${dots}`;
  }).join('');

  return `<div class="chart chart-wide">${svgOpen(W, H, `Share of ${RIGHT_LABEL[type]} still in force over time`)}
    ${grid}
    <line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>
    ${xt.join('')}
    <text class="ax-title" x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle">years after the right took effect</text>
    ${lines}
  </svg></div>`;
}

/** The innovation-patent cliff — a legislative event, visible in the data. */
function subtypeChart(data: IpData): string {
  const st = data.core.lifecycle.subtypeByYear;
  const keys = Object.keys(SUBTYPE_LABEL).filter((k) => (st[k] ?? []).length);
  const W = 880;
  const H = 300;
  const M = { t: 18, r: 140, b: 32, l: 52 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const Y0 = 1980;
  const Y1 = 2026;
  const max = Math.max(1, ...keys.flatMap((k) => (st[k] ?? []).map((r) => r[1])));
  const x = linear(Y0, Y1, M.l, M.l + iw);
  const y = linear(0, max, M.t + ih, M.t);

  const grid = ticks(0, max, 4).map((v) => `
    <line class="ax-grid" x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`).join('');

  const xt = [];
  for (let yr = 1980; yr <= 2020; yr += 10) xt.push(`<text class="ax-txt" x="${x(yr).toFixed(1)}" y="${H - 12}" text-anchor="middle">${yr}</text>`);

  const lines = keys.map((k) => {
    const rows = (st[k] ?? []).filter((r) => r[0] >= Y0 && r[0] <= Y1);
    if (rows.length < 2) return '';
    const pts: [number, number][] = rows.map((r) => [x(r[0]), y(r[1])]);
    const last = pts[pts.length - 1];
    const dots = rows.map((r) => `<circle class="mark" cx="${x(r[0]).toFixed(1)}" cy="${y(r[1]).toFixed(1)}" r="6" fill="transparent" data-tip="${tipAttr(`${SUBTYPE_LABEL[k]}, ${r[0]}\n${num(r[1])} applications`)}"/>`).join('');
    return `<path d="${pathFrom(pts)}" fill="none" stroke="${SUBTYPE_COLOR[k]}" stroke-width="2.2"/>
      <text class="ax-txt" x="${(last[0] + 7).toFixed(1)}" y="${(last[1] + 3).toFixed(1)}" fill="${SUBTYPE_COLOR[k]}" font-weight="600">${SUBTYPE_LABEL[k].split(' ')[0]}</text>${dots}`;
  }).join('');

  const cliff = x(2021.65);
  return `<div class="chart chart-xwide">${svgOpen(W, H, 'Patent applications by sub-type, 1980 to 2026')}
    ${grid}
    <line x1="${cliff.toFixed(1)}" y1="${M.t}" x2="${cliff.toFixed(1)}" y2="${M.t + ih}" stroke="${SUBTYPE_COLOR.innovation}" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text class="ax-txt" x="${(cliff - 6).toFixed(1)}" y="${M.t + 12}" text-anchor="end" fill="${SUBTYPE_COLOR.innovation}" font-weight="600">26 Aug 2021 — innovation patent closed</text>
    <line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>
    ${xt.join('')}${lines}
  </svg></div>`;
}

export function mount(el: HTMLElement, data: IpData): void {
  let type: RightType = 'patent';
  const summary = data.core.lifecycle.summary;
  const patSum = summary.find((s) => s.type === 'patent');
  const tmSum = summary.find((s) => s.type === 'trade_mark');
  const innov = data.core.lifecycle.subtypeByYear.innovation ?? [];
  const peak = innov.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  const after = innov.filter(([y]) => y >= 2023).reduce((s, r) => s + r[1], 0);

  el.innerHTML = `
    ${viewHead({
      title: 'Lifecycle',
      question: 'How long does an Australian right take to grant — and how long does anyone keep it?',
      blurb: `Counting applications says nothing about time. These are time-to-event curves: how quickly rights are registered after filing, and what share are still in force years later. Most rights do not run their full term — holders stop paying renewal fees, and that ${gloss('lapse', 'lapse')} is a commercial verdict on whether the right was worth having.`,
    })}

    ${statRow([
      ...(patSum ? [{ value: days(patSum.medianLagDays), label: 'Mean filing-to-grant, patents', sub: `${num(patSum.registered)} of ${num(patSum.filed)} reached registration` }] : []),
      ...(tmSum ? [{ value: days(tmSum.medianLagDays), label: 'Mean filing-to-registration, trade marks' }] : []),
      { value: num(peak[1]), label: `Innovation patents at their peak (${peak[0]})`, tone: 'warn' },
      { value: num(after), label: 'Innovation patents filed 2023 onward', tone: 'bad', sub: 'the right was abolished' },
    ])}

    ${card(
      'The innovation patent, and its abolition',
      `Australia ran a second-tier patent from 2001: eight years, a lower ${gloss('innovation_patent', 'threshold')}, popular with small filers. The Productivity Commission found it did not help them, and it closed to new applications on 26 August 2021. The cliff is legislative — nothing changed about Australian inventiveness on that date.`,
      `${subtypeChart(data)}
       ${legend(Object.keys(SUBTYPE_LABEL).map((k) => ({ color: SUBTYPE_COLOR[k], label: SUBTYPE_LABEL[k] })))}`,
    )}

    <div class="ctl-row">
      <span class="sel-lab">Right type</span>
      ${seg('type', (['patent', 'trade_mark', 'design'] as RightType[]).map((t) => ({ id: t, label: RIGHT_LABEL[t] })), 'patent')}
    </div>

    ${card(
      'How long until it is granted',
      'Cumulative share registered within a given time of filing, one line per decade of filing. A line that shifts right means the office got slower — or that applicants started deferring examination.',
      `<div data-lag>${lagChart(data, 'patent')}</div>`,
    )}

    ${card(
      'How long it survives',
      'Of the rights that came into force, the share still in force N years later. Falling curves are renewal fees not being paid.',
      `<div data-surv>${survivalChart(data, 'patent')}</div>
       <p class="ctl-note" style="margin-top:10px">Only cohorts from the 1980s to the 2010s are shown — a right filed in 2020 has not yet had the chance to survive twenty years, and including it would fake a rise.</p>`,
    )}

    <div class="jump-row">${jump('divergence', 'Who is filing them')}${jump('technology', 'What they cover')}</div>`;

  onSeg(el, 'type', (v) => {
    type = v as RightType;
    (el.querySelector('[data-lag]') as HTMLElement).innerHTML = lagChart(data, type);
    (el.querySelector('[data-surv]') as HTMLElement).innerHTML = survivalChart(data, type);
  });
}
