# Where To Live

Ranks areas to live for a whole household at once — everyone's commute, proximity
to family, transit quality, parking, price level, shelter and Shabbat mobility in
one score, with a live weight-slider UI.

The product and architecture spec is [`docs/plan.md`](docs/plan.md). This README
covers what is actually built.

## Status

This pass builds the **full UI and scoring engine against generated fixture
data**, plus a crawler that replaces some of that data with real measurements.
The routing and database tiers are not built yet.

| Built | Not yet |
|---|---|
| Scoring engine, metric registry, hard filters | OTP2 / Valhalla routing |
| All five screens, fully responsive | Postgres + PostGIS, Drizzle schema |
| H3 cell grid + choropleth map | GTFS / OSM / CBS / nadlan ingestion |
| Fixture data for Gush Dan (~2,100 cells) | Accounts and a server-side household |
| Client-side re-rank on every slider drag | Real listings (see below) |
| Any location, by pin, coordinates or geocoder | |
| Exclusion reasons with one-click fixes | |
| Pin and compare areas side by side | |
| Households shared by link | |
| Open-data crawler for real prices and OSM features | Real rental listings (see below) |

Out of the box, every number on screen is **generated, not measured**. The
fixtures are plausible and spatially structured, but they are not real data and
nothing should be presented to a user as a measurement.

