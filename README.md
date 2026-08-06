# Where To Live

Ranks areas to live for a whole household at once — everyone's commute, proximity
to family, transit quality, parking, price level, shelter and Shabbat mobility in
one score, with a live weight-slider UI.

The product and architecture spec is [`docs/plan.md`](docs/plan.md). This README
covers what is actually built.

## Status

This pass builds the **full UI and scoring engine against generated fixture
data**. The routing and database tiers are not built yet.

| Built | Not yet |
|---|---|
| Scoring engine, metric registry, hard filters | OTP2 / Valhalla routing |
| All five screens, fully responsive | Postgres + PostGIS, Drizzle schema |
| H3 cell grid + choropleth map | GTFS / OSM / CBS / nadlan ingestion |
| Fixture data for Gush Dan (~2,100 cells) | Auth, real invite links |
| Client-side re-rank on every slider drag | Real listings (see below) |

Every number on screen is **generated, not measured**. The fixtures are plausible
and spatially structured, but they are not real data and nothing should be
presented to a user as a measurement.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring engine + fixture tests
npm run build
```

The basemap uses CARTO raster tiles. If your network blocks them the cells still
render over a flat background — the choropleth does not depend on the basemap.

## Architecture

The design hangs on separating work by how often it changes (spec §2):

- **Tier A** — the cell grid and static metrics, per metro. Shared by every
  household; a monthly cron in production, `src/lib/fixtures/zones.ts` today.
- **Tier B** — isochrone bands per household target, recomputed only when
  someone edits an address. A cell's travel time is a *containment test* against
  those polygons, not a routing call — `people + anchors` requests instead of
  `cells × targets`.
- **Tier C** — scoring, which runs **client-side on every slider drag** with no
  network round-trip. This is why weights are a live control rather than a
  "Recalculate" button.

`src/lib/data/provider.ts` is the seam between the app and its data. Screens
depend only on that interface, so swapping fixtures for PostGIS and real routing
touches no UI.

### Key files

| Path | What it is |
|---|---|
| `src/lib/scoring/score-zones.ts` | The engine: hard filters, winsorized normalization, weighting |
| `src/lib/scoring/config.ts` | The tunables the ranking is validated against |
| `src/lib/scoring/registry.ts` | Metric registry — add a metric with one file plus one entry |
| `src/lib/data/provider.ts` | The data seam |
| `src/components/layout/AppShell.tsx` | The one place the layout regime is decided |
| `src/components/map/ZoneMap.tsx` | Choropleth, re-coloured via `feature-state` |

## Responsive layout

Two regimes with `lg` (1024px) as the hinge, because a map and a stack of weight
sliders both want the whole viewport:

| Screen | Compact (<1024) | Wide (≥1024) |
|---|---|---|
| Setup | Stepped wizard, sticky Back/Next | One page, two columns |
| Map | Full-bleed map + draggable bottom sheet (peek / half / full) | Map + persistent 380px sidebar |
| Cell detail | Full-height sheet over the map, swipe to dismiss | 420px right panel, map stays interactive |
| Shortlist | Cards, commutes as chips | Table with a column per person |
| Household | Single column | Members beside the invite panel |

Verified at 360 / 390 / 768 / 1024 / 1440 with no horizontal overflow on any
screen, in both light and dark mode.

## Things worth knowing before changing this

**The MapLibre worker is served from `public/`.** maplibre-gl 6 spawns its worker
via `new Worker(new URL(…))`, which Next's bundler does not rewrite — the worker
ends up fetching the page HTML and dies silently. Raster tiles keep working while
*every GeoJSON source stays permanently unloaded*, which looks like "the
choropleth doesn't render". `scripts/copy-maplibre-worker.mjs` copies the real
worker on `prebuild`/`predev` and `ZoneMap.tsx` calls `setWorkerUrl`.

**Cost is labelled "price level", never "rent."** It is aggregated ₪/m² from sale
transactions, and the sale-to-rent ratio varies systematically between central and
peripheral areas, so calling it rent would be actively wrong.

**Confidence is carried per metric per zone** and surfaced in the UI. Parking has
a real GIS layer in Tel Aviv and almost nowhere else; without this the UI would
present a weak proxy with the same authority as a measurement.

**Shortlist listings are generated examples and say so on screen.** Yad2 and
Madlan both block automated access and there may be no legal path to real
address-level listings (spec §12 risk 1). The commute figures are the part that
holds either way.

## Open decisions

Both are one-line changes in `src/lib/scoring/config.ts` / the household model:

- **`unreachable`** is currently a hard rejection. `UNREACHABLE_POLICY` flips it
  to a heavy penalty instead. Matters for peripheral cells where transit routing
  fails but driving is fine. Decide before P1.
- **Cost** acts as both a hard filter and a weighted metric. `maxCost: null`
  disables the filter and leaves it purely weighted.

## Tuning the ranking

The spec's P0 exit criterion is that the ranking matches intuition for a case you
already know. Load the demo household and look at the top cells. If they're
wrong, the answer is almost always in `src/lib/scoring/config.ts` — the anchor
decay constant, the winsorization bounds, or the balanced-aggregation split —
rather than in the engine.

Note that with eight metrics active, peripheral areas tend to win: they score
better on parking, price level and shelter, and commute is only one input. That
is the model behaving as specified, and it is exactly the thing the weight
sliders exist to argue about.
