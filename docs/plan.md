# Where To Live — App Plan

A tool that ranks places to live for a whole household at once, based on everyone's commute, proximity to family, transit quality, parking, and cost.

**Scope:** Israel. **Stack:** Next.js + TypeScript, Postgres + PostGIS. **Routing:** self-hosted, free.

---

## 1. Product definition

### What it does

A household (1–4 people) enters:
- Where each person works, how they travel, how many days a week they go in
- Where family lives (parents, siblings, grandparents) and how often they visit
- Cars owned, and whether street parking is required

The app returns a ranked map of areas, with a live weight-slider UI, and drills down to concrete addresses in the top-scoring areas.

### What it is not

Not a listings site. It answers **"which area"**, and only touches real addresses in the final shortlist stage.

### Out of scope for v1

Schools, crime, nightlife, air quality. Each is its own data-sourcing project. The metric registry (§6) makes them additive later rather than a rewrite.

### Deliberately excluded

**Religious/secular neighborhood character.** It is inferable from CBS data and many users would want it, but shipping a neighborhood-sorting tool along demographic lines is a product and ethical liability. The socioeconomic index plus users' own knowledge covers the legitimate part of this need.

---

## 2. Architecture: three compute tiers

The entire design hangs on separating work by how often it changes.

### Tier A — per metro, monthly cron

Generate the H3 cell grid; compute static metrics per cell (transit quality from GTFS, parking, cost, socioeconomic, shelter). Slow, expensive, **shared across every user in that metro**. Stored in Postgres.

### Tier B — per household, on address change

Compute isochrone bands (15/30/45/60 min) from each work location and each family address. That is `people + anchors` requests — typically 5–10. Stored as PostGIS polygons.

A cell's travel time to a target becomes a `ST_Contains` test instead of a routing call. Invalidated only when someone edits an address, so most sessions do **zero** routing work.

> This inversion is the core optimization. The naive approach is `cells × targets` routing calls — 4,000 cells × 9 targets = 36,000 requests, per parameter change. Isochrone inversion makes it 9 requests, once.

### Tier C — per slider drag

Scoring runs **client-side** over the cell set. No network round-trip, instant re-rank. This is why weights can be a live UI rather than a "Recalculate" button.

### Stage 2 — shortlist

Top ~10 cells only: fetch listings, run exact door-to-door routing per listing. ~50 routing calls total. **This is where address-level precision belongs** — and nowhere earlier.

---

## 3. Zone grid: H3 + CBS statistical areas

**Scoring unit: H3 resolution 9** (~0.105 km², ~170 m edge).

Why not addresses: the underlying metrics don't have address-level resolution. Transit access varies at ~150–300 m, street parking at the block level, cost at the neighborhood level. Scoring 500k addresses produces a ranking where the top 2,000 results are the same information repeated with fake precision.

Why not CBS statistical areas as the unit: they vary wildly in size (rural ones are enormous), which distorts any density-based metric.

**Both:** H3 cells are the geometry; CBS statistical-area attributes (socioeconomic index, demographics) are joined in by spatial overlap. Uniform cells *and* free official attribute data.

### Payload control

Two filters keep the client-side set small:

1. Only cells containing residential buildings (OSM footprints). Israel is mostly empty.
2. Only cells inside the union of the household's 60-minute isochrones.

A Gush Dan household lands at 2–4k cells — trivial to re-score in-browser on every slider drag.

---

## 4. Data sources

| Layer | Source | Confidence | Notes |
|---|---|---|---|
| Transit schedules | MOT national GTFS | High | 4,207 routes, 30,455 stops, 36 agencies, one national feed |
| Road/walk network | OSM Israel extract (Geofabrik) | High | Small, fast to process |
| Zone attributes | CBS statistical areas 2022 + socioeconomic index | High | National GIS layer, free |
| Cost proxy | nadlan.gov.il (Tax Authority transactions) | Medium | Address-level, but **sale** prices, not rent |
| Parking | Per-municipality GIS | **Low** | TLV publishes a parking-zones layer; most cities don't |
| Addresses | National address registry / GovMap | Medium | Hebrew↔English transliteration is messy |
| Listings (stage 2) | Yad2 / Madlan | **Unvalidated** | Both block automated access — see §11 |

