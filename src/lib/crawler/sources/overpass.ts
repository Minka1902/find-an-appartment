/**
 * Shelters, parking and transit stops from OpenStreetMap, via Overpass.
 *
 * Three of the app's static metrics are stand-ins for things OSM actually
 * records, and Overpass is a public API with a published usage policy rather
 * than a site that has to be scraped. What it cannot fix is coverage, which is
 * uneven in a way that matters:
 *
 *  - **Transit stops** are mapped thoroughly across Gush Dan; a count here is a
 *    measurement.
 *  - **Public shelters** (`amenity=shelter`) are mapped partially. Worth having,
 *    not worth presenting as authoritative — and a mapped public shelter is a
 *    different thing from the in-flat ממ״ד the metric is really about, which is
 *    why this cannot silently outrank the building-era proxy.
 *  - **Parking** is the case §12 risk 2 already calls out: a real GIS layer in
 *    Tel Aviv and almost nowhere else. Declared low confidence so that
 *    `measured.ts` records it without letting it drive the ranking or the
 *    street-parking hard filter.
 *
 * One query per metric, so a timeout on one does not lose the others.
 */

import { z } from "zod";

import type { CrawlContext, Observation, Source, SourceResult } from "../types";
import type { MeasuredMetric } from "../types";

/** Overridable so a self-hosted instance can carry the load instead. */
const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

const QUERY_TIMEOUT_S = 180;

const element = z.object({
  type: z.string(),
  id: z.union([z.number(), z.string()]).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const overpassResponse = z.object({ elements: z.array(element).default([]) });

interface Layer {
  metric: MeasuredMetric;
  /** Overpass QL statements, each already scoped to `{{bbox}}`. */
  clauses: string[];
  label: string;
}

const LAYERS: Layer[] = [
  {
    metric: "transit",
    label: "transit stops",
    clauses: [
      'node["public_transport"="stop_position"]',
      'node["highway"="bus_stop"]',
      'node["railway"="station"]',
      'node["railway"="tram_stop"]',
    ],
  },
  {
    metric: "shelter",
    label: "public shelters",
    clauses: [
      'node["amenity"="shelter"]["shelter_type"!="picnic_shelter"]',
      'way["amenity"="shelter"]["shelter_type"!="picnic_shelter"]',
      'node["military"="bunker"]',
    ],
  },
  {
    metric: "parking",
    label: "parking facilities",
    clauses: [
      'node["amenity"="parking"]',
      'way["amenity"="parking"]',
      'node["amenity"="parking_entrance"]',
    ],
  },
];

function buildQuery(layer: Layer, bbox: CrawlContext["bbox"]): string {
  // Overpass bbox order is south,west,north,east.
  const box = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  const body = layer.clauses.map((clause) => `  ${clause}(${box});`).join("\n");
  // `out center` gives ways a single representative point, which is all a
  // per-cell count needs.
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];\n(\n${body}\n);\nout center;`;
}

export const overpassSource: Source = {
  id: "overpass",
  describe: "Transit stops, public shelters and parking from OpenStreetMap",
  homepage: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  licence: "OpenStreetMap data under ODbL; Overpass is a public read API",
  metrics: [
    // Counts, not the fixture's 0–100 scores, so each of these can only replace
    // every cell at once — which complete coverage of the bbox is what earns.
    {
      metric: "transit",
      coverage: "complete",
      confidence: "high",
      sameUnitsAsFixture: false,
    },
    {
      metric: "shelter",
      coverage: "complete",
      confidence: "medium",
      sameUnitsAsFixture: false,
    },
    // §12 risk 2: a weak proxy outside Tel Aviv. Recorded, not trusted.
    {
      metric: "parking",
      coverage: "complete",
      confidence: "low",
      sameUnitsAsFixture: false,
    },
  ],

  async collect(ctx: CrawlContext): Promise<SourceResult> {
    const observations: Observation[] = [];
    const notes: string[] = [];

    for (const layer of LAYERS) {
      const url = `${ENDPOINT}?data=${encodeURIComponent(buildQuery(layer, ctx.bbox))}`;
      const outcome = await ctx.fetcher.getJson<unknown>(url);

      if (!outcome.ok) {
        notes.push(`${layer.label}: ${outcome.reason} — ${outcome.detail}`);
        continue;
      }

      const parsed = overpassResponse.safeParse(outcome.data);
      if (!parsed.success) {
        notes.push(`${layer.label}: unexpected Overpass response`);
        continue;
      }

      let kept = 0;
      for (const item of parsed.data.elements) {
        const lat = item.lat ?? item.center?.lat;
        const lon = item.lon ?? item.center?.lon;
        if (lat === undefined || lon === undefined) continue;

        observations.push({
          metric: layer.metric,
          location: { lat, lng: lon },
          value: 1,
          note: item.tags?.name,
        });
        kept++;

        if (ctx.limit > 0 && kept >= ctx.limit) break;
      }

      ctx.log(`${layer.label}: ${kept} feature(s)`);
      if (kept === 0) {
        notes.push(
          `${layer.label}: nothing returned for this bbox — every cell will read zero, which is only right if OSM really has no coverage here.`,
        );
      }
    }

    return { observations, notes };
  },
};
