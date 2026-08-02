# Intellectual Property — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Live:** https://au-ip.benrichardson.dev
- **GitHub Pages:** https://ben-gy.github.io/au-ip/ *(redirects to the custom domain)*

DNS and TLS are already provisioned — the Cloudflare CNAME is live and the GitHub
certificate reached `approved`, so nothing manual is outstanding.

## What it is

Every patent, trade mark, registered design and plant breeder's right ever filed
in Australia — 4,332,386 applications from 1904 to 2026 — read out of IP
Australia's IP RAPID release and published as nine interactive views.

The source ships as one 1.33 GB ZIP that expands to 9.51 GB across six CSVs with
no per-table download, which is why nobody reads it. The pipeline reads the Zip64
central directory over HTTP range requests and raw-inflates only the three
members it needs, aggregating in constant memory. Nothing is written to disk; a
full refresh takes ~95 seconds and runs monthly.

## The finding

Australian-origin patent filings **fell in absolute terms**, 8,897 (1995) →
6,569 (2023), while foreign filings into Australia grew 2.4×. Over the same
period 58.0% of trade mark applications were still Australian, against 18.3% of
patents. Australia registers the world's brands and has largely stopped
patenting its own inventions. Australia over-indexes in civil engineering
(+8.4pp) and furniture & games (+4.7pp) and under-indexes in pharmaceuticals
(−6.2pp).

## Worth knowing before you read the numbers

- Only **founding applicants** are counted. The register holds 12.4M party rows
  against 4.3M applications because rights change hands; counting all of them
  credits big corporates several times for one filing.
- **Share figures stop at 2023.** The PCT national phase means recent years
  undercount foreign filings.
- Each divergence panel **starts in a different year** — the year that right's
  applicant-country field became usable. 87% of 1980 patents have no recorded
  country, so charting them draws the field being back-filled, not filings.
- **538,824 applicant and 443,758 agent records are pseudonymised at source**
  and are excluded from every ranking, with the volume disclosed per firm.

## Review

An adversarial review across four lenses (data accuracy, claims, robustness,
accessibility) produced 35 candidate findings; each was independently verified by
a separate agent instructed to refute it. 16 were refuted, **19 were confirmed
and all 19 are fixed** in commit `54e7fbe`. The most serious:

- The attorney client map published a **company that does not exist**. Every
  pseudonymised applicant collapsed into one client that took whichever raw name
  it saw first and was rendered as the largest client of 37 of 60 firms — while
  the same page said those records were excluded. Now they never form an edge
  and the volume is disclosed as "applicant not nameable".
- **Survival curves counted right-censored rights as survivors**, so the 2010s
  cohort flatlined near 100%. Now uses an at-risk denominator and stops where
  observation does.
- **Country totals counted applicant rows while labelled "applications"** — now
  counted once per application, with a gate enforcing it.
- **Sorting any column silently killed every row's click handler.**

## Test Results

- [x] `npm test` — 85 tests pass
- [x] `npm run build` — clean, no type errors
- [x] All nine views verified on the live production URL: no console errors, no
      NaN/undefined, zero horizontal overflow at 375px
- [x] Real (not synthetic) clicks verified on map polygons, network nodes,
      treemap tiles and table rows
- [x] About modal and drill-down drawer confirmed painting **above** Leaflet,
      opened from the map view itself

---

🤖 Built autonomously by gh-site-factory
