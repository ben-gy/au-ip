// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Where in Australia the filers actually sit.
//
// The default here is deliberately the per-capita rate, not the raw count. A
// raw-count map of anything Australian is a map of where people live — NSW
// always wins, and the reader learns nothing. Only rate says something.

import L from 'leaflet';
import type { IpData, StateRow, RightType } from '../types';
import { linearRamp, RAMP_SWATCHES, ORIGIN_COLOR } from '../colors';
import { RIGHT_LABEL, STATE_LABEL, num, compact, pct, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { loadStateShapes } from '../data';
import { viewHead, card, statRow, legend, seg, onSeg, linear, svgOpen, jump } from './ui';
import { openDrawer } from '../drawer';

const TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];
const RECENT_FROM = 2015;
const RECENT_TO = 2024;

/** Filings in the last full decade — the honest numerator for a 2024 population. */
function recentOf(s: StateRow): number {
  return s.series.filter(([y]) => y >= RECENT_FROM && y <= RECENT_TO).reduce((a, r) => a + r[1], 0);
}

function ratePer100k(s: StateRow): number {
  return Math.round((recentOf(s) / s.pop) * 100000);
}

function trendChart(states: StateRow[]): string {
  const W = 880;
  const H = 300;
  const M = { t: 16, r: 62, b: 30, l: 52 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const Y0 = 1990;
  const Y1 = Math.max(Y0 + 1, ...states.flatMap((s) => s.series.map((r) => r[0])));
  const max = Math.max(1, ...states.flatMap((s) => s.series.filter(([y]) => y >= Y0 && y <= Y1).map((r) => r[1])));
  const x = linear(Y0, Y1, M.l, M.l + iw);
  const y = linear(0, max, M.t + ih, M.t);

  const palette = ['#4338ca', '#0f766e', '#d97706', '#be185d', '#7c3aed', '#65a30d', '#0284c7', '#b91c1c'];

  const lines = states.map((s, i) => {
    const rows = s.series.filter(([yr]) => yr >= Y0 && yr <= Y1);
    if (rows.length < 2) return '';
    const pts = rows.map((r) => [x(r[0]), y(r[1])] as [number, number]);
    const last = pts[pts.length - 1];
    const dots = rows.map((r) => `<circle class="mark" cx="${x(r[0]).toFixed(1)}" cy="${y(r[1]).toFixed(1)}" r="5" fill="transparent" data-tip="${tipAttr(`${STATE_LABEL[s.st]}, ${r[0]}\n${num(r[1])} applications from applicants in this state`)}"/>`).join('');
    return `<path d="${pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="2"/>
      <text class="ax-txt" x="${(last[0] + 6).toFixed(1)}" y="${(last[1] + 3).toFixed(1)}" fill="${palette[i % palette.length]}" font-weight="600">${s.st.toUpperCase()}</text>${dots}`;
  }).join('');

  const grid = [0, max / 2, max].map((v) => `<line class="ax-grid" x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${M.l + iw}" y2="${y(v).toFixed(1)}"/><text class="ax-txt" x="${M.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${compact(v)}</text>`).join('');
  const xt = [];
  for (let yr = 1990; yr <= 2020; yr += 10) xt.push(`<text class="ax-txt" x="${x(yr).toFixed(1)}" y="${H - 10}" text-anchor="middle">${yr}</text>`);

  return `<div class="chart chart-xwide">${svgOpen(W, H, 'Applications per year by applicant state')}
    ${grid}<line class="ax-line" x1="${M.l}" y1="${M.t + ih}" x2="${M.l + iw}" y2="${M.t + ih}"/>${xt.join('')}${lines}
  </svg></div>`;
}

export function mount(el: HTMLElement, data: IpData): (() => void) | void {
  let mode: 'rate' | 'total' = 'rate';
  const states = data.states.states;
  const ranked = [...states].sort((a, b) => ratePer100k(b) - ratePer100k(a));
  const totalAu = states.reduce((s, x) => s + x.n, 0);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  el.innerHTML = `
    ${viewHead({
      title: 'States',
      question: 'Which parts of Australia file intellectual property — once you allow for how many people live there?',
      blurb: `New South Wales files the most of everything, which tells you only that New South Wales is the biggest state. The map below defaults to the ${gloss('per_capita', 'rate per 100,000 people')} instead, using filings from ${RECENT_FROM}–${RECENT_TO} against ABS population for 2024. Only applicants who recorded an Australian address appear here.`,
    })}

    ${statRow([
      { value: num(totalAu), label: 'Applications from Australian addresses', sub: 'all years' },
      { value: `${best.st.toUpperCase()} ${num(ratePer100k(best))}`, label: `Highest rate per 100,000`, tone: 'dom', sub: `${STATE_LABEL[best.st]}, ${RECENT_FROM}–${RECENT_TO}` },
      { value: `${worst.st.toUpperCase()} ${num(ratePer100k(worst))}`, label: 'Lowest rate per 100,000', tone: 'for', sub: STATE_LABEL[worst.st] },
      { value: `${(ratePer100k(best) / Math.max(1, ratePer100k(worst))).toFixed(1)}×`, label: 'Gap between highest and lowest', tone: 'warn' },
      { value: num(data.states.postcodes.length), label: 'Postcodes ranked below' },
    ])}

    ${card(
      'Filing rate by state',
      'Click a state for its full profile. Scroll-wheel zoom is off so the page keeps scrolling.',
      `<div class="ctl-row">
        ${seg('mode', [{ id: 'rate', label: `Per 100,000 people (${RECENT_FROM}–${RECENT_TO})` }, { id: 'total', label: 'Total applications, all years' }], 'rate', 'Choose how to measure filing')}
      </div>
      <div class="map-wrap" data-map><div class="map-canvas"></div></div>
      <div data-map-legend></div>`,
    )}

    ${card(
      'State by state',
      `Rate uses ${RECENT_FROM}–${RECENT_TO} filings over 2024 population; totals cover the whole record back to 1904, which is why the two columns rank differently.`,
      `<div class="tbl-wrap"><table class="data"><thead><tr>
        <th class="num">#</th><th>State or territory</th><th class="num">Per 100,000</th><th class="num">${RECENT_FROM}–${RECENT_TO}</th><th class="num">All years</th><th class="num">Population</th><th>Right mix</th>
      </tr></thead><tbody>
      ${ranked.map((s, i) => `<tr class="clickable" data-row="${s.st}" tabindex="0">
        <td class="num">${i + 1}</td>
        <td class="wide"><strong>${esc(STATE_LABEL[s.st])}</strong></td>
        <td class="num">${num(ratePer100k(s))}</td>
        <td class="num">${num(recentOf(s))}</td>
        <td class="num">${num(s.n)}</td>
        <td class="num">${num(s.pop)}</td>
        <td><span style="display:inline-flex;width:120px;max-width:100%;border-radius:2px;overflow:hidden">${TYPES.map((ty, j) => s.t[j] ? `<span class="minibar" style="width:${(s.t[j] / s.n) * 100}%;background:${['#0f766e', '#7c3aed', '#be185d', '#65a30d'][j]}" data-tip="${tipAttr(`${RIGHT_LABEL[ty]}: ${num(s.t[j])} (${pct(s.t[j], s.n, 1)})`)}"></span>` : '').join('')}</span></td>
      </tr>`).join('')}
      </tbody></table></div>
      ${legend(TYPES.map((t, i) => ({ color: ['#0f766e', '#7c3aed', '#be185d', '#65a30d'][i], label: RIGHT_LABEL[t] })))}`,
    )}

    ${card('Filings per year by state', 'Absolute counts, so the lines mostly track population — but the shape of the 2000s trade mark boom differs by state.', trendChart(states))}

    ${card(
      'Top postcodes',
      `Where Australian applicants actually sit. Postcodes are only read for applicants whose country is recorded as Australia — the field also holds foreign postcodes, so an unfiltered read would put Japanese and American addresses on an Australian map.`,
      `<div class="tbl-wrap"><table class="data"><thead><tr><th class="num">#</th><th>Postcode</th><th class="num">Applications</th><th>Right mix</th></tr></thead><tbody>
        ${data.states.postcodes.slice(0, 60).map((p, i) => `<tr>
          <td class="num">${i + 1}</td><td><strong>${esc(p.pc)}</strong></td><td class="num">${num(p.n)}</td>
          <td><span style="display:inline-flex;width:120px;max-width:100%;border-radius:2px;overflow:hidden">${TYPES.map((ty, j) => p.t[j] ? `<span class="minibar" style="width:${(p.t[j] / p.n) * 100}%;background:${['#0f766e', '#7c3aed', '#be185d', '#65a30d'][j]}" data-tip="${tipAttr(`${RIGHT_LABEL[ty]}: ${num(p.t[j])}`)}"></span>` : '').join('')}</span></td>
        </tr>`).join('')}
      </tbody></table></div>`,
    )}

    <div class="jump-row">${jump('filers', 'The filers behind these states')}${jump('origin', 'How Australia compares to the world')}</div>`;

  const mapHost = el.querySelector('[data-map] .map-canvas') as HTMLElement;
  const legendHost = el.querySelector('[data-map-legend]') as HTMLElement;
  let map: L.Map | null = null;
  let layer: L.GeoJSON | null = null;
  let shapes: unknown = null;

  const valueOf = (st: string) => {
    const s = states.find((x) => x.st === st);
    if (!s) return 0;
    return mode === 'rate' ? ratePer100k(s) : s.n;
  };

  const detail = (s: StateRow) => {
    const rate = ratePer100k(s);
    openDrawer(STATE_LABEL[s.st], `
      <h3>Filing profile</h3>
      <dl class="kv">
        <dt>Applications, all years</dt><dd>${num(s.n)}</dd>
        <dt>Applications ${RECENT_FROM}–${RECENT_TO}</dt><dd>${num(recentOf(s))}</dd>
        <dt>Population (ABS, 2024)</dt><dd>${num(s.pop)}</dd>
        <dt>Rate per 100,000</dt><dd>${num(rate)}</dd>
        <dt>Rank by rate</dt><dd>#${ranked.findIndex((x) => x.st === s.st) + 1} of ${ranked.length}</dd>
        <dt>Share of Australian filings</dt><dd>${pct(s.n, totalAu, 1)}</dd>
      </dl>
      <h3>By right type</h3>
      <ul class="variant-list">
        ${TYPES.map((t, i) => s.t[i] ? `<li><span>${RIGHT_LABEL[t]}</span><span>${num(s.t[i])} · ${pct(s.t[i], s.n, 0)}</span></li>` : '').join('')}
      </ul>
      <h3>Busiest years</h3>
      <ul class="variant-list">
        ${[...s.series].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([y, n]) => `<li><span>${y}</span><span>${num(n)}</span></li>`).join('')}
      </ul>
    `);
  };

  const paintMap = () => {
    if (!shapes) return;
    if (!map) {
      map = L.map(mapHost, { minZoom: 2, maxZoom: 8, zoomControl: true, scrollWheelZoom: false });
      map.attributionControl.setPrefix(false);
    }
    const max = Math.max(...states.map((s) => (mode === 'rate' ? ratePer100k(s) : s.n)));
    if (layer) layer.remove();
    layer = L.geoJSON(shapes as never, {
      attribution: 'Boundaries: ABS ASGS (CC BY 4.0) · Population: ABS ERP 2024 · Data: IP Australia (CC BY 4.0)',
      style: (f) => {
        const code = String((f as never as { properties: { code?: string; name?: string } }).properties.code ?? '').toLowerCase();
        // Linear, not logarithmic: eight states spanning roughly fourfold is a
        // narrow range, and a log ramp paints them all the same indigo. (The
        // world map is the opposite case and does need log.)
        return { fillColor: linearRamp(valueOf(code), max), fillOpacity: 0.92, color: '#fff', weight: 1 };
      },
      onEachFeature: (f, lyr) => {
        const p = (f as never as { properties: { code?: string; name?: string } }).properties;
        const code = String(p.code ?? '').toLowerCase();
        const s = states.find((x) => x.st === code);
        lyr.bindTooltip(
          s
            ? `<b>${esc(STATE_LABEL[s.st] ?? p.name ?? code)}</b>${num(ratePer100k(s))} per 100,000 people<br>${num(recentOf(s))} applications ${RECENT_FROM}–${RECENT_TO}<br>${num(s.n)} all years`
            : `<b>${esc(p.name ?? code)}</b>No applicants recorded`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2.5, color: '#191833' }),
          mouseout: () => layer?.resetStyle(lyr as L.Path),
          click: () => { if (s) detail(s); },
        });
      },
    }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [12, 12] });
    legendHost.innerHTML = `<div class="legend">
      <span class="legend-item">${mode === 'rate' ? `Applications per 100,000 people, ${RECENT_FROM}–${RECENT_TO}` : 'Applications, all years'}</span>
      <span class="ramp">${RAMP_SWATCHES.map((s) => `<i style="background:${s}"></i>`).join('')}</span>
      <span class="legend-item" style="font-family:var(--font-mono);font-size:0.72rem">0 → ${num(max)}</span>
      <span class="legend-item" style="color:var(--text-tertiary)">linear scale</span>
    </div>`;
    requestAnimationFrame(() => map?.invalidateSize());
  };

  onSeg(el, 'mode', (v) => { mode = v as 'rate' | 'total'; paintMap(); });

  loadStateShapes().then((s) => { shapes = s; paintMap(); }).catch(() => {
    legendHost.innerHTML = '<p class="error">State boundaries could not be loaded. The table below carries the same numbers.</p>';
  });

  // This table is hand-rendered (not sortableTable), so it is bound once and
  // never repainted — safe.
  el.querySelectorAll('tr[data-row]').forEach((tr) => {
    const open = () => {
      const s = states.find((x) => x.st === (tr as HTMLElement).dataset.row);
      if (s) detail(s);
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') open(); });
  });

  void ORIGIN_COLOR;
  return () => { map?.remove(); map = null; layer = null; };
}
