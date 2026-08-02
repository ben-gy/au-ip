// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// The applicant↔attorney-firm relation. It exists nowhere else publicly, and a
// table cannot show its shape: that some firms have an all-foreign client base
// and others an all-domestic one, and that the biggest clients are shared.
//
// The layout is a deliberate radial hub-and-spoke, not a free force graph. A
// uniform dot-cloud of 200 nodes would be near-useless; here the firms are the
// spine — labelled, on an inner ring, ordered by size — and each firm's clients
// fan out into its own angular sector. Positions are computed analytically, so
// the graph is motionless from the first frame and no two nodes can overlap.

import type { IpData, Firm, RightType } from '../types';
import { RIGHT_COLOR, ORIGIN_COLOR } from '../colors';
import { RIGHT_LABEL, num, compact, pct, esc, tipAttr } from '../format';
import { gloss } from '../glossary';
import { viewHead, card, statRow, legend, svgOpen, jump, linear } from './ui';
import { attachSvgZoom } from '../utils/svgZoom';
import { radialLayout } from '../utils/radial';
import { openDrawer } from '../drawer';
import { openFiler } from './filers';

const TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];
const HUBS = 18;
const CLIENTS_PER_HUB = 9;

function render(firms: Firm[]): string {
  const W = 940;
  const { hubs: hubNodes, leaves: clientNodes, edges, cx, cy, rHub } = radialLayout(
    firms.slice(0, HUBS).map((f) => ({
      key: f.k,
      label: f.name,
      weight: f.n,
      leaves: f.clients.map((c) => ({ key: c.k, label: c.name, weight: c.n })),
    })),
    { size: W, maxLeaves: CLIENTS_PER_HUB },
  );
  const byKey = new Map(firms.map((f) => [f.k, f]));

  const edgeW = linear(1, Math.max(2, ...edges.map((e) => e.weight)), 0.6, 4);

  const edgePaths = edges.map((e) => {
    // Quadratic curve bowed toward the centre: straight spokes read as a
    // starburst and hide which hub an outer node belongs to.
    const mx = (e.from.x + e.to.x) / 2;
    const my = (e.from.y + e.to.y) / 2;
    const qx = mx + (cx - mx) * 0.22;
    const qy = my + (cy - my) * 0.22;
    return `<path class="edge" data-firm="${esc(e.from.hub)}" d="M${e.from.x.toFixed(1)} ${e.from.y.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${e.to.x.toFixed(1)} ${e.to.y.toFixed(1)}" fill="none" stroke="#9a9ab5" stroke-width="${edgeW(e.weight).toFixed(2)}" opacity="0.42"/>`;
  }).join('');

  const clientDots = clientNodes.map((n) => {
    const f = byKey.get(n.hub)!;
    const tip = `${n.label}\n${num(n.weight)} application${n.weight === 1 ? '' : 's'} filed through ${f.name}\nClick to open this filer`;
    return `<circle class="mark-click node client" data-firm="${esc(n.hub)}" data-client="${esc(n.key)}" data-n="${n.weight}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${ORIGIN_COLOR.domestic}" fill-opacity="0.55" stroke="#fff" stroke-width="1" data-tip="${tipAttr(tip)}"/>`;
  }).join('');

  const hubDots = hubNodes.map((n) => {
    const f = byKey.get(n.hub)!;
    const mix = TYPES.map((t, i) => `${RIGHT_LABEL[t]} ${pct(f.t[i], f.n, 0)}`).join(', ');
    const tip = `${n.label}\n${num(f.n)} applications as agent of record\n${num(f.nClients)} distinct clients\n${mix}\nClick for detail`;
    return `<circle class="mark-click node hub" data-firm="${esc(n.hub)}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${RIGHT_COLOR.patent}" stroke="#fff" stroke-width="2" data-tip="${tipAttr(tip)}"/>`;
  }).join('');

  // Hubs near the top and bottom of the ring sit at almost the same y, so
  // labels at a uniform radius collide there however they are anchored. A
  // three-way stagger of the radial inset separates any three consecutive
  // labels by more than two line-heights — the trick a crowded axis uses on its
  // tick labels. Anchoring is never 'middle': a centred label spreads across
  // its neighbours on both sides, which is exactly where the collisions were.
  const hubLabels = hubNodes.map((n, i) => {
    const ang = Math.atan2(n.y - cy, n.x - cx);
    const inset = n.r + 12 + (i % 3) * 27;
    const lx = cx + Math.cos(ang) * (rHub - inset);
    const ly = cy + Math.sin(ang) * (rHub - inset);
    const anchor = Math.cos(ang) >= 0 ? 'end' : 'start';
    const short = n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label;
    return `<text class="node-label hub-label" data-firm="${esc(n.hub)}" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">${esc(short)}</text>`;
  }).join('');

  return `<div class="chart chart-xwide zoomable">${svgOpen(W, W, 'Attorney firms and the applicants they act for')}
    <g class="edges">${edgePaths}</g>
    <g class="clients">${clientDots}</g>
    <g class="hubs">${hubDots}</g>
    <g class="labels">${hubLabels}</g>
    <text class="ax-txt" x="${cx}" y="${cy - 8}" text-anchor="middle" font-weight="600" font-size="13">${HUBS} largest</text>
    <text class="ax-txt" x="${cx}" y="${cy + 8}" text-anchor="middle" font-weight="600" font-size="13">attorney firms</text>
    <text class="ax-txt" x="${cx}" y="${cy + 26}" text-anchor="middle">click a firm to isolate it</text>
  </svg></div>`;
}

