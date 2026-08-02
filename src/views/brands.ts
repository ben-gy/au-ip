// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// What Australia trade marks, by Nice class.
//
// A treemap because the question is composition across 45 categories at once —
// a bar chart of 45 rows is a list, not a picture, and the eye cannot compare
// the goods half to the services half in it. Each tile is then split by origin,
// which is where the finding lives: the classes Australians dominate are
// services, and the classes foreigners dominate are technology and pharma.

import type { IpData, NiceRow } from '../types';
import { ORIGIN_COLOR, ORIGIN_SOFT } from '../colors';
import { num, compact, pct, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { squarify } from '../utils/squarify';
import { viewHead, card, statRow, legend, svgOpen, jump, seg, onSeg, sortableTable } from './ui';
import { openDrawer } from '../drawer';

type Mode = 'all' | 'goods' | 'services';

function treemap(rows: NiceRow[], mode: Mode): string {
  const data = (mode === 'all' ? rows : rows.filter((r) => r.kind === mode))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!data.length) return '<p class="view-blurb">No classes match.</p>';

  const W = 940;
  const H = 520;
  const rects = squarify(data.map((r) => r.n), W, H);

  const tiles = rects.map((rect) => {
    const r = data[rect.index];
    const known = r.dom + r.forn;
    const domShare = known > 0 ? r.dom / known : 0;
    // The tile is filled with the foreign tint and overlaid with an indigo
    // block proportional to the Australian share, so the split is a length the
    // eye can compare rather than a blended colour it cannot.
    const domH = rect.h * domShare;
    const tip = `Class ${r.c} — ${r.label}\n${num(r.n)} trade mark applications\nAustralian applicants: ${num(r.dom)} (${pct(r.dom, known, 1)})\nForeign applicants: ${num(r.forn)} (${pct(r.forn, known, 1)})${r.unk ? `\nOrigin not recorded: ${num(r.unk)}` : ''}\nClick for the full breakdown`;
    const showLabel = rect.w > 62 && rect.h > 30;
    const showSub = rect.w > 100 && rect.h > 48;
    return `<g class="mark-click" data-class="${r.c}" data-tip="${tipAttr(tip)}">
      <rect x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${Math.max(0, rect.w - 1.5).toFixed(1)}" height="${Math.max(0, rect.h - 1.5).toFixed(1)}" fill="${ORIGIN_SOFT.foreign}" stroke="#fff" stroke-width="1.5"/>
      <rect x="${rect.x.toFixed(1)}" y="${(rect.y + rect.h - domH).toFixed(1)}" width="${Math.max(0, rect.w - 1.5).toFixed(1)}" height="${Math.max(0, domH - 1.5).toFixed(1)}" fill="${ORIGIN_COLOR.domestic}" fill-opacity="0.72" stroke="none" pointer-events="none"/>
      ${showLabel ? `<text class="node-label" x="${(rect.x + 6).toFixed(1)}" y="${(rect.y + 15).toFixed(1)}" font-weight="600" pointer-events="none">${r.c}. ${esc(r.label.length > Math.floor(rect.w / 6.4) ? `${r.label.slice(0, Math.max(3, Math.floor(rect.w / 6.4)))}…` : r.label)}</text>` : ''}
      ${showSub ? `<text class="node-label" x="${(rect.x + 6).toFixed(1)}" y="${(rect.y + 30).toFixed(1)}" font-size="10" fill="var(--text-secondary)" pointer-events="none">${compact(r.n)} · ${pct(r.dom, r.dom + r.forn, 0)} AU</text>` : ''}
    </g>`;
  }).join('');

  return `<div class="chart chart-xwide">${svgOpen(W, H, 'Trade mark applications by Nice class')}${tiles}</svg></div>`;
}

