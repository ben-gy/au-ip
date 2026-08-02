// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// Assume the reader knows nothing about intellectual property. Every piece of
// jargon in the interface is a clickable term that resolves here.

import { esc } from './format';

export interface Term { term: string; def: string }

export const GLOSSARY: Record<string, Term> = {
  patent: {
    term: 'Patent',
    def: 'A 20-year monopoly on an invention — a device, substance, method or process — granted in exchange for publishing how it works. Australia grants standard patents (20 years) and, until 2021, granted innovation patents (8 years, lower inventive threshold).',
  },
  trade_mark: {
    term: 'Trade mark',
    def: 'A registered sign — a word, logo, shape, sound or scent — that distinguishes one trader\'s goods or services from another\'s. Renewable indefinitely every 10 years, so unlike a patent it need never expire.',
  },
  design: {
    term: 'Registered design',
    def: 'Protection for how a product looks — its shape, configuration, pattern or ornamentation — rather than how it works. Lasts up to 10 years in Australia.',
  },
  pbr: {
    term: "Plant breeder's right",
    def: 'Exclusive commercial rights over a new plant variety the holder has bred: a new apple cultivar, a drought-tolerant wheat. Lasts 20 years (25 for trees and vines). The smallest of the four rights by volume — about 11,600 applications in the whole record.',
  },
  applicant: {
    term: 'Applicant',
    def: 'The person or organisation that applies for the right and would own it if granted. Not the same as the inventor, who is named separately and is often an employee of the applicant.',
  },
  founding_applicant: {
    term: 'Founding applicant',
    def: 'The applicant recorded when the application was first filed, as opposed to whoever owns the right today after any sale or transfer. This site counts founding applicants throughout, because the question it asks is who FILED — counting current owners as well would credit big corporates several times over for the same application.',
  },
  origin: {
    term: 'Origin',
    def: 'Whether the filing came from an Australian applicant or a foreign one, taken from the founding applicant\'s recorded country. An application counts as Australian if ANY of its founding applicants is Australian, so joint Australian–foreign filings are counted as Australian.',
  },
  pct: {
    term: 'PCT national phase',
    def: 'The Patent Cooperation Treaty lets an applicant file once internationally and then enter individual countries up to about 30 months later. Because foreign applicants mostly arrive in Australia this way, the most recent two or three filing years always undercount foreign filings while Australian provisionals appear immediately — which makes the Australian share look like it is rising when it is not.',
  },
  provisional: {
    term: 'Provisional application',
    def: 'A cheap, informal first patent filing that secures a priority date and gives the applicant 12 months to decide whether to file a full ("complete") application. Most provisionals never become standard patents. Overwhelmingly used by Australian applicants.',
  },
  standard_patent: {
    term: 'Standard patent',
    def: 'The full 20-year patent, requiring an inventive step over what was already known. The default patent everywhere.',
  },
  innovation_patent: {
    term: 'Innovation patent',
    def: 'A second-tier Australian patent, 8 years, requiring only an "innovative step" rather than an inventive one. Introduced in 2001 and abolished for new filings on 26 August 2021 after the Productivity Commission found it did not benefit Australian innovators. The cliff you see in the data is legislative.',
  },
  petty_patent: {
    term: 'Petty patent',
    def: 'The innovation patent\'s predecessor, a short-term patent available before 2001.',
  },
  ipc: {
    term: 'IPC / CPC classification',
    def: 'The International (and Cooperative) Patent Classification — a hierarchical code such as "A61K 31/00" assigned by examiners to describe what an invention is about. It is how patents can be grouped by technology at all.',
  },
  wipo35: {
    term: 'WIPO-35 technology field',
    def: 'A standard scheme that collapses tens of thousands of IPC codes into 35 comparable technology fields, such as pharmaceuticals, digital communication or civil engineering. IP Australia ships this mapping already applied, which is what makes cross-field comparison possible.',
  },
  nice: {
    term: 'Nice class',
    def: 'Trade marks are registered for specific goods or services, grouped into 45 international "Nice" classes. Classes 1–34 are goods (chemicals, clothing, food); 35–45 are services (advertising, finance, education). One trade mark can cover several classes.',
  },
  locarno: {
    term: 'Locarno classification',
    def: 'The equivalent classification scheme for registered designs.',
  },
  attorney: {
    term: 'Patent attorney / agent of record',
    def: 'The registered professional or firm that files and prosecutes the application on the applicant\'s behalf. Recorded in the register as the applicant\'s agent, which is what lets this site show which firms act for whom.',
  },
  filer_group: {
    term: 'Filer group',
    def: 'A single organisation, assembled from the several registered names it files under. IP Australia stores names lowercased with punctuation stripped, so one company arrives as "aristocrat technologies australia pty limited", "aristocrat technologies pty ltd" and "aristocrat technologies inc". Filer groups strip legal forms (Pty, Ltd, Inc, GmbH) and at most one trailing geographic word, then combine. Open any filer to see exactly which registered names were merged.',
  },
  party_id: {
    term: 'party_id',
    def: 'IP Australia\'s own entity identifier. It is deliberately not used here for grouping: CSIRO alone spans at least six party_ids, so leaderboards built on it fragment and understate the biggest filers.',
  },
  abn: {
    term: 'ABN',
    def: 'Australian Business Number, matched upstream against the Australian Business Register. Present on roughly 41% of party records — useful as corroboration that two names are the same body, but too incomplete to group on by itself.',
  },
  status: {
    term: 'Status',
    def: 'Where the application ended up: filed, accepted, registered/granted, refused, withdrawn, lapsed or ceased. Around 409,000 old pre-digital patent records carry status "unknown", so they are excluded from grant-rate figures rather than counted as failures.',
  },
  filing_date: {
    term: 'Filing date',
    def: 'The date the application was lodged with IP Australia. Every chart on this site is organised by filing year, not by grant year, because filing is the decision an applicant actually makes.',
  },
  priority_date: {
    term: 'Priority date',
    def: 'The earliest date claimed for the invention, often an earlier filing in another country. It is what decides who was first, and it can precede the Australian filing date by up to 30 months.',
  },
  lapse: {
    term: 'Lapsed / ceased',
    def: 'A right that ended before its full term, almost always because the holder stopped paying renewal fees — a deliberate commercial decision that the right is no longer worth its upkeep.',
  },
  specialisation: {
    term: 'Specialisation index',
    def: 'How much more (or less) of Australia\'s own patenting sits in a technology field than of all patenting filed in Australia. Zero means Australians file in that field at exactly the rate everyone else does; positive means Australia is over-represented there.',
  },
  per_capita: {
    term: 'Per 100,000 people',
    def: 'Filings by applicants in a state, divided by that state\'s population and scaled to 100,000 residents. Raw counts simply redraw the population map — NSW leads because NSW is biggest — so the per-capita rate is the only cut that says anything.',
  },
  ip_rapid: {
    term: 'IP RAPID',
    def: 'IP Australia\'s weekly open-data release of the whole national IP register, and the successor to the annual IPGOD product (which stopped in 2022). It ships as one 1.33 GB ZIP that expands to 9.5 GB across six CSV files, with no per-table download.',
  },
};