function openFirm(f: Firm): void {
  const total = f.n || 1;
  const peak = f.series.reduce((m, s) => (s[1] > m[1] ? s : m), [0, 0]);
  openDrawer(f.name, `
    <h3>Agent of record</h3>
    <dl class="kv">
      <dt>Applications</dt><dd>${num(f.n)}</dd>
      <dt>Distinct clients</dt><dd>${num(f.nClients)}</dd>
      <dt>Applications per client</dt><dd>${(f.n / Math.max(1, f.nClients)).toFixed(1)}</dd>
      ${peak[0] ? `<dt>Busiest year</dt><dd>${peak[0]} (${num(peak[1])})</dd>` : ''}
    </dl>
    <h3>By right type</h3>
    <ul class="variant-list">
      ${TYPES.map((t, i) => f.t[i] ? `<li><span>${RIGHT_LABEL[t]}</span><span>${num(f.t[i])} · ${pct(f.t[i], total, 0)}</span></li>` : '').join('')}
    </ul>
    <h3>Largest clients</h3>
    <ul class="variant-list">
      ${f.clients.map((c) => `<li><span>${esc(c.name)}</span><span>${num(c.n)}</span></li>`).join('') || '<li><span>No client breakdown available</span><span>—</span></li>'}
    </ul>
    <p style="margin-top:14px">Counts are applications on which this firm is the <em>current</em> agent of record. Where a matter has changed hands, only the present agent is credited.</p>
  `);
}

