// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>

import './styles.css';
import type { IpData } from './types';
import { loadData } from './data';
import { initTooltip } from './components/tooltip';
import { initGlossary, GLOSSARY, hideGloss } from './glossary';
import { closeDrawer } from './drawer';
import { num, bytes, isoDate, esc, compact } from './format';
import { openModal } from './views/ui';

import { mount as overview } from './views/overview';
import { mount as divergence } from './views/divergence';
import { mount as origin } from './views/origin';
import { mount as technology } from './views/technology';
import { mount as filers } from './views/filers';
import { mount as attorneys } from './views/attorneys';
import { mount as lifecycle } from './views/lifecycle';
import { mount as brands } from './views/brands';
import { mount as states } from './views/states';

type ViewFn = (el: HTMLElement, data: IpData) => void | (() => void);
interface Tab { id: string; label: string; fn: ViewFn }

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', fn: overview },
  { id: 'divergence', label: 'Divergence', fn: divergence },
  { id: 'origin', label: 'Origin', fn: origin },
  { id: 'technology', label: 'Technology', fn: technology },
  { id: 'filers', label: 'Filers', fn: filers },
  { id: 'attorneys', label: 'Attorneys', fn: attorneys },
  { id: 'lifecycle', label: 'Lifecycle', fn: lifecycle },
  { id: 'brands', label: 'Brands', fn: brands },
  { id: 'states', label: 'States', fn: states },
];

let cleanup: (() => void) | void;
let data: IpData;
let currentView = '';

function parseHash(): string {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return p.get('view') || 'overview';
}

function aboutHtml(): string {
  const t = data.core.totals;
  return `
    <h2>About this site</h2>
    <p>Australia keeps a public register of every ${esc('patent, trade mark, registered design and plant breeder’s right')} ever applied for. IP Australia publishes the whole thing, weekly, under an open licence. It is also completely unusable: it ships as a single <strong>${bytes(data.core.archiveBytes)}</strong> ZIP that expands to <strong>${bytes(data.core.archiveUncompressedBytes)}</strong> across six CSV files, with no per-table download. You cannot open it in a spreadsheet and you certainly cannot open it in a browser.</p>
    <p>This site reads that archive so you do not have to, and publishes the answers as a few hundred kilobytes of JSON.</p>

    <h3>Where the data comes from</h3>
    <ul>
      <li><strong>IP Australia — IP RAPID</strong>, the weekly open-data release of the national IP register (successor to the annual IPGOD product, which stopped in 2022). Licensed <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. <a href="${esc(data.core.sourceUrl)}" target="_blank" rel="noopener">The archive itself</a>; <a href="https://data.gov.au/data/dataset/423000b8-5735-4447-bcb9-792644bcd7ea" target="_blank" rel="noopener">the catalogue entry</a>.</li>
      <li><strong>Australian Bureau of Statistics</strong> — state boundaries (ASGS) and Estimated Resident Population, both CC BY 4.0, used for the per-capita rates.</li>
      <li><strong>Natural Earth</strong> — world country boundaries, public domain.</li>
    </ul>
    <p>This extract was published on <strong>${isoDate(data.core.sourceDate)}</strong> and processed on ${isoDate(data.core.generated)}. It is refreshed monthly. This site is not affiliated with IP Australia.</p>

    <h3>What was actually read</h3>
    <p>Three of the archive's six tables, streamed member-by-member over HTTP range requests and decompressed on the fly — the 9.5 GB is never written to disk:</p>
    <ul>
      <li><strong>${num(t.applications)}</strong> applications (${num(t.byType.patent)} patents, ${num(t.byType.trade_mark)} trade marks, ${num(t.byType.design)} designs, ${num(t.byType.pbr)} plant breeder's rights)</li>
      <li><strong>${num(t.partyRows)}</strong> party records, of which ${num(t.foundingApplicants)} are founding applicants and ${num(t.agentRows)} are current agents of record</li>
      <li><strong>${num(t.classificationRows)}</strong> classification records</li>
    </ul>

    <h3>Decisions that change the numbers</h3>
    <ul>
      <li><strong>Founding applicants only.</strong> The register holds ${num(t.partyRows)} party records against ${num(t.applications)} applications because rights change hands. Counting every record would credit a large corporate several times for one filing, which is how you end up believing a company filed twice as much as it did.</li>
      <li><strong>Origin is "any Australian applicant".</strong> A jointly-filed Australian–foreign application counts as Australian. This flatters the Australian figures, and the decline shown on this site survives that choice.</li>
      <li><strong>Share figures stop at ${data.core.lastReliableOriginYear}.</strong> Foreign applicants arrive through the PCT national phase up to 30 months after their priority date, so recent years undercount them badly and make the Australian share appear to recover. It has not.</li>
      <li><strong>Filer groups merge name variants.</strong> Names are stored lowercased with punctuation stripped, so one company arrives under several spellings. Legal forms and at most one trailing geographic word are stripped before grouping. Every merge is shown in the filer's detail panel so you can judge it.</li>
      <li><strong>${num(t.noFilingDate)} applications carry no usable filing date</strong> and are excluded from every time series rather than dated by guesswork.</li>
      <li><strong>Pseudonymised parties are set aside, not ranked.</strong> ${num(t.redactedApplicants)} applicant records and ${num(t.redactedAgents)} agent records arrive as a hex token instead of a name, standing in for parties IP Australia has redacted. Three of them are individually large enough to outrank every real attorney firm but the top five, so they are excluded from all leaderboards and counted here instead.</li>
      <li><strong>${data.core.sourceDate.slice(0, 4)} is a part-year.</strong> The extract runs to ${isoDate(data.core.sourceDate)}, so the final year on every chart is short by construction.</li>
      <li><strong>Foreign postcodes are discarded.</strong> The postcode field also holds foreign postcodes — a Japanese applicant's 4488671, DuPont's 19898 — so postcodes are only read when the applicant's country is recorded as Australia.</li>
    </ul>

    <h3>Glossary</h3>
    <p>Every term below appears in the interface as a clickable ℹ. ${Object.keys(GLOSSARY).length} terms in total.</p>
    <ul>${Object.values(GLOSSARY).slice(0, 8).map((g) => `<li><strong>${esc(g.term)}</strong> — ${esc(g.def.slice(0, 150))}${g.def.length > 150 ? '…' : ''}</li>`).join('')}</ul>

    <h3>Corrections</h3>
    <p>If a number here looks wrong, it may well be — use the feedback link in the footer and say which view and which figure.</p>`;
}

