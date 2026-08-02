// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

export type RightType = 'patent' | 'trade_mark' | 'design' | 'pbr';

/** [year, domestic, foreign, unknown] */
export type SeriesRow = [number, number, number, number];

export interface Finding {
  sev: 'info' | 'warn' | 'alert';
  title: string;
  body: string;
  view: string;
}

export interface LifecycleLagRow { decade: number; v: number[] }
export interface LifecycleCohort { decade: number; size: number; pts: number[] }

export interface Lifecycle {
  buckets: number[];
  lag: { type: RightType; rows: LifecycleLagRow[] }[];
  survival: { type: RightType; cohorts: LifecycleCohort[] }[];
  subtypeByYear: Record<string, [number, number][]>;
  summary: { type: RightType; filed: number; registered: number; medianLagDays: number }[];
}

export interface Core {
  generated: string;
  sourceDate: string;
  sourceUrl: string;
  archiveBytes: number;
  archiveUncompressedBytes: number;
  lastReliableOriginYear: number;
  /** Per right type: the first filing year whose applicant-country coverage is usable. */
  originCoverage: Record<RightType, { from: number; unknownPct: number }>;
  totals: {
    applications: number;
    byType: Record<RightType, number>;
    partyRows: number;
    foundingApplicants: number;
    agentRows: number;
    classificationRows: number;
    filerGroups: number;
    firms: number;
    noFilingDate: number;
    redactedApplicants: number;
    redactedAgents: number;
  };
  status: Record<RightType, [string, number][]>;
  subtypes: Record<RightType, [string, number][]>;
  series: Record<RightType, SeriesRow[]>;
  lifecycle: Lifecycle;
  findings: Finding[];
}

export interface Country {
  iso: string;
  name: string;
  n: number;
  /** counts per RIGHT_TYPES order */
  t: number[];
  /** counts per decade, aligned to Origin.decades */
  d: number[];
}
export interface Origin { decades: number[]; countries: Country[] }

export interface TechField {
  key: string;
  label: string;
  rank: number;
  n: number;
  au: number;
  d: number[];
  dAu: number[];
  spec: number;
}
export interface Tech { decades: number[]; fields: TechField[] }

export interface Filer {
  k: string;
  name: string;
  n: number;
  t: number[];
  y0: number;
  y1: number;
  cc: string;
  st: string;
  abn: string[];
  variants: [string, number][];
  nVariants: number;
  series: [number, number][];
}

export interface FirmClient { k: string; name: string; n: number }
export interface Firm {
  k: string;
  name: string;
  n: number;
  /** Applications whose applicant is pseudonymised at source and cannot be named. */
  unnamed: number;
  t: number[];
  clients: FirmClient[];
  nClients: number;
  series: [number, number][];
}

export interface NiceRow {
  c: number;
  label: string;
  kind: 'goods' | 'services';
  n: number;
  dom: number;
  forn: number;
  unk: number;
  d: number[];
}

export interface StateRow {
  st: string;
  n: number;
  t: number[];
  pop: number;
  per100k: number;
  series: [number, number][];
}
export interface PostcodeRow { pc: string; n: number; t: number[] }

export interface IpData {
  core: Core;
  origin: Origin;
  tech: Tech;
  filers: Filer[];
  firms: Firm[];
  brands: { decades: number[]; nice: NiceRow[] };
  states: { states: StateRow[]; postcodes: PostcodeRow[]; popYear: number };
}
