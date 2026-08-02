// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Positional tests for both hand-rolled layouts.
//
// Area-only assertions pass on visually broken layouts: an implementation that
// stacks every treemap cell at the same origin conserves total area perfectly
// and renders as garbage. Positions, bounds and pairwise overlap are what catch
// it, so those are what is asserted here.

import { describe, expect, it } from 'vitest';
import { squarify, type Rect } from '../src/utils/squarify';
import { radialLayout, type RadialInput } from '../src/utils/radial';

const EPS = 1e-6;

function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}

// Deterministic pseudo-random values — no Math.random() in tests.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('squarify — positional correctness', () => {
  const boxes: Array<[number, number]> = [[940, 520], [300, 900], [500, 500]];
  const rand = mulberry32(7);
  const valueSets: number[][] = [
    [5, 3, 2, 1],
    [100],
    Array.from({ length: 9 }, () => 1),
    // The real Nice-class distribution shape: one dominant class, a long tail.
    Array.from({ length: 45 }, (_, i) => Math.max(1, Math.round(350000 / (i + 1) ** 1.4))),
    Array.from({ length: 50 }, () => 1 + Math.floor(rand() * 200)),
  ];

  for (const [W, H] of boxes) {
    for (const values of valueSets) {
      it(`lays out ${values.length} values in ${W}×${H}: in-bounds, no overlap, no NaN, area conserved`, () => {
        const rects = squarify(values, W, H);
        const total = values.reduce((a, b) => a + b, 0);
        expect(rects).toHaveLength(values.length);
        for (const r of rects) {
          expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
          expect(r.w).toBeGreaterThanOrEqual(0);
          expect(r.h).toBeGreaterThanOrEqual(0);
          expect(r.x).toBeGreaterThanOrEqual(-EPS);
          expect(r.y).toBeGreaterThanOrEqual(-EPS);
          expect(r.x + r.w).toBeLessThanOrEqual(W + EPS * W);
          expect(r.y + r.h).toBeLessThanOrEqual(H + EPS * H);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            expect(overlapArea(rects[i], rects[j])).toBeLessThan(0.5);
          }
        }
        const sumArea = rects.reduce((s, r) => s + r.w * r.h, 0);
        expect(Math.abs(sumArea - W * H)).toBeLessThan(W * H * 1e-6);
        rects.forEach((r, i) => {
          const expected = (values[i] / total) * W * H;
          expect(Math.abs(r.w * r.h - expected)).toBeLessThan(Math.max(1e-6, expected * 1e-6));
        });
      });
    }
  }

  it('handles degenerates: empty, single fills box, zero-total has no NaN', () => {
    expect(squarify([], 100, 100)).toEqual([]);
    const [single] = squarify([42], 100, 80);
    expect(single.w * single.h).toBeCloseTo(8000, 6);
    for (const r of squarify([0, 0, 0], 100, 100)) {
      expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
      expect(r.w * r.h).toBe(0);
    }
  });
});

describe('radialLayout — positional correctness', () => {
  const rand = mulberry32(11);
  const make = (hubs: number, leavesPer: number): RadialInput[] =>
    Array.from({ length: hubs }, (_, i) => ({
      key: `h${i}`,
      label: `Hub ${i}`,
      weight: 100 + Math.floor(rand() * 9000),
      leaves: Array.from({ length: leavesPer }, (_, j) => ({ key: `h${i}l${j}`, label: `Leaf ${j}`, weight: 1 + Math.floor(rand() * 400) })),
    }));

  const SIZE = 940;

  for (const [hubs, leaves] of [[22, 9], [4, 3], [1, 1], [30, 12]] as [number, number][]) {
    it(`${hubs} hubs × ${leaves} leaves: in-bounds, finite, no node overlap`, () => {
      const r = radialLayout(make(hubs, leaves), { size: SIZE, maxLeaves: 9 });
      const all = [...r.hubs, ...r.leaves];
      expect(r.hubs).toHaveLength(hubs);

      for (const n of all) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.r)).toBe(true);
        expect(n.r).toBeGreaterThan(0);
        // Every node, including its radius, sits inside the SVG canvas.
        expect(n.x - n.r).toBeGreaterThanOrEqual(-EPS);
        expect(n.y - n.r).toBeGreaterThanOrEqual(-EPS);
        expect(n.x + n.r).toBeLessThanOrEqual(SIZE + EPS);
        expect(n.y + n.r).toBeLessThanOrEqual(SIZE + EPS);
      }

      // No two nodes may visually collide. This is the assertion that a force
      // layout could not guarantee, and the reason this layout is analytic.
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const dx = all[i].x - all[j].x;
          const dy = all[i].y - all[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          expect(dist).toBeGreaterThan(Math.max(0.5, (all[i].r + all[j].r) * 0.5));
        }
      }
    });
  }

  it('places hubs on the inner ring and leaves on the outer ring', () => {
    const r = radialLayout(make(8, 4), { size: SIZE });
    for (const h of r.hubs) {
      expect(Math.hypot(h.x - r.cx, h.y - r.cy)).toBeCloseTo(r.rHub, 6);
    }
    for (const l of r.leaves) {
      expect(Math.hypot(l.x - r.cx, l.y - r.cy)).toBeCloseTo(r.rLeaf, 6);
    }
    expect(r.rLeaf).toBeGreaterThan(r.rHub);
  });

  it('caps leaves per hub and links every leaf to exactly one hub', () => {
    const r = radialLayout(make(5, 40), { size: SIZE, maxLeaves: 9 });
    expect(r.leaves).toHaveLength(5 * 9);
    expect(r.edges).toHaveLength(r.leaves.length);
    for (const e of r.edges) {
      expect(e.from.hub).toBe(e.to.hub);
    }
    for (const hub of r.hubs) {
      expect(r.leaves.filter((l) => l.hub === hub.key)).toHaveLength(9);
    }
  });

  it('is deterministic — identical input gives identical positions', () => {
    const input = make(6, 5);
    const a = radialLayout(input, { size: SIZE });
    const b = radialLayout(input, { size: SIZE });
    expect(a.hubs.map((n) => [n.x, n.y])).toEqual(b.hubs.map((n) => [n.x, n.y]));
    expect(a.leaves.map((n) => [n.x, n.y])).toEqual(b.leaves.map((n) => [n.x, n.y]));
  });

  it('handles a hub with no leaves and an empty input', () => {
    const empty = radialLayout([], { size: SIZE });
    expect(empty.hubs).toEqual([]);
    expect(empty.leaves).toEqual([]);

    const lone = radialLayout([{ key: 'a', label: 'A', weight: 5, leaves: [] }], { size: SIZE });
    expect(lone.hubs).toHaveLength(1);
    expect(lone.leaves).toHaveLength(0);
    expect(Number.isFinite(lone.hubs[0].x)).toBe(true);
  });

  it('gives a busier hub a wider sector than a quiet one', () => {
    const r = radialLayout([
      { key: 'big', label: 'Big', weight: 10, leaves: Array.from({ length: 9 }, (_, i) => ({ key: `b${i}`, label: 'l', weight: 1 })) },
      { key: 'small', label: 'Small', weight: 10, leaves: [{ key: 's0', label: 'l', weight: 1 }] },
    ], { size: SIZE, maxLeaves: 9 });
    const spread = (hub: string) => {
      const angles = r.leaves.filter((l) => l.hub === hub).map((l) => l.angle);
      return Math.max(...angles) - Math.min(...angles);
    };
    expect(spread('big')).toBeGreaterThan(spread('small'));
  });
});