### GTFS expiry is an operational trap

The MOT feed ships with a validity window (the April 2026 release was valid 16 Apr – 16 May) and covers roughly 60 days forward. **If the cron misses a cycle, isochrones don't error — they silently degrade.** Build feed-validity assertion into the pipeline and fail loudly.

### Rent data does not exist at useful granularity

CBS publishes rent as an index by district (מחוז), which cannot distinguish neighborhoods. Workaround: aggregate nadlan.gov.il sale prices to ₪/m² per cell.

Label it **"price level"** in the UI, never "rent" — the sale-to-rent ratio varies systematically between central and peripheral areas, so presenting it as rent would be actively wrong.

---

## 5. Routing stack

**Free does not mean zero cost.**

- **OTP2** — transit + walk isochrones. Purpose-built for GTFS+OSM multimodal, native isochrone endpoint.
- **Valhalla** — driving and cycling. OTP2's car routing is weak.

Both containerized on one VM.

| | Requirement |
|---|---|
| OTP2 graph, national GTFS | ~8–16 GB RAM (~$40–80/mo VM) |
| OTP2 graph, Gush Dan only | Substantially less — **use this for P0** |
| Valhalla, Israel extract | Minimal; tiles build in minutes |

### Geocoding

Do **not** use free-text geocoding. Hebrew addresses have too many spellings and transliteration variants ("Rothschild" / "רוטשילד" / "רוטשילדt"). Load the national address registry into your own table and serve autocomplete from it.

---

## 6. Pluggable metric registry

### The critical split

**Static metrics** — precomputed per zone, shared across all households in the metro:
`transit`, `parking`, `cost`, `socioeconomic`, `shelter`

**Relational metrics** — depend on the household's isochrones, computed per request:
`commute`, `anchors`

The registry must model both kinds, or relational metrics get bolted on as special cases forever.

### Module interface

Each metric is a module declaring:

```
key            unique identifier
kind           'static' | 'relational'
direction      higher-is-better | lower-is-better
defaultWeight  starting slider position
compute()      value for a zone (+ household, if relational)
confidence()   data quality for this zone
```

### Storage

Static values in `zone_metrics(zone_id, metric_key, value, confidence)` — key-value, not typed columns. Adding a metric becomes a new module file plus a backfill job, never a schema migration.

### Confidence from day one

Carrying `confidence` per metric per zone is not optional and cannot be retrofitted without backfilling every metric. It's what lets the UI say *"Parking: medium — low data coverage in this area"* instead of presenting a fabricated number as authoritative.

---

## 7. Scoring engine

Runs client-side (Tier C). Country-agnostic; already implemented in `types.ts` / `score-zones.ts`.

### Two tiers of criteria

**Hard filters** eliminate zones before scoring:
- Any person over their `maxCommuteMinutes`
- Over budget
- Requires street parking and parking score is zero
- Unreachable for any person

**Weighted score** over everything that survives.

### Design decisions worth preserving

**Winsorized normalization at p5/p95, over the surviving set only.**
Plain min-max lets one 90-minute outlier compress every real difference into the bottom 10% of the range. Normalizing only over zones that passed the hard filters means a distant area you'd never consider can't rescale the whole board.

**Commute weight = `person.weight × daysInOffice`.**
Someone in the office twice a week shouldn't drag the ranking as hard as someone going five days.

**Anchors use exponential decay (τ = 25 min), not linear distance.**
20 vs 30 minutes to your parents is nearly the same life; 30 vs 90 is not. Linear scoring cannot express that.

**Weights renormalize over *available* metrics.**
No car → parking weight drops to 0 and remaining weights redistribute, instead of every zone silently scoring lower. A metric counts only if present for *all* surviving zones — otherwise it's dropped rather than penalizing zones with data gaps.

**Commute aggregation is selectable:** `mean` | `max` | `balanced` (default: 60% weighted mean + 40% worst commute). Households genuinely differ on whether they optimize the average or protect the worst-off person.

### Open behavioral question

`unreachable` is currently a **hard rejection**. If a zone has no transit path to one person's job it's out entirely, rather than scoring badly. This matters for peripheral cells where transit routing fails but driving is fine. Alternative: degrade to a heavy penalty. **Decide before P1.**

---

## 8. Israel-specific metrics