let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    host.className = 'gloss-pop';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

export function hideGloss(): void {
  host?.classList.remove('visible');
}

/** Inline markup for a jargon term: the word plus an info affordance. */
export function gloss(key: string, label?: string): string {
  const t = GLOSSARY[key];
  if (!t) return esc(label ?? key);
  return `<button type="button" class="gloss-link" data-term="${esc(key)}" aria-label="What is ${esc(t.term)}?">${esc(label ?? t.term)}<span aria-hidden="true">ℹ</span></button>`;
}

export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest?.('.gloss-link') as HTMLElement | null;
    if (!btn) {
      if (!(e.target as Element).closest?.('.gloss-pop')) hideGloss();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const t = GLOSSARY[btn.dataset.term ?? ''];
    if (!t) return;
    const el = ensureHost();
    el.innerHTML = `<strong>${esc(t.term)}</strong><p>${esc(t.def)}</p><button type="button" class="gloss-close" aria-label="Close">×</button>`;
    el.classList.add('visible');
    el.querySelector('.gloss-close')?.addEventListener('click', hideGloss);

    // Position beneath the trigger, flipped up or nudged inward at the edges.
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    el.style.width = `${w}px`;
    let left = r.left;
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
    el.style.left = `${Math.max(12, left)}px`;
    const h = el.getBoundingClientRect().height;
    el.style.top = r.bottom + h + 12 > window.innerHeight ? `${Math.max(12, r.top - h - 8)}px` : `${r.bottom + 8}px`;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideGloss();
  });
  window.addEventListener('scroll', hideGloss, { passive: true });
}
