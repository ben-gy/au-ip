// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Where the intellectual property filed in Australia actually comes from.
// Leaflet + real Natural Earth polygons; the ramp is logarithmic because the
// distribution is brutally skewed (the United States alone out-files the next
// twenty countries combined) and a linear scale would paint the world one
// colour.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { IpData, Country, RightType } from '../types';
import { logRamp, logRampBreaks, RAMP_SWATCHES } from '../colors';
import { RIGHT_LABEL, num, compact, pct, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { loadWorld } from '../data';
import { viewHead, card, statRow, seg, onSeg, sortableTable, jump } from './ui';
import { openDrawer } from '../drawer';

type Filter = 'all' | RightType;

export function mount(el: HTMLElement, data: IpData): (() => void) | void {
  let filter: Filter = 'all';
  let decadeIx = -1; // -1 = all time
  const decades = data.origin.decades;
  const TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];

  const valueOf = (c: Country): number => {
    if (decadeIx >= 0) {
      // Per-decade counts are stored across all right types only, so a decade
      // slice cannot also be sliced by type. The control disables itself rather
      // than quietly returning the wrong number.
      return c.d[decadeIx] ?? 0;
    }
    return filter === 'all' ? c.n : c.t[TYPES.indexOf(filter)] ?? 0;
  };

  const rows = () => data.origin.countries
    .filter((c) => c.iso !== 'zz' && valueOf(c) > 0)
    .map((c) => ({ ...c, v: valueOf(c) }))
    .sort((a, b) => b.v - a.v);

  el.innerHTML = `
    ${viewHead({
      title: 'Origin',
      question: 'Whose intellectual property is Australia actually registering?',
      blurb: `Every application is attributed to the country its ${gloss('founding_applicant', 'founding applicant')} recorded. Colour runs on a logarithmic scale — on a linear one the United States would be the only country you could see.`,
    })}
    <div class="ctl-row">
      ${seg('type', [{ id: 'all', label: 'All rights' }, ...TYPES.map((t) => ({ id: t, label: RIGHT_LABEL[t] }))], 'all', 'Filter by right type')}
      <label class="year-ctl">
        <span class="sel-lab">Era</span>
        <input type="range" min="-1" max="${decades.length - 1}" value="-1" data-decade aria-label="Filter by decade" />
        <strong data-decade-lab style="font-family:var(--font-mono);min-width:5.5em;display:inline-block">All time</strong>
      </label>
      <span class="ctl-note" data-decade-note></span>
    </div>
    <div data-stats></div>
    ${card('Applicant country', 'Click any country for its filing profile. Scroll-wheel zoom is off so the page keeps scrolling; use the +/− buttons or pinch.', '<div class="map-wrap" data-map><div class="map-canvas"></div></div><div data-map-legend></div>')}
    ${card('Every applicant country', 'Sortable. Click a row to open the same detail panel as the map.', '<div data-table></div>')}
    <div class="jump-row">${jump('divergence', 'Why the Australian share matters')}${jump('filers', 'The filers behind these countries')}</div>`;

  const statsHost = el.querySelector('[data-stats]') as HTMLElement;
  const tableHost = el.querySelector('[data-table]') as HTMLElement;
  const legendHost = el.querySelector('[data-map-legend]') as HTMLElement;
  const mapHost = el.querySelector('[data-map] .map-canvas') as HTMLElement;

  const detail = (c: Country) => {
    const total = c.n || 1;
    openDrawer(c.name, `
      <h3>Filing profile</h3>
      <dl class="kv">
        <dt>Applications filed in Australia</dt><dd>${num(c.n)}</dd>
        <dt>Share of all filings</dt><dd>${pct(c.n, data.origin.countries.reduce((s, x) => s + (x.iso === 'zz' ? 0 : x.n), 0), 2)}</dd>
        <dt>ISO code</dt><dd>${esc(c.iso.toUpperCase())}</dd>
      </dl>
      <h3>By right type</h3>
      <ul class="variant-list">
        ${TYPES.map((t, i) => `<li><span>${RIGHT_LABEL[t]}</span><span>${num(c.t[i])} · ${pct(c.t[i], total, 0)}</span></li>`).join('')}
      </ul>
      <h3>By decade of filing</h3>
      <ul class="variant-list">
        ${decades.map((d, i) => c.d[i] ? `<li><span>${d}s</span><span>${num(c.d[i])}</span></li>` : '').join('') || '<li><span>No decade breakdown available</span><span>—</span></li>'}
      </ul>
      <p style="margin-top:14px">Decade totals cover all four right types together.</p>
    `);
  };

  let update = () => {};
  let map: L.Map | null = null;
  let layer: L.GeoJSON | null = null;

  const paintStats = () => {
    const r = rows();
    const total = r.reduce((s, c) => s + c.v, 0);
    const au = r.find((c) => c.iso === 'au');
    const top = r.filter((c) => c.iso !== 'au').slice(0, 5);
    const label = decadeIx >= 0 ? `${decades[decadeIx]}s` : filter === 'all' ? 'all time' : RIGHT_LABEL[filter as RightType];
    statsHost.innerHTML = statRow([
      { value: num(total), label: `Applications with a recorded country (${label})` },
      { value: au ? pct(au.v, total, 1) : '—', label: 'From Australian applicants', tone: 'dom' },
      { value: pct(top.reduce((s, c) => s + c.v, 0), total, 1), label: 'From the top five foreign countries', tone: 'for', sub: top.map((c) => c.iso.toUpperCase()).join(' · ') },
      { value: num(r.length), label: 'Countries represented' },
    ]);
  };

  const paintTable = () => {
    const r = rows();
    sortableTable(tableHost, {
      rows: r,
      clickable: true,
      rowKey: (c) => c.iso,
      initialSort: 'v',
      columns: [
        { key: 'rank', label: '#', num: true, render: (_c, i) => String(i + 1) },
        { key: 'name', label: 'Country', wide: true, sort: (c) => c.name, render: (c) => `<strong>${esc(c.name)}</strong> <span style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:0.75rem">${esc(c.iso.toUpperCase())}</span>` },
        { key: 'v', label: 'Applications', num: true, sort: (c) => c.v, render: (c) => num(c.v) },
        {
          key: 'mix',
          label: 'Right mix',
          wide: true,
          render: (c) => {
            const t = c.n || 1;
            return `<span style="display:inline-flex;width:130px;max-width:100%;border-radius:2px;overflow:hidden">${TYPES.map((ty, i) => c.t[i] ? `<span class="minibar" style="width:${(c.t[i] / t) * 100}%;background:${['#0f766e', '#7c3aed', '#be185d', '#65a30d'][i]}" data-tip="${tipAttr(`${RIGHT_LABEL[ty]}: ${num(c.t[i])} (${pct(c.t[i], t, 1)})`)}"></span>` : '').join('')}</span>`;
          },
        },
        { key: 'share', label: 'Share', num: true, sort: (c) => c.v, render: (c) => pct(c.v, r.reduce((s, x) => s + x.v, 0), 2) },
      ],
      onRowActivate: (iso) => {
        const c = data.origin.countries.find((x) => x.iso === iso);
        if (c) detail(c);
      },
    });
  };

  const paintMap = (world: unknown) => {
    if (!map) {
      map = L.map(mapHost, { minZoom: 1, maxZoom: 6, zoomControl: true, scrollWheelZoom: false, worldCopyJump: true });
      map.attributionControl.setPrefix(false);
      map.setView([12, 20], 1.6);
    }
    const r = rows();
    const lookup = new Map(r.map((c) => [c.iso, c.v]));
    const max = r[0]?.v ?? 1;

    if (layer) layer.remove();
    layer = L.geoJSON(world as never, {
      attribution: 'Boundaries: Natural Earth (public domain) · Data: IP Australia (CC BY 4.0)',
      style: (f) => {
        const v = lookup.get((f as never as { properties: { iso: string } }).properties.iso) ?? 0;
        return { fillColor: logRamp(v, max), fillOpacity: v ? 0.92 : 0.5, color: '#ffffff', weight: 0.5 };
      },
      onEachFeature: (f, lyr) => {
        const p = (f as never as { properties: { iso: string; name: string } }).properties;
        const v = lookup.get(p.iso) ?? 0;
        const c = data.origin.countries.find((x) => x.iso === p.iso);
        lyr.bindTooltip(
          `<b>${esc(p.name)}</b>${v ? `${num(v)} applications${c && decadeIx < 0 && filter === 'all' ? `<br>${pct(v, r.reduce((s, x) => s + x.v, 0), 2)} of all filings` : ''}` : 'No applications recorded'}`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#191833' }),
          mouseout: () => layer?.resetStyle(lyr as L.Path),
          click: () => { if (c) detail(c); },
        });
      },
    }).addTo(map);

    const breaks = logRampBreaks(max);
    legendHost.innerHTML = `<div class="legend">
      <span class="legend-item">Applications</span>
      <span class="ramp">${RAMP_SWATCHES.map((s) => `<i style="background:${s}"></i>`).join('')}</span>
      <span class="legend-item" style="font-family:var(--font-mono);font-size:0.72rem">${breaks.filter((_, i) => i % 2 === 0).map((b) => compact(b)).join(' · ')} · ${compact(max)}</span>
      <span class="legend-item" style="color:var(--text-tertiary)">logarithmic — each step is roughly a multiple, not an increment</span>
    </div>`;

    // Leaflet mis-measures a container that has not finished layout.
    requestAnimationFrame(() => map?.invalidateSize());
  };

  let world: unknown = null;
  update = () => {
    paintStats();
    paintTable();
    if (world) paintMap(world);
  };

  onSeg(el, 'type', (v) => {
    filter = v as Filter;
    if (decadeIx >= 0) {
      // Keep the two controls honest about each other.
      (el.querySelector('[data-decade]') as HTMLInputElement).value = '-1';
      decadeIx = -1;
      (el.querySelector('[data-decade-lab]') as HTMLElement).textContent = 'All time';
    }
    update();
  });

  const slider = el.querySelector('[data-decade]') as HTMLInputElement;
  slider.addEventListener('input', () => {
    decadeIx = Number(slider.value);
    (el.querySelector('[data-decade-lab]') as HTMLElement).textContent = decadeIx < 0 ? 'All time' : `${decades[decadeIx]}s`;
    (el.querySelector('[data-decade-note]') as HTMLElement).textContent = decadeIx < 0 ? '' : 'A decade slice covers all four right types together.';
    update();
  });

  update();
  loadWorld().then((w) => { world = w; paintMap(w); }).catch(() => {
    legendHost.innerHTML = '<p class="error">The world boundaries could not be loaded. The table below has the same numbers.</p>';
  });

  return () => { map?.remove(); map = null; layer = null; };
}