export function mount(el: HTMLElement, data: IpData): void {
  const firms = data.firms;
  const top = firms.slice(0, HUBS);
  const totalAgent = data.core.totals.agentRows;
  const concentration = pct(firms.slice(0, 10).reduce((s, f) => s + f.n, 0), totalAgent, 1);

  el.innerHTML = `
    ${viewHead({
      title: 'Attorneys',
      question: 'Which patent attorney firms file Australia&rsquo;s intellectual property, and for whom?',
      blurb: `Every application names an ${gloss('attorney', 'agent of record')} — the firm that files and prosecutes it. Joining ${num(totalAgent)} agent records to their applicants gives the client map below, which is not published anywhere else. Firms sit on the inner ring, sized by volume; their largest clients fan out around them. A further ${num(data.core.totals.redactedAgents)} agent records carry a pseudonymised token rather than a name and are excluded from these rankings.`,
    })}

    ${statRow([
      { value: esc(top[0]?.name ?? '—'), label: 'Largest firm by volume', sub: `${num(top[0]?.n ?? 0)} applications · ${num(top[0]?.nClients ?? 0)} clients` },
      { value: concentration, label: 'Share handled by the top ten firms', tone: 'warn' },
      { value: compact(data.core.totals.firms), label: 'Distinct agents on the register', sub: 'firms and sole practitioners' },
      { value: compact(totalAgent), label: 'Applications with a current agent' },
    ])}

    ${card(
      'Firms and their clients',
      `The ${HUBS} largest firms with up to ${CLIENTS_PER_HUB} of each one's biggest clients. Click a firm to isolate its client base; click a client to open its full filing record. Drag to pan, scroll to zoom, double-click to reset.`,
      `<div data-net></div>
       ${legend([
        { color: RIGHT_COLOR.patent, label: 'Attorney firm — size is applications filed' },
        { color: ORIGIN_COLOR.domestic, label: 'Client — size is applications through that firm' },
      ])}
       <div class="ctl-row"><button type="button" class="btn btn-quiet" data-clear hidden>Show all firms again</button><span class="ctl-note" data-sel></span></div>`,
    )}

    ${card(
      'Every listed firm',
      'The same numbers, ranked. Click any row for the client list.',
      `<div class="tbl-wrap"><table class="data"><thead><tr>
        <th class="num">#</th><th>Firm</th><th class="num">Applications</th><th class="num">Clients</th><th class="num">Apps / client</th><th>Right mix</th>
      </tr></thead><tbody>
        ${firms.map((f, i) => `<tr class="clickable" data-row="${esc(f.k)}" tabindex="0">
          <td class="num">${i + 1}</td>
          <td class="wide"><strong>${esc(f.name)}</strong></td>
          <td class="num">${num(f.n)}</td>
          <td class="num">${num(f.nClients)}</td>
          <td class="num">${(f.n / Math.max(1, f.nClients)).toFixed(1)}</td>
          <td><span style="display:inline-flex;width:120px;max-width:100%;border-radius:2px;overflow:hidden">${TYPES.map((ty, j) => f.t[j] ? `<span class="minibar" style="width:${(f.t[j] / f.n) * 100}%;background:${RIGHT_COLOR[ty]}" data-tip="${tipAttr(`${RIGHT_LABEL[ty]}: ${num(f.t[j])} (${pct(f.t[j], f.n, 1)})`)}"></span>` : '').join('')}</span></td>
        </tr>`).join('')}
      </tbody></table></div>
      ${legend(TYPES.map((t) => ({ color: RIGHT_COLOR[t], label: RIGHT_LABEL[t] })))}`,
    )}

    <div class="jump-row">${jump('filers', 'The applicants themselves')}${jump('origin', 'Where their clients are based')}</div>`;

  const netHost = el.querySelector('[data-net]') as HTMLElement;
  netHost.innerHTML = render(top);
  const svg = netHost.querySelector('svg') as SVGSVGElement;
  attachSvgZoom(svg);

  const clearBtn = el.querySelector('[data-clear]') as HTMLButtonElement;
  const selNote = el.querySelector('[data-sel]') as HTMLElement;

  const select = (firmKey: string | null) => {
    svg.querySelectorAll('.edge, .node, .node-label').forEach((n) => {
      const on = !firmKey || (n as HTMLElement).dataset.firm === firmKey;
      n.classList.toggle('dim', !on);
    });
    clearBtn.hidden = !firmKey;
    const f = firmKey ? firms.find((x) => x.k === firmKey) : null;
    selNote.textContent = f ? `Showing ${f.name} — ${num(f.n)} applications for ${num(f.nClients)} clients.` : '';
  };

  svg.addEventListener('click', (e) => {
    const hub = (e.target as Element).closest('.hub') as HTMLElement | null;
    if (hub) {
      const f = firms.find((x) => x.k === hub.dataset.firm);
      if (f) { select(f.k); openFirm(f); }
      return;
    }
    const client = (e.target as Element).closest('.client') as HTMLElement | null;
    if (client) {
      const key = client.dataset.client ?? '';
      const filer = data.filers.find((x) => x.k === key);
      if (filer) openFiler(filer, data);
      else openDrawer('Filer not listed', `<p>This client is not among the ${num(data.filers.length)} largest filers the site carries in detail, so it has no portfolio page here. It filed ${num(Number(client.dataset.n ?? 0) || 0)} applications through this firm.</p>`);
      return;
    }
    // Clicking empty canvas clears the selection.
    if ((e.target as Element).tagName === 'svg') select(null);
  });

  // Clicking a hub label should do what clicking the hub does.
  svg.querySelectorAll('.hub-label').forEach((t) => {
    (t as SVGElement).style.cursor = 'pointer';
    t.addEventListener('click', () => {
      const f = firms.find((x) => x.k === (t as HTMLElement).dataset.firm);
      if (f) { select(f.k); openFirm(f); }
    });
  });

  clearBtn.addEventListener('click', () => select(null));

  el.querySelectorAll('tr[data-row]').forEach((tr) => {
    const open = () => {
      const f = firms.find((x) => x.k === (tr as HTMLElement).dataset.row);
      if (f) { select(f.k); openFirm(f); }
    };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') open(); });
  });
}
