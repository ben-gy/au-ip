# Intellectual Property

**Every patent, trade mark, design and plant breeder's right ever filed in Australia — 4.3 million applications over 122 years, and who actually files them.**

🔗 **Live:** [https://au-ip.benrichardson.dev](https://au-ip.benrichardson.dev)

## What is this?

Australia keeps a public register of every patent, trade mark, registered design and plant breeder's right ever applied for. IP Australia publishes the whole thing, weekly, under CC BY 4.0. It is also, in practice, unreadable: it ships as a single **1.33 GB ZIP that expands to 9.51 GB** across six CSV files, with no per-table download. You cannot open it in a spreadsheet, and you certainly cannot open it in a browser. So almost nobody reads it, and the questions it can answer go unanswered in public.

This site reads it for you and publishes the answers as a few hundred kilobytes of JSON. The pipeline never downloads the archive whole and never writes it to disk — it reads the ZIP's Zip64 central directory over HTTP range requests, then range-fetches and raw-inflates only the three members that matter, aggregating line by line in constant memory. A full refresh takes about 95 seconds.

The thing it does that nothing else public does is **separate Australian-origin filing from foreign filing into Australia**, which is the only way the central finding becomes visible: Australian-origin patent filings have fallen in *absolute* numbers since the mid-1990s (8,897 in 1995 → 6,569 in 2023) while foreign filings into Australia more than doubled over the same period. Australians still register their own brands — 58% of trade mark applications are Australian against 18% of patents. Australia registers the world's brands and has quietly stopped inventing.

## Who is this for?

- **Patent attorneys and IP counsel** benchmarking filing activity, or checking which firm acts for which corporate before a pitch. The applicant↔attorney client map is not published anywhere else.
- **Innovation-policy analysts** in government, universities and think tanks who currently buy this from commercial IP analytics vendors or wrangle the 9.5 GB themselves.
- **Startup founders and R&D-tax advisers** asking who else files in their technology field.
- **Journalists and the curious**, for whom the divergence story and the technology-specialisation profile are genuinely newsworthy.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| [IP Australia — IP RAPID](https://data.gov.au/data/dataset/423000b8-5735-4447-bcb9-792644bcd7ea) (CC BY 4.0) | Every patent/trade mark/design/PBR application 1904–2026: dates, status, sub-type, applicant identity + ABN + country + state + postcode, agent of record, and IPC/Nice classification pre-mapped to WIPO-35 technology fields | Weekly at source; this site refreshes monthly |
| [ABS ASGS](https://www.abs.gov.au/) state boundaries (CC BY 4.0) | The Australian state map | Static |
| [ABS Estimated Resident Population](https://data.api.abs.gov.au/) (CC BY 4.0) | Population denominators for per-capita filing rates | Annual |
| [Natural Earth](https://www.naturalearthdata.com/) 1:110m Admin 0 | The applicant-origin world map | Static (public domain) |

## Features

- **The Divergence** — mirrored area charts, one per right type: Australian applicants above the line, foreign below. A single stacked chart would hide that the two series move in opposite directions.
- **Origin** — a Leaflet world choropleth of where the IP filed in Australia comes from, on a logarithmic ramp because the United States alone out-files the next twenty countries combined.
- **Technology** — a WIPO-35 field × decade heatmap, plus a diverging specialisation bar. Australia over-indexes hardest in civil engineering (+8.3pp) and furniture & games (+4.7pp) and under-indexes hardest in pharmaceuticals (−6.1pp).
- **Filers** — a searchable leaderboard of merged filer groups, with the merge rule made inspectable: every drill-down lists the registered name variants that were combined.
- **Attorneys** — a radial hub-and-spoke map of the applicant↔attorney-firm relation, built from 3.8 million agent records.
- **Lifecycle** — filing-to-grant decay curves and survival-to-lapse curves by decade cohort, plus the innovation patent's legislative cliff on 26 August 2021.
- **Brands** — a squarified treemap of all 45 Nice classes, each tile split by applicant origin.
- **States** — a per-capita choropleth (raw counts just redraw the population map) and a postcode leaderboard.
- **Honest provisional handling** — the PCT national-phase lag and the years where applicant country simply was not recorded are surfaced in the interface, not hidden.

## Tech Stack

- **Runtime:** Vanilla TypeScript
- **Build:** Vite 6
- **Testing:** Vitest (80 tests)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, monthly
- **Libraries:** Leaflet 1.9 for maps. Every chart is hand-rolled SVG — no charting library.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview

# Rebuild the data from IP Australia (~95 seconds, ~684 MB downloaded)
npm run collect
```

## How it works

`pipeline/collect.mjs` resolves the current `iprapid.zip` from the data.gov.au CKAN API, then uses `pipeline/zipstream.mjs` to read the archive's central directory over HTTP range requests. Member byte offsets are re-read on every run because they move each time IP Australia rebuilds the archive, and deflate streams are not seekable, so each member is inflated from its own data start.

Three of the six members are streamed and aggregated:

1. `application.csv` (82 MB → 720 MB) — filing year, status, sub-type and lifecycle dates per application.
2. `party_activity.csv` (358 MB → 1.79 GB) — founding applicants (origin, filer groups, state, postcode) and current agents of record.
3. `application_classification.csv` (244 MB → 2.07 GB) — WIPO-35 technology fields and Nice classes.

The 4.2 GB `application_events.csv` is never touched. Between passes an in-memory index carries the join key, packing the filing year and the origin bucket into one integer per application.

Seven reconciliation gates run during collection and abort the build rather than publish a wrong number. The load-bearing one is anchored to the **source**: every data row in `application.csv` must end in the index or in a *named* rejection bucket, and an `ip_right_type` the pipeline does not recognise is a hard failure. That gate exists because an earlier version reconciled only against rows it had already accepted — a tautology that stayed green while silently dropping all 11,649 plant breeder's rights.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Data sources keep theirs, and their attribution requirements are listed in the site's
own About panel and footer.