Two that no generic version of this app would have:

### Shabbat mobility

You're already parsing GTFS. Saturday service is nearly absent nationally, but some municipalities run local lines. For a car-free household this is a genuine week-shaping difference between neighborhoods, and it costs one `calendar.txt` query you're already running.

### Safe room (ממ"ד) likelihood + public shelter proximity

Mandatory in new construction since the early 1990s, so building-year distribution per cell is a workable proxy; OSM has partial public-shelter tagging. Post-2023 this is a top-tier criterion for most Israeli households, and no listings site scores it spatially.

### Socioeconomic index

Free, official, per statistical area, joins directly onto cells.

---

## 9. Data model

| Entity | Key fields |
|---|---|
| `Metro` | name, bbox, GTFS feed ref, graph status |
| `Zone` | H3 id, metro, centroid, geometry, statistical area ref |
| `ZoneMetric` | zone_id, metric_key, value, confidence |
| `Household` | metro, car count, requires street parking, max cost, weights, commute aggregation |
| `Person` | household, work location, modes, days in office, max commute, weight |
| `Anchor` | household, label, location, visits per month, modes |
| `IsochroneBand` | household, target (person or anchor), minutes band, polygon |
| `User` + `HouseholdMember` | auth and sharing |

**Postgres + PostGIS is not optional** — `ST_Contains` and `ST_DWithin` are load-bearing. **Drizzle over Prisma**; Prisma's spatial support is poor and you'll write raw SQL for the geo queries regardless.

---

## 10. Screens

1. **Setup** — people, work addresses, days in office; anchors with visit frequency; cars and parking requirement.
2. **Map** — score choropleth over cells, weight sliders, live re-rank.
3. **Cell detail** — metric breakdown, per-person commute times, and *why it scored that way*. This is the trust-builder; without it the ranking is a black box and users won't act on it.
4. **Shortlist** — real addresses in top cells with exact commutes.
5. **Household sharing** — invite link per member.

### On sharing

Don't make one person type everyone's work address. Each member gets an invite link and enters their own address and constraints. More accurate, and it makes the *"whose commute matters more"* negotiation explicit rather than one person deciding silently. That negotiation is arguably the real product.

---

## 11. Phases

### P0 — Validate the model
Gush Dan only. OTP2 + Valhalla on one VM, H3 grid, `transit` + `commute` + `anchors` metrics, hardcoded household, map. No auth.

**Exit criterion:** the ranking matches intuition for a case you already know the answer to. If it doesn't, the weights or the decay curve are wrong and nothing built on top will help.

### P1 — Real app
Metric registry formalized, CBS join, Shabbat + shelter metrics, auth, household CRUD, invite links, isochrone caching and invalidation.

### P2 — Cost and parking
nadlan aggregation; parking for TLV / Jerusalem / Haifa with proxy fallback elsewhere; confidence surfaced in UI.

### P3 — Shortlist stage
Listings + exact routing on top cells. **Gated on §12 risk 1.**

### P4 — National coverage
Multi-metro onboarding, national OTP2 graph.

---

## 12. Risks

**1. Listings access (blocks P3).**
Yad2 and Madlan both block automated access. There may be no legal path to address-level listings, which would cap the product at cell level permanently. **Validate this before building toward P3** — it may mean the shortlist stage becomes "here's what to search for" rather than actual listings.

**2. Parking outside the big three cities.**
Proxy-only, and the proxy is weak. Composite fallback: resident-permit zone existence, building-era share (pre-1970 blocks rarely have garages), off-street capacity per resident, residential density. Surface low confidence rather than a confident wrong number.

**3. OTP2 graph memory at national scale (P4).**
May force per-metro graphs and a routing dispatcher rather than one national instance.

**4. GTFS feed drift.**
Silent degradation, not loud failure. Mitigated by validity assertion in the pipeline.

---

## 13. Decisions still open

| # | Decision | Blocks |
|---|---|---|
| 1 | `unreachable` — hard reject or heavy penalty? | P1 scoring |
| 2 | Is the shortlist real listings or search guidance? | P3 scope |
| 3 | Paid isochrone API as a fallback if VM ops become painful? | P0 infra |
| 4 | Does cost enter as a hard filter, or only as a weighted metric? | P2 |
