# Site Plan: Intellectual Property

## Overview
- **Name:** Intellectual Property
- **Repo name:** au-ip
- **Tagline:** Every patent, trade mark, design and plant breeder's right ever filed in Australia — 4.3 million applications, 122 years, and who actually files them.

### Naming Convention
Plain topic name, no country code. `country: "AU"` in the index entry supplies the flag.

## Target Audience
Four groups, all recurring users rather than one-time visitors:

1. **Patent attorneys and IP counsel** (desktop, expert) — benchmarking filing activity, checking which firms act for which corporates, watching technology-field trends before a pitch.
2. **Innovation-policy people** — Treasury/DISR analysts, university tech-transfer offices, think-tank researchers who currently have to buy this from commercial IP analytics vendors or wrangle a 9.5 GB ZIP themselves.
3. **Startup founders and R&D-tax advisers** — "who else is filing in my technology field, and who do they use as attorneys".
4. **Journalists and the curious** — the "Australia's most prolific inventor makes poker machines" story is genuinely newsworthy and nobody has published it.

## Value Proposition
IP Australia publishes the whole national IP register weekly, but only as a **single 1.33 GB ZIP that expands to 9.5 GB across six CSVs**. That is a hard wall: you cannot open it in Excel, you cannot open it in a browser, and there is no per-table download. Consequently nothing free and public lets you ask "has Australian patenting gone up or down", "which countries file here", "which attorney firm acts for Apple in Australia" or "what does Australia actually trade-mark".

This site does the 9.5 GB read for you and ships the answers as a few megabytes of pre-aggregated JSON. The bit nobody else does: **it separates Australian-origin filing from foreign filing into Australia**, which is the only way the headline story becomes visible.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| IP Australia — IP RAPID | `data.gov.au/data/dataset/423000b8-5735-4447-bcb9-792644bcd7ea` (`iprapid.zip`) | Every patent/TM/design/PBR application 1904–2026: dates, status, sub-type, applicant identity + ABN + country + state + postcode, agent (attorney) identity, IPC/CPC/Nice/Locarno classification pre-mapped to WIPO-35 technology fields | Weekly (site refreshes monthly — the fastest cron allowed) | No |
| Natural Earth 110m Admin 0 | `naturalearthdata.com` via CDN | World country boundaries for the applicant-origin map | Static (public domain) | No |
| ABS ASGS state boundaries | `patterns/geo/au-states.geojson` (fleet asset) | Australian state boundaries | Static | No |
| ABS ERP by state | ABS SDMX `ABS_ANNUAL_ERP_ASGS2021` | Population denominators for per-capita filing rates | Annual | No |

**Licence:** IP RAPID is CC BY 4.0. Attribution: "Source: IP Australia, IP RAPID (formerly IPGOD), licensed under CC BY 4.0." Natural Earth is public domain. ABS is CC BY 4.0.

## Key Features
1. **The divergence** — Australian-origin vs foreign-origin filings, per right type, over 40 years. The single chart the whole site exists to show.
2. **Origin world map** — where the IP filed in Australia actually comes from, by right type and era.
3. **Technology fields** — WIPO-35 field × decade, and how Australia's own filing mix differs from the world's.
4. **Filer groups leaderboard** — top applicants with an explicit, inspectable entity-merge rule and full drill-down.
5. **Attorney firm network** — the bipartite applicant↔attorney-firm graph from 4.8M agent rows. Nothing public shows this.
6. **Lifecycle curves** — time from filing to grant/registration, and survival-to-lapse, by right type and era; includes the innovation-patent abolition cliff.
7. **Nice-class treemap** — what Australia trade-marks, by class.
8. **Where in Australia** — state choropleth + per-capita filing rate + postcode leaderboard.
9. **Honest provisional-data handling** — the PCT national-phase lag is surfaced in the UI, not hidden.

## Target Audience (detailed)
Primarily **desktop, professional, patient**. A patent attorney checking a competitor before a client meeting will happily read a dense chart; they will not tolerate a number they cannot trace to a rule. So: every derived figure states its rule on hover, and the entity-merge drill-down shows the raw registered names that were combined. Mobile matters for the journalist/curious segment reading a shared link, so every view must work at 375px — but the design optimum is a wide screen.

Emotionally this is not a distressing dataset; it is a *credibility* dataset. The risk is not upsetting someone, it is being wrong in front of an expert.