`npm run crawl` changes that for the metrics real open data covers — see
[Real data](#real-data). What it cannot change is the shortlist: there is still
no legal source of rental listings, and those rows still say so on screen.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring engine, fixtures, share links, crawler, components
npm run lint
npm run build

npm run crawl -- --list    # what real data can be fetched, and from where
npm run crawl              # fetch it (needs outbound HTTPS)
```

Optional: set `GEOCODER_URL` to a Nominatim-compatible base URL to turn on
free-text address search. Without it, the address book, coordinate paste and
pin-drop all still work — see below.

The basemap uses CARTO raster tiles. If your network blocks them the cells still
render over a flat background — the choropleth does not depend on the basemap.
CARTO has been moving its keyless endpoints behind API keys and serves a tile
stamped `API KEY REQUIRED` rather than an error when one is needed, which no
error handler can detect; set `NEXT_PUBLIC_BASEMAP_URL` to a keyed or
self-hosted tile template if you see that watermark.

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
| `src/lib/scoring/explain.ts` | Why areas were excluded, and what would bring them back |
| `src/components/setup/LocationPicker.tsx` | Setting any location: book, coordinates, pin or geocoder |
| `src/lib/share-link.ts` | Encoding a household into a URL |
| `src/hooks/use-async.ts` | The cancellation/supersession/rejection guards for provider calls |
| `src/components/layout/AppShell.tsx` | The one place the layout regime is decided |
| `src/components/map/ZoneMap.tsx` | Choropleth, re-coloured via `feature-state` |
| `src/lib/crawler/fetcher.ts` | Everything owed to a site you crawl, in one place |
| `src/lib/crawler/registry.ts` | Source registry — and why there is no Yad2 adapter |
| `src/lib/data/measured.ts` | Where a crawl stops being a file and changes what the app says |

## Real data

`npm run crawl` fetches from sources that publish for reuse and writes
`public/data/<metro>.metrics.json`, which the app overlays on the fixtures. Those
files are committed empty, so until you run a crawl the app behaves exactly as it
did before — the fallback is the shipped behaviour, not a degraded one — and a
fresh clone does not log a 404 for its own expected state.

| Source | What it gives | Metric |
|---|---|---|
| [data.gov.il](https://data.gov.il) | Property sale transactions, real addresses | `cost`, in ₪/m² |
| [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | OSM stops, public shelters, parking | `transit`, `shelter`, `parking` |

Run `npm run crawl -- --list` for the current set. The crawl prints what it did
*not* get as prominently as what it did, because a crawler that quietly writes
less than you think it did is how fixture data ends up presented as measurement.

### There is no listings adapter, and that is the answer

Yad2 and Madlan are the sites spec §12 risk 1 names. Both block automated access
and forbid scraping in their terms, so neither has an adapter and there is no
switch to add one. `fetcher.ts` refuses a robots-disallowed path outright, which
means a source a site declines to be crawled by cannot be made to work by
writing it.

What the shortlist shows instead, once a crawl has run, is **recorded sales at
real addresses** — the transactions the price level is computed from. They are
labelled as sales, never as homes for rent: the sale-to-rent ratio varies
systematically between central and peripheral areas, so quoting one as the other
would be a confidently wrong number rather than a missing one. The illustrative
rental rows stay, and stay labelled.

### What a measurement is allowed to replace

Two rules, both there to stop a measurement being worth less than the fixture it
replaced:

- **Units decide the granularity.** Sale prices are ₪/m² on both sides, so a
  measured cell can sit beside a generated one. A count of bus stops cannot —
  mixing counts with the fixture's 0–100 scores puts two scales on one axis and
  silently reorders the board — so those metrics replace every cell or none.
- **Absence is not zero.** A cell where nothing sold has an unknown price level,
  not a price level of zero. It keeps the fixture value.

Confidence is capped by sample count, so a one-deal cell can never present
itself as well-evidenced, and a metric whose query found almost nothing across
the whole metro is refused outright — a timeout, a rate limit and a genuinely
unmapped area all arrive as a grid of confident zeros.

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
| Compare | Columns scroll under a sticky label column | A column per shortlisted area |

Verified at 360 / 390 / 768 / 1024 / 1440 with no horizontal overflow on any
screen, in both light and dark mode.

The one place horizontal scrolling is deliberate is the comparison table, where
the alternative is truncating the numbers being compared.

## Things worth knowing before changing this

**The MapLibre worker is served from `public/`.** maplibre-gl 6 spawns its worker
via `new Worker(new URL(…))`, which Next's bundler does not rewrite — the worker
ends up fetching the page HTML and dies silently. Raster tiles keep working while
*every GeoJSON source stays permanently unloaded*, which looks like "the
choropleth doesn't render". `scripts/copy-maplibre-worker.mjs` copies the real
worker on `prebuild`/`predev` and `ZoneMap.tsx` calls `setWorkerUrl`.

**Setting a location does not require a geocoder.** The spec (§5) banned
free-text geocoding because Hebrew addresses transliterate a dozen ways and a
guessed coordinate is indistinguishable from a correct one once stored. The
picker answers that rather than ignoring it: the curated address book comes
first, a pasted coordinate pair or map link is exact, and *anything* geocoded or
pasted must be confirmed on a map before it commits. Free-text search is off
unless `GEOCODER_URL` is set, and `/api/geocode` returns
`{available: false, reason}` rather than an error so the UI can say why and
point at the pin-drop. Dropping a pin works with no network at all, which is the
path that makes "any address" unconditionally true.

**Share links carry the household, not an id.** There is no server to look an id
up in, so the link *is* the transport. Incoming links are third-party input and
decode through the same zod schema that guards `localStorage`; importing is
always confirmed, because a link can arrive from a chat, an old bookmark or a
restored tab, and it replaces everything the recipient has.

**Exclusion counts are simulated, not estimated.** `explainExclusions` reports
how many areas a given change would admit by testing that change against every
rejection. It also counts areas blocked by one constraint *alone* — a zone
rejected for three reasons appears in three buckets of `rejectionCounts` but is
unlocked by none of them individually, so that is the only honest number to put
next to "loosen this".

**Cost is labelled "price level", never "rent."** It is aggregated ₪/m² from sale
transactions, and the sale-to-rent ratio varies systematically between central and
peripheral areas, so calling it rent would be actively wrong.

**Confidence is carried per metric per zone** and surfaced in the UI. After a
crawl it is derived from sample count rather than asserted. Parking has
a real GIS layer in Tel Aviv and almost nowhere else; without this the UI would
present a weak proxy with the same authority as a measurement.

**Shortlist rental rows are generated examples and say so on screen.** Yad2 and
Madlan both block automated access and there is no legal path to real
address-level *rental* listings (spec §12 risk 1). The commute figures are the
part that holds either way. Recorded sales, where a crawl has produced any, are
real and shown separately — see [Real data](#real-data).

## Open decisions

- **`unreachable`** is now a household setting rather than a constant, exposed
  on the map screen as "keep areas with no route, scored badly". Once people can
  enter arbitrary workplaces, whether an unroutable cell vanishes or merely
  scores badly stops being a tuning knob and becomes a preference — a cell can
  be unreachable by transit and an ordinary drive away.
  `DEFAULT_UNREACHABLE_POLICY` is only the default for a household that has
  never expressed a choice.
- **Cost** acts as both a hard filter and a weighted metric. `maxCost: null`
  disables the filter and leaves it purely weighted. Still open.

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
