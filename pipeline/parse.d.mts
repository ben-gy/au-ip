// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Types for the pipeline's pure parsing module. The module itself stays plain
// .mjs with no build step so that `node pipeline/collect.mjs` runs it directly,
// but the Vitest suite is TypeScript and needs these signatures.

export function splitCsvLine(line: string): string[];
export function headerIndex(headerLine: string, required: string[]): Record<string, number>;
export function yearOf(iso: string | undefined | null): number;
export function daysBetween(fromIso: string | undefined | null, toIso: string | undefined | null): number | null;
export function cleanState(raw: string | undefined | null): string;
export function cleanAuPostcode(raw: string | undefined | null, countryCode: string | undefined | null): string;
export function originOf(countryCode: string | undefined | null): 'domestic' | 'foreign' | 'unknown';
export function normaliseFilerName(raw: string | undefined | null): string;
export function filerKey(name: string | undefined | null): string;
export function isRedactedName(raw: string | undefined | null): boolean;
export function titleCaseName(raw: string | undefined | null): string;
export function parseWipoField(area: string | undefined | null): { rank: number; key: string; label: string } | null;
export function prettyFieldLabel(slug: string): string;
export function parseNiceClass(area: string | undefined | null): number | null;
export function pct(n: number, d: number): number;

export const RIGHT_TYPES: string[];
export const VALID_STATES: string[];
export const NICE_CLASSES: Record<number, string>;
export function NICE_KIND(n: number): 'goods' | 'services';
export const ORIGIN_SHARE_LAST_RELIABLE_YEAR: number;
export const PATENT_SUBTYPES: Record<string, string>;
export const INNOVATION_PATENT_CLOSED: string;
