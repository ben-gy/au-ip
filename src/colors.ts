// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Colour is semantic here, and the same meaning keeps the same colour in every
// view. Indigo is always "an Australian applicant filed this"; amber is always
// "a foreign applicant filed this". That single pairing is the site's argument,
// so it must never be reassigned to mean something else in one chart.

import type { RightType } from './types';

export const ORIGIN_COLOR = {
  domestic: '#4338ca',
  foreign: '#d97706',
  unknown: '#94a3b8',
} as const;

export const ORIGIN_SOFT = {
  domestic: '#c7d2fe',
  foreign: '#fde68a',
  unknown: '#e2e8f0',
} as const;

export const ORIGIN_LABEL = {
  domestic: 'Australian applicant',
  foreign: 'Foreign applicant',
  unknown: 'Origin not recorded',
} as const;

/**
 * Right types get their own hues, chosen to stay distinct from the
 * domestic/foreign pair so a reader never mistakes "patent" for "Australian".
 */
export const RIGHT_COLOR: Record<RightType, string> = {
  patent: '#0f766e',
  trade_mark: '#7c3aed',
  design: '#be185d',
  pbr: '#65a30d',
};

/** Sequential indigo ramp for choropleths and heatmaps. */
const RAMP = ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'];

/**
 * Filing counts are extremely skewed — the US alone files more than the next
 * twenty countries combined — so a linear scale paints everything the palest
 * shade and a quantile scale invents contrast where none exists. A log scale
 * against the observed maximum is the honest reading here, and the legend
 * states the actual break values rather than "low → high".
 */
export function logRamp(value: number, max: number): string {
  if (!(value > 0)) return '#f8fafc';
  const t = Math.log10(value + 1) / Math.log10(Math.max(max, 10) + 1);
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.floor(t * RAMP.length)));
  return RAMP[i];
}

/**
 * Linear ramp, for comparisons whose range is narrow.
 *
 * The heatmap compares decades WITHIN one technology field, where the spread is
 * typically only two- to fivefold. Running that through the log ramp above
 * pushes every cell into the top one or two bands and paints a uniform block
 * that says nothing — a log scale earns its place across countries (a
 * thousandfold range), not across five decades of the same field.
 */
export function linearRamp(value: number, max: number): string {
  if (!(value > 0) || !(max > 0)) return '#f8fafc';
  const t = Math.min(1, value / max);
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))));
  return RAMP[i];
}

/** The break values a log ramp actually produces, for an honest legend. */
export function logRampBreaks(max: number): number[] {
  const lm = Math.log10(Math.max(max, 10) + 1);
  const out: number[] = [];
  for (let i = 0; i < RAMP.length; i++) {
    out.push(Math.round(10 ** ((i / RAMP.length) * lm) - 1));
  }
  return out;
}

export const RAMP_SWATCHES = RAMP;

/** Diverging ramp for the specialisation view: under-indexed ↔ over-indexed. */
export function divergeColor(v: number, max: number): string {
  const t = Math.max(-1, Math.min(1, v / (max || 1)));
  if (t >= 0) {
    const a = Math.round(t * 100) / 100;
    return mix('#f8fafc', ORIGIN_COLOR.domestic, a);
  }
  return mix('#f8fafc', ORIGIN_COLOR.foreign, -t);
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
