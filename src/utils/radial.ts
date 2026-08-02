// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Radial hub-and-spoke layout: hubs on an inner ring, each hub's leaves fanned
// across its own angular sector on an outer ring.
//
// Computed analytically rather than simulated. A force layout would need to be
// run to convergence and could still leave two nodes touching; here sector
// boundaries make overlap impossible by construction, and the result is
// identical on every render, so the graph is motionless from the first frame.

export interface RadialInput {
  key: string;
  label: string;
  weight: number;
  leaves: { key: string; label: string; weight: number }[];
}

export interface RadialNode {
  id: string;
  key: string;
  label: string;
  hub: string;
  x: number;
  y: number;
  r: number;
  weight: number;
  angle: number;
}

export interface RadialResult {
  cx: number;
  cy: number;
  rHub: number;
  rLeaf: number;
  hubs: RadialNode[];
  leaves: RadialNode[];
  edges: { from: RadialNode; to: RadialNode; weight: number }[];
}

export interface RadialOptions {
  size: number;
  /** Max leaves drawn per hub. */
  maxLeaves?: number;
  hubRadiusFrac?: number;
  leafRadiusFrac?: number;
  hubMinR?: number;
  hubMaxR?: number;
  leafMinR?: number;
  leafMaxR?: number;
  /** Fraction of each sector left empty at its edges, so neighbours never touch. */
  inset?: number;
}

export function radialLayout(input: RadialInput[], opts: RadialOptions): RadialResult {
  const size = opts.size;
  const maxLeaves = opts.maxLeaves ?? 9;
  const cx = size / 2;
  const cy = size / 2;
  const rHub = size * (opts.hubRadiusFrac ?? 0.27);
  const rLeaf = size * (opts.leafRadiusFrac ?? 0.415);
  const hubMinR = opts.hubMinR ?? 7;
  const hubMaxR = opts.hubMaxR ?? 23;
  const leafMinR = opts.leafMinR ?? 3;
  const leafMaxR = opts.leafMaxR ?? 10;
  const inset = opts.inset ?? 0.12;

  const hubs: RadialNode[] = [];
  const leaves: RadialNode[] = [];
  const edges: RadialResult['edges'] = [];
  if (!input.length) return { cx, cy, rHub, rLeaf, hubs, leaves, edges };

  // Sector width is proportional to how many leaves a hub will actually draw,
  // so a busy hub is not crowded into the same arc as a quiet one.
  const counts = input.map((h) => Math.max(1, Math.min(maxLeaves, h.leaves.length)));
  const slots = counts.reduce((s, v) => s + v, 0);
  const maxHubWeight = Math.max(1, ...input.map((h) => h.weight));

  // Node radii are clamped to the arc actually available to them. Sector maths
  // guarantees nodes sit at distinct angles, but not that the circles drawn at
  // those angles stay apart — with enough leaves on the ring they collide, and
  // the graph reads as a smear. Spacing along each ring is its circumference
  // over the number of nodes on it; a radius above ~45% of that overlaps.
  const leafSpacing = (Math.PI * 2 * rLeaf) / Math.max(1, slots);
  const hubSpacing = (Math.PI * 2 * rHub) / Math.max(1, input.length);
  const leafCap = Math.max(leafMinR, Math.min(leafMaxR, leafSpacing * 0.45));
  const hubCap = Math.max(hubMinR, Math.min(hubMaxR, hubSpacing * 0.45));

  let acc = 0;
  input.forEach((h, i) => {
    const start = (acc / slots) * Math.PI * 2;
    const span = (counts[i] / slots) * Math.PI * 2;
    acc += counts[i];
    const mid = start + span / 2 - Math.PI / 2;

    const hub: RadialNode = {
      id: `h:${h.key}`,
      key: h.key,
      label: h.label,
      hub: h.key,
      x: cx + Math.cos(mid) * rHub,
      y: cy + Math.sin(mid) * rHub,
      r: hubMinR + (hubCap - hubMinR) * Math.sqrt(h.weight / maxHubWeight),
      weight: h.weight,
      angle: mid,
    };
    hubs.push(hub);

    const shown = h.leaves.slice(0, counts[i]);
    const maxLeafWeight = Math.max(1, ...shown.map((l) => l.weight));
    shown.forEach((l, j) => {
      const t = shown.length === 1 ? 0.5 : inset + (j / (shown.length - 1)) * (1 - inset * 2);
      const ang = start + span * t - Math.PI / 2;
      const node: RadialNode = {
        id: `l:${h.key}:${l.key}`,
        key: l.key,
        label: l.label,
        hub: h.key,
        x: cx + Math.cos(ang) * rLeaf,
        y: cy + Math.sin(ang) * rLeaf,
        r: leafMinR + (leafCap - leafMinR) * Math.sqrt(l.weight / maxLeafWeight),
        weight: l.weight,
        angle: ang,
      };
      leaves.push(node);
      edges.push({ from: hub, to: node, weight: l.weight });
    });
  });

  return { cx, cy, rHub, rLeaf, hubs, leaves, edges };
}