function renderShell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#view=overview">
          <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true" fill="none">
            <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7L12 2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M12 7.6 7.8 10v4.4L12 16.8l4.2-2.4V10L12 7.6Z" fill="currentColor" opacity="0.28"/>
            <path d="M12 2.5v5.1M20.5 7l-4.3 2.5M3.5 7l4.3 2.5M12 21.5v-4.7" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <span class="brand-txt"><strong>Intellectual Property</strong><small>who files what in Australia</small></span>
        </a>
        <nav class="tabs" aria-label="Views">
          ${TABS.map((t) => `<a href="#view=${t.id}" data-tab="${t.id}">${t.label}</a>`).join('')}
        </nav>
        <button class="about-btn" data-about aria-label="About this site and its sources">?</button>
      </div>
    </header>
    <main class="main-content" id="main" data-main></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span>Source: <a href="https://data.gov.au/data/dataset/423000b8-5735-4447-bcb9-792644bcd7ea" target="_blank" rel="noopener">IP Australia, IP RAPID</a> (CC BY 4.0). Boundaries &amp; population: ABS (CC BY 4.0); Natural Earth (public domain). Not affiliated with IP Australia.</span>
        <span>Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · <a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></span>
      </div>
    </footer>`;

  app.querySelector('[data-about]')?.addEventListener('click', () => openModal('About this site', aboutHtml()));
  window.addEventListener('hashchange', route);
}

function setActiveTab(view: string): void {
  document.querySelectorAll('[data-tab]').forEach((a) => {
    const on = a.getAttribute('data-tab') === view;
    a.classList.toggle('active', on);
    // The class alone is invisible to assistive technology, and on a narrow
    // screen the nav is a horizontal scroller in which the active tab can sit
    // entirely off-screen.
    if (on) {
      a.setAttribute('aria-current', 'page');
      (a as HTMLElement).scrollIntoView({ inline: 'center', block: 'nearest' });
    } else {
      a.removeAttribute('aria-current');
    }
  });
}

function route(): void {
  const view = parseHash();
  const tab = TABS.find((t) => t.id === view) || TABS[0];
  if (tab.id === currentView) return;
  currentView = tab.id;

  // Hygiene on every view change: drop any open panel, tooltip or popover.
  closeDrawer(false);
  hideGloss();
  document.querySelector('.modal-host')?.remove();
  if (cleanup) { cleanup(); cleanup = undefined; }

  const main = document.querySelector('[data-main]') as HTMLElement;
  main.innerHTML = '';
  setActiveTab(tab.id);
  main.setAttribute('data-view', tab.id);
  window.scrollTo({ top: 0 });

  try {
    cleanup = tab.fn(main, data) || undefined;
  } catch (err) {
    main.innerHTML = `<div class="error">Something went wrong rendering this view. Try another tab.<br><small>${esc((err as Error).message)}</small></div>`;
  }
}

async function boot(): Promise<void> {
  renderShell();
  initTooltip();
  initGlossary();

  const main = document.querySelector('[data-main]') as HTMLElement;
  main.innerHTML = `<div class="loading">
    <div class="skeleton" style="height:120px;max-width:640px;margin:0 auto 16px"></div>
    <div class="skeleton" style="height:280px"></div>
    <p style="margin-top:16px">Loading the Australian intellectual property register…</p>
  </div>`;

  const ctrl = new AbortController();
  window.addEventListener('pagehide', () => ctrl.abort());

  try {
    data = await loadData(ctrl.signal);
  } catch (err) {
    main.innerHTML = `<div class="error">
      <p>The data could not be loaded.</p>
      <p style="margin-top:8px"><small>${esc((err as Error).message)}</small></p>
      <p style="margin-top:14px"><button type="button" class="btn" onclick="location.reload()">Try again</button></p>
    </div>`;
    return;
  }

  document.title = `Intellectual Property — ${compact(data.core.totals.applications)} Australian IP applications`;
  route();
}

void boot();