export function mount(el: HTMLElement, data: IpData): void {
  const rows = data.brands.nice;
  const total = rows.reduce((s, r) => s + r.n, 0);
  const goods = rows.filter((r) => r.kind === 'goods').reduce((s, r) => s + r.n, 0);
  const known = rows.reduce((s, r) => s + r.dom + r.forn, 0);
  const dom = rows.reduce((s, r) => s + r.dom, 0);

  const byAu = [...rows].filter((r) => r.n > 20000).sort((a, b) => (b.dom / (b.dom + b.forn)) - (a.dom / (a.dom + a.forn)));
  const mostAu = byAu[0];
  const leastAu = byAu[byAu.length - 1];
  const biggest = [...rows].sort((a, b) => b.n - a.n)[0];

  el.innerHTML = `
    ${viewHead({
      title: 'Brands',
      question: 'What do Australians actually put a trade mark on?',
      blurb: `Every trade mark is registered against one or more of the 45 international ${gloss('nice', 'Nice classes')}. Tile area is applications; the indigo block inside each tile is the Australian share. The pattern is consistent — Australians dominate the service classes, foreign applicants dominate the technology and pharmaceutical ones.`,
    })}

    ${statRow([
      { value: compact(total), label: 'Class registrations', sub: 'one trade mark can cover several classes' },
      { value: pct(goods, total, 1), label: 'For goods (classes 1–34)', sub: `${pct(total - goods, total, 1)} for services` },
      { value: pct(dom, known, 1), label: 'From Australian applicants', tone: 'dom' },
      { value: `${mostAu.c}. ${esc(mostAu.label)}`, label: 'Most Australian class', tone: 'dom', sub: `${pct(mostAu.dom, mostAu.dom + mostAu.forn, 0)} Australian` },
      { value: `${leastAu.c}. ${esc(leastAu.label)}`, label: 'Least Australian class', tone: 'for', sub: `${pct(leastAu.dom, leastAu.dom + leastAu.forn, 0)} Australian` },
    ])}

    ${card(
      'Trade mark classes by volume and origin',
      `Largest class is ${biggest.c}. ${esc(biggest.label)} at ${num(biggest.n)}. Click any tile for its full history.`,
      `<div class="ctl-row">${seg('kind', [{ id: 'all', label: 'All 45 classes' }, { id: 'goods', label: 'Goods (1–34)' }, { id: 'services', label: 'Services (35–45)' }], 'all', 'Filter Nice classes')}</div>
       <div data-tree>${treemap(rows, 'all')}</div>
       ${legend([
        { color: ORIGIN_COLOR.domestic, label: 'Australian applicant (the filled block)' },
        { color: ORIGIN_SOFT.foreign, label: 'Foreign applicant (the remainder)' },
      ])}`,
    )}

    ${card('Every class', 'Sortable, including by how Australian each class is. Click a row for the same detail panel.', '<div data-table></div>')}

    <div class="jump-row">${jump('technology', 'What Australia patents instead')}${jump('divergence', 'Trade marks vs patents over time')}</div>`;

  const treeHost = el.querySelector('[data-tree]') as HTMLElement;
  const detail = (r: NiceRow) => {
    const k = r.dom + r.forn;
    openDrawer(`Class ${r.c} — ${r.label}`, `
      <h3>Applications</h3>
      <dl class="kv">
        <dt>Total</dt><dd>${num(r.n)}</dd>
        <dt>Rank</dt><dd>#${[...rows].sort((a, b) => b.n - a.n).findIndex((x) => x.c === r.c) + 1} of ${rows.length}</dd>
        <dt>Type</dt><dd>${r.kind === 'goods' ? 'Goods (classes 1–34)' : 'Services (classes 35–45)'}</dd>
        <dt>Australian applicants</dt><dd>${num(r.dom)} · ${pct(r.dom, k, 1)}</dd>
        <dt>Foreign applicants</dt><dd>${num(r.forn)} · ${pct(r.forn, k, 1)}</dd>
        ${r.unk ? `<dt>Origin not recorded</dt><dd>${num(r.unk)}</dd>` : ''}
      </dl>
      <h3>By decade of filing</h3>
      <ul class="variant-list">
        ${data.brands.decades.map((d, i) => r.d[i] ? `<li><span>${d}s</span><span>${num(r.d[i])}</span></li>` : '').join('')}
      </ul>
      <p style="margin-top:14px">A single trade mark may be registered in several classes, so class registrations total more than the ${num(data.core.totals.byType.trade_mark)} trade mark applications on the register.</p>
    `);
  };

  const wireTiles = () => {
    treeHost.querySelectorAll('[data-class]').forEach((g) => {
      (g as SVGElement).addEventListener('click', () => {
        const r = rows.find((x) => x.c === Number((g as HTMLElement).dataset.class));
        if (r) detail(r);
      });
    });
  };
  wireTiles();

  onSeg(el, 'kind', (v) => {
    treeHost.innerHTML = treemap(rows, v as Mode);
    wireTiles();
  });

  const tableHost = el.querySelector('[data-table]') as HTMLElement;
  sortableTable(tableHost, {
    rows,
    initialSort: 'n',
    clickable: true,
    rowKey: (r) => String(r.c),
    columns: [
      { key: 'c', label: 'Class', num: true, sort: (r) => r.c, render: (r) => String(r.c) },
      { key: 'label', label: 'Covers', wide: true, sort: (r) => r.label, render: (r) => `<strong>${esc(r.label)}</strong> <span class="pill ${r.kind === 'goods' ? 'pill-unk' : 'pill-dom'}">${r.kind}</span>` },
      { key: 'n', label: 'Applications', num: true, sort: (r) => r.n, render: (r) => num(r.n) },
      { key: 'au', label: 'Australian', num: true, sort: (r) => (r.dom + r.forn ? r.dom / (r.dom + r.forn) : 0), render: (r) => pct(r.dom, r.dom + r.forn, 1) },
      {
        key: 'split',
        label: 'Origin split',
        wide: true,
        render: (r) => {
          const k = r.dom + r.forn || 1;
          return `<span style="display:inline-flex;width:140px;max-width:100%;border-radius:2px;overflow:hidden">
            <span class="minibar" style="width:${(r.dom / k) * 100}%;background:${ORIGIN_COLOR.domestic}" data-tip="${tipAttr(`Australian: ${num(r.dom)}`)}"></span>
            <span class="minibar" style="width:${(r.forn / k) * 100}%;background:${ORIGIN_COLOR.foreign}" data-tip="${tipAttr(`Foreign: ${num(r.forn)}`)}"></span>
          </span>`;
        },
      },
    ],
    onRowActivate: (k) => {
      const r = rows.find((x) => x.c === Number(k));
      if (r) detail(r);
    },
  });
}