## Style Direction
**Tone:** professional / technical-civic — closer to a registry than a consumer app.
**Colour palette:** light, with a deep indigo-violet accent (`#4338ca` family) and a warm amber counterpart. Indigo reads as "registry / institutional / considered" without being the civic-blue every government site uses, and the indigo↔amber pair carries the site's central binary — **domestic vs foreign origin** — as a semantic colour that stays constant across every view.
**UI density:** balanced-to-dense. Data-heavy panels, monospace figures, but generous enough to read a long chart.
**Dark/light theme:** light. The audience is reading on a work machine in daylight; a dark "hacker" theme would misrepresent this as a monitoring tool.
**Reference sites for tone:** WIPO Statistics Data Center (authoritative, dry, trusted); OECD Data Explorer (dense but legible).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite 6. No routing library needed; nine hash-routed views with hand-rolled SVG. React would add weight for no benefit.
- **Data strategy:** **pipeline**, monthly cron (`23 17 9 * *`). The source updates weekly, but monthly is the fastest cadence the factory allows and is entirely adequate — filing volumes move on a yearly timescale and the trailing years are provisional regardless.
- **Pipeline technique (the load-bearing engineering decision):** the ZIP is never downloaded whole and never written to disk. `pipeline/zipstream.mjs` reads the **Zip64 central directory via HTTP Range requests**, then range-fetches and `zlib.createInflateRaw`s only the three members that matter — `application.csv` (82 MB compressed), `party_activity.csv` (358 MB), `application_classification.csv` (244 MB) — aggregating line-by-line in constant memory. The 483 MB / 4.2 GB `application_events.csv` is skipped entirely. Member offsets are re-read every run because they change on each weekly rebuild.
- **Key libraries:** `leaflet` (maps). No D3, no chart library — all charts are hand-rolled SVG. `patterns/` supplies tooltip, svgZoom, forceLayout, treemap, leafletMap.

## Layout
Sticky header (brand + nine word-only tabs + `?` About). Content in a `max-width: 1680px` column. Each view opens with a question-shaped heading, a one-line answer, then a stat row, then the visualisation(s) in cards. A right-side drill-down drawer (detached from the DOM when closed — the iOS off-canvas trap) carries filer-group and firm detail. Sticky footer with source attribution.

Below 768px: stat rows collapse to one column, charts get local `overflow-x: auto` scrollers, the drawer becomes full-width.

## Pages/Views
1. `overview` — **Overview**: the headline finding + auto-detected findings list.
2. `divergence` — **The Divergence**: paired domestic/foreign area+line small multiples, one per right type.
3. `origin` — **Origin**: Leaflet world choropleth of applicant country, era slider, right-type filter.
4. `technology` — **Technology**: WIPO-35 field × decade matrix heatmap + Australia-vs-world specialisation ranking.
5. `filers` — **Filers**: merged filer-group leaderboard, searchable, with drill-down.
6. `attorneys` — **Attorneys**: radial hub-and-spoke applicant↔firm network.
7. `lifecycle` — **Lifecycle**: filing→grant decay curves + survival-to-lapse + the innovation-patent cliff.
8. `brands` — **Brands**: Nice-class treemap for trade marks, domestic vs foreign split per class.
9. `states` — **States**: AU state choropleth, per-capita rate, postcode leaderboard.

## Visualization Strategy

Nine views, chosen from this data's actual shape (entity × geography × time × classification), deliberately **not** the house stack. There is exactly one world choropleth and one state choropleth; there are **no generic ranked-bar-chart views** as a view in their own right.

| View | Question it answers | Form, and why this form | Insight the others don't give |
|---|---|---|---|
| Overview | "What am I looking at, and what's the finding?" | Big-number stat row + one annotated dual-axis time series + auto-detected findings cards | Orientation; the findings are computed, not hand-written |
| The Divergence | "Is Australia inventing more or less than it used to?" | **Small multiples of paired area charts** (domestic below axis / foreign above), one per right type | A single stacked chart hides that the two series move in *opposite* directions; small multiples show patents diverging while trade marks stay domestic — the whole thesis |
| Origin | "Where does IP filed in Australia come from?" | **Leaflet world choropleth** on Natural Earth polygons + era slider | Only geographic form that shows the concentration into US/JP/DE/CN |
| Technology | "What is Australia's technology mix, and how does it differ from the world's?" | **Matrix heatmap** (WIPO-35 field × decade) + a **diverging specialisation bar** (AU share − world share per field) | A heatmap shows the pharma dominance and its timing at once; the diverging bar is the only form that expresses "over/under-indexed", which a ranked bar cannot |
| Filers | "Who files the most, and what's in their portfolio?" | Searchable table + **drill-down panel** with a per-year portfolio timeline and right-type mix | Entity-level truth, with the merge rule made inspectable |
| Attorneys | "Which attorney firms act for whom?" | **Radial hub-and-spoke force network**, firms as labelled hubs, clients fanning on rings; settled before first paint | The applicant↔agent relation exists nowhere else publicly; a table cannot show that a firm's client base is all-foreign or all-domestic |
| Lifecycle | "How long does a right take, and how long does it last?" | **Decay/survival curves** (Kaplan-Meier-ish step lines) per right type per era | Time-to-event is not a count; no bar or map can express it. Also captures the innovation-patent abolition cliff |
| Brands | "What does Australia trade-mark?" | **Squarified treemap** of Nice classes, split domestic/foreign | Composition-at-a-glance across 45 classes; a bar chart of 45 rows is unreadable |
| States | "Where in Australia do filers actually sit?" | **State choropleth (per-capita)** + postcode leaderboard | Raw counts just re-draw the population map; per-capita is the only honest cut |

Cross-cutting rules applied to all of them:
- **Colour is semantic and constant**: indigo = Australian-origin, amber = foreign-origin, grey = origin unknown, everywhere.
- Every mark carries `data-tip` with exact values and the rule used.
- Dense SVGs (network, heatmap, treemap) get `attachSvgZoom`.
- Clicking a mark anywhere selects the entity and dims the rest, *and* offers a cross-link to the view that explains it.
