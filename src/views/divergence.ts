// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// The signature view. A mirrored area chart per right type: Australian-origin
// filings rise above the centre line, foreign filings fall below it.
//
// The form is chosen for the finding. A single stacked chart would hide that
// the two series move in OPPOSITE directions, and a share line would hide that
// the Australian fall is absolute rather than merely relative. Mirroring puts
// both facts in one shape, and small multiples let patents (diverging) sit
// beside trade marks (not diverging) without one scale crushing the other.

import type { IpData, RightType, SeriesRow } from '../types';
import { ORIGIN_COLOR, ORIGIN_SOFT } from '../colors';
import { RIGHT_LABEL, num, pct, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, legend, linear, ticks, pathFrom, areaFrom, svgOpen, jump, statRow } from './ui';

function multiple(type: RightType, rows: SeriesRow[], lastReliable: number, cov: { from: number; unknownPct: number }): string {
  // Each panel starts where that right's applicant-country field actually
  // became usable. Charting patents from 1980 — where 87% of records have no
  // recorded country — draws the field being back-filled and reads as a 715%
  // boom that never happened.
  const data = rows.filter((r) => r[0] >= cov.from);
  if (data.length < 3) return '';

  const W = 560;
  const H = 250;
  const M = { t: 16, r: 14, b: 26, l: 52 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const midY = M.t + ih / 2;
  const half = ih / 2;

  const y0 = data[0][0];
  const y1 = data[data.length - 1][0];
  const max = Math.max(1, ...data.map((r) => Math.max(r[1], r[2])));
  const x = linear(y0, y1, M.l, M.l + iw);
  const up = (v: number) => midY - (v / max) * half;
  const down = (v: number) => midY + (v / max) * half;

  const domPts = data.map((r) => [x(r[0]), up(r[1])] as [number, number]);
  const forPts = data.map((r) => [x(r[0]), down(r[2])] as [number, number]);

  const tickVals = ticks(0, max, 3).filter((t) => t > 0);
  const gridY = tickVals.map((t) => `
    <line class="ax-grid" x1="${M.l}" y1="${up(t).toFixed(1)}" x2="${M.l + iw}" y2="${up(t).toFixed(1)}"/>
    <line class="ax-grid" x1="${M.l}" y1="${down(t).toFixed(1)}" x2="${M.l + iw}" y2="${down(t).toFixed(1)}"/>
    <text class="ax-txt" x="${M.l - 6}" y="${(up(t) + 3).toFixed(1)}" text-anchor="end">${num(t)}</text>
    <text class="ax-txt" x="${M.l - 6}" y="${(down(t) + 3).toFixed(1)}" text-anchor="end">${num(t)}</text>`).join('');

  const xTicks = [];
  for (let yr = Math.ceil(y0 / 10) * 10; yr <= y1; yr += 10) {
    xTicks.push(`<text class="ax-txt" x="${x(yr).toFixed(1)}" y="${H - 8}" text-anchor="middle">${yr}</text>`);
  }

  // Years after the last reliable year are shaded: foreign filings for them are
  // still arriving through the PCT national phase, so the gap between the two
  // series there is an artefact of the extract date, not a real change.
  const provX = x(Math.max(y0, lastReliable + 0.5));
  // The label is anchored to the END of the band and right-aligned, so it can
  // never run off the SVG the way a left-anchored label does once the band is
  // only a few years wide.
  const provBand = lastReliable < y1
    ? `<rect x="${provX.toFixed(1)}" y="${M.t}" width="${(M.l + iw - provX).toFixed(1)}" height="${ih}" fill="#fbbf24" opacity="0.12"/>
       <line x1="${provX.toFixed(1)}" y1="${M.t}" x2="${provX.toFixed(1)}" y2="${M.t + ih}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3 3"/>
       <text class="ax-txt" x="${(M.l + iw).toFixed(1)}" y="${M.t + 11}" text-anchor="end" fill="#b45309" font-weight="600">provisional</text>`
    : '';

  const hover = data.map((r) => {
    const w = iw / Math.max(1, data.length - 1);
    const share = r[1] + r[2] > 0 ? pct(r[1], r[1] + r[2]) : '—';
    const flag = r[0] > lastReliable ? '\nProvisional: foreign filings for this year are still arriving.' : '';
    const tip = `${r[0]} — ${RIGHT_LABEL[type]}\nAustralian applicants: ${num(r[1])}\nForeign applicants: ${num(r[2])}\nAustralian share: ${share}${r[3] ? `\nOrigin not recorded: ${num(r[3])}` : ''}${flag}`;
    return `<rect class="mark" x="${(x(r[0]) - w / 2).toFixed(1)}" y="${M.t}" width="${w.toFixed(1)}" height="${ih}" fill="transparent" data-tip="${tipAttr(tip)}"/>`;
  }).join('');

  // Deltas run from a common 1995 baseline rather than each panel's own start
  // year. Measuring trade marks from 1958, when a few hundred were filed a
  // year, yields a true but useless "+6654%" that says more about the baseline
  // than about anything that happened.
  const baseYear = Math.max(data[0][0], 1995);
  const base = data.find((r) => r[0] === baseYear) ?? data[0];
  const lastRel = data.filter((r) => r[0] <= lastReliable).pop() ?? base;
  const domDelta = base[1] > 0 ? ((lastRel[1] - base[1]) / base[1]) * 100 : 0;
  const forDelta = base[2] > 0 ? ((lastRel[2] - base[2]) / base[2]) * 100 : 0;

  const unknownNote = cov.unknownPct >= 3
    ? `<span class="mult-warn">Applicant country is unrecorded for ${cov.unknownPct.toFixed(1)}% of these — excluded from both sides.</span>`
    : '';

  return `<figure class="mult">
    <figcaption>
      <strong>${RIGHT_LABEL[type]}</strong>
      <span>charted from ${data[0][0]} · ${base[0]}→${lastRel[0]}: Australian ${domDelta >= 0 ? '+' : '−'}${Math.abs(domDelta).toFixed(0)}%, foreign ${forDelta >= 0 ? '+' : '−'}${Math.abs(forDelta).toFixed(0)}%</span>
      ${unknownNote}
    </figcaption>
    <div class="chart chart-wide">
      ${svgOpen(W, H, `${RIGHT_LABEL[type]} filings by applicant origin, ${y0} to ${y1}`)}
        ${provBand}
        ${gridY}
        <path d="${areaFrom(domPts, midY)}" fill="${ORIGIN_SOFT.domestic}" opacity="0.85"/>
        <path d="${areaFrom(forPts, midY)}" fill="${ORIGIN_SOFT.foreign}" opacity="0.85"/>
        <path d="${pathFrom(domPts)}" fill="none" stroke="${ORIGIN_COLOR.domestic}" stroke-width="2"/>
        <path d="${pathFrom(forPts)}" fill="none" stroke="${ORIGIN_COLOR.foreign}" stroke-width="2"/>
        <line class="ax-line" x1="${M.l}" y1="${midY}" x2="${M.l + iw}" y2="${midY}" stroke-width="1.5"/>
        <text class="ax-txt" x="${M.l - 6}" y="${midY + 3}" text-anchor="end">0</text>
        ${xTicks.join('')}
        ${hover}
      </svg>
    </div>
  </figure>`;
}

export function mount(el: HTMLElement, data: IpData): void {
  const { series, lastReliableOriginYear: lr, originCoverage: cov } = data.core;
  const p = series.patent;
  const at = (y: number) => p.find((r) => r[0] === y);
  const a = at(1995);
  const b = at(lr);
  const shareA = a ? pct(a[1], a[1] + a[2], 1) : '—';
  const shareB = b ? pct(b[1], b[1] + b[2], 1) : '—';

  const tm = series.trade_mark.find((r) => r[0] === lr);

  el.innerHTML = `
    ${viewHead({
      title: 'The Divergence',
      question: 'Is Australia inventing less than it used to — or does it just look that way?',
      blurb: `Less, and it is not an illusion of share. Australian-origin patent filings have fallen in <em>absolute</em> numbers since the mid-1990s while foreign filings into Australia have roughly doubled. Trade marks did the opposite. Australian applicants rise above each centre line, foreign applicants fall below it.`,
    })}

    ${a && b ? statRow([
      { value: num(a[1]), label: 'Australian patent filings, 1995', tone: 'dom', tip: 'Applications where at least one founding applicant recorded an Australian address.' },
      { value: num(b[1]), label: `Australian patent filings, ${lr}`, tone: 'dom', sub: `${((b[1] - a[1]) / a[1] * 100).toFixed(0)}% on 1995` },
      { value: num(b[2]), label: `Foreign patent filings, ${lr}`, tone: 'for', sub: `+${((b[2] - a[2]) / a[2] * 100).toFixed(0)}% on 1995` },
      { value: `${shareA} → ${shareB}`, label: 'Australian share of patent filings', sub: `1995 → ${lr}` },
      ...(tm ? [{ value: pct(tm[1], tm[1] + tm[2], 1), label: `Australian share of trade marks, ${lr}`, tone: 'dom' as const, sub: 'against ' + shareB + ' for patents' }] : []),
    ]) : ''}

    ${card(
      'Filings by applicant origin',
      `One panel per right, each with its own vertical scale — plant breeder's rights number in the hundreds where trade marks number in the tens of thousands, so a shared scale would flatten three of the four to nothing. Each panel also <em>starts</em> in a different year: not when the right was created, but when its applicant-country field became usable.`,
      `<div class="mults">${(['patent', 'trade_mark', 'design', 'pbr'] as RightType[])
        .map((t) => multiple(t, series[t], lr, cov[t])).join('')}</div>
       ${legend([
        { color: ORIGIN_COLOR.domestic, label: 'Australian applicant (above the line)', tip: 'At least one founding applicant recorded an Australian address.' },
        { color: ORIGIN_COLOR.foreign, label: 'Foreign applicant (below the line)', tip: 'All founding applicants recorded an address outside Australia.' },
        { color: '#fde68a', label: `Provisional years (after ${lr})` },
      ])}`,
    )}

    <div class="note-band">
      <strong>Why the last few years are shaded.</strong> Foreign applicants mostly reach Australia through the ${gloss('pct')}, up to about 30 months after their priority date, while Australian ${gloss('provisional', 'provisional applications')} appear immediately. In this extract the Australian share of patent filings reads ${shareB} for ${lr} but ${pct(at(2025)?.[1] ?? 0, (at(2025)?.[1] ?? 0) + (at(2025)?.[2] ?? 1), 1)} for 2025 and ${pct(at(2026)?.[1] ?? 0, (at(2026)?.[1] ?? 0) + (at(2026)?.[2] ?? 1), 1)} for 2026 — a rise that is entirely an artefact of filings that have not arrived yet. Every share figure quoted on this site therefore stops at ${lr}.
    </div>

    ${card(
      'What counts as Australian',
      'Stated plainly, because the whole view turns on it.',
      `<p class="view-blurb"><strong>Where each panel starts.</strong> The applicant-country field was populated retrospectively, so before a certain year it is simply absent rather than missing at random — 87% of 1980 patents have no recorded country. Charting a split across those years draws the field being back-filled, not filings being made. Each panel therefore begins at the first year from which the unrecorded share stays below 30%: patents ${cov.patent.from}, trade marks ${cov.trade_mark.from}, designs ${cov.design.from}, plant breeder's rights ${cov.pbr.from}.</p>
       <p class="view-blurb" style="margin-top:10px">An application is counted as Australian-origin when <strong>any</strong> of its ${gloss('founding_applicant', 'founding applicants')} recorded an Australian address, and foreign when it has founding applicants but none in Australia. Joint Australian–foreign filings therefore count as Australian, which if anything flatters the Australian numbers — the decline is real in spite of that choice, not because of it. Filings whose applicant country was never recorded (${num(data.core.series.patent.reduce((s, r) => s + r[3], 0))} patents, almost all pre-1990) are excluded from share figures rather than assumed foreign.</p>
       <div class="jump-row">${jump('origin', 'See where the foreign filings come from')}${jump('technology', 'See which technologies Australia does file in')}</div>`,
    )}`;
}
