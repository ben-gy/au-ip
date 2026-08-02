// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

import type { RightType } from './types';

export const RIGHT_TYPES: RightType[] = ['patent', 'trade_mark', 'design', 'pbr'];

export const RIGHT_LABEL: Record<RightType, string> = {
  patent: 'Patents',
  trade_mark: 'Trade marks',
  design: 'Designs',
  pbr: "Plant breeder's rights",
};

export const RIGHT_LABEL_ONE: Record<RightType, string> = {
  patent: 'patent',
  trade_mark: 'trade mark',
  design: 'design',
  pbr: "plant breeder's right",
};

export const STATE_LABEL: Record<string, string> = {
  nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', wa: 'Western Australia',
  sa: 'South Australia', tas: 'Tasmania', act: 'Australian Capital Territory', nt: 'Northern Territory',
};

const nf = new Intl.NumberFormat('en-AU');

export function num(n: number): string {
  return Number.isFinite(n) ? nf.format(Math.round(n)) : '—';
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function pct(n: number, d: number, dp = 1): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(dp)}%`;
}

export function signed(n: number, dp = 1): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}`;
}

/** Days → a readable duration, used for filing-to-grant lags. */
export function days(d: number): string {
  if (!Number.isFinite(d) || d <= 0) return '—';
  if (d < 60) return `${Math.round(d)} days`;
  const months = d / 30.44;
  if (months < 24) return `${months.toFixed(months < 10 ? 1 : 0)} months`;
  return `${(d / 365.25).toFixed(1)} years`;
}

export function bytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

export function isoDate(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Escape for interpolation into innerHTML. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Two different escapes are needed for tooltip text and they are not
 * interchangeable: `setAttribute` takes a RAW newline, but a `data-tip="…"`
 * written into an innerHTML string needs `&#10;` or the browser renders the
 * literal characters. Using the wrong one ships visible "&#10;" noise.
 */
export function tipAttr(s: string): string {
  return esc(s).replace(/\n/g, '&#10;');
}

/** Slug that survives a URL hash. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
