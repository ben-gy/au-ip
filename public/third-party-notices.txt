# Third-party notices

This product bundles the components below. They keep their own licences and are
not covered by the AGPL or by the [additional attribution term](./ADDITIONAL-TERMS.md)
that applies to this project's own source.

The list is derived from the `sources` recorded in the production build's
sourcemaps (`dist/assets/*.js.map`) — that is, what actually ships to a browser,
rather than everything in `package.json`.

No web fonts are bundled: the site uses the reader's own system font stack.

---

## Leaflet 1.9.4 — BSD-2-Clause

Interactive map rendering. <https://leafletjs.com/>

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## Build-time only (not shipped to the browser)

These run in the data pipeline or the build and are not part of any file a
visitor downloads: **Vite** (MIT), **TypeScript** (Apache-2.0), **Vitest**
(MIT), **jsdom** (MIT), and **mapshaper** (MPL-2.0), which simplifies the
Australian Bureau of Statistics boundary file.

---

## Data and map tiles

Data is not code and keeps its own terms. These sources are credited in the site
footer and in the About panel as their licences require.

| Source | Licence | Used for |
| --- | --- | --- |
| IP Australia — *IP RAPID* (the national IP register), via [data.gov.au](https://data.gov.au/data/dataset/423000b8-5735-4447-bcb9-792644bcd7ea) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Every patent, trade mark, design and plant breeder's right: dates, status, applicants, agents and classifications |
| Australian Bureau of Statistics — ASGS state and territory boundaries | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | The Australian state map |
| Australian Bureau of Statistics — Estimated Resident Population by state, 2024 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Per-100,000 filing rates |
| [Natural Earth](https://www.naturalearthdata.com/) — 1:110m Admin 0 countries | Public domain | The applicant-origin world map |
| CARTO basemap tiles | [CARTO attribution terms](https://carto.com/legal/) | Map background on the origin view |
| OpenStreetMap contributors | [ODbL 1.0](https://www.openstreetmap.org/copyright) | Underlying basemap data |

Required attribution for the primary source:
*Source: IP Australia, IP RAPID (formerly IPGOD), licensed under CC BY 4.0.*

This site is not affiliated with, endorsed by, or connected to IP Australia, the
Australian Bureau of Statistics, or any applicant or attorney firm named in the
data.
