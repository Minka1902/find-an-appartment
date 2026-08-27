/**
 * What a crawler source is, and what it produces.
 *
 * A source's job is narrow on purpose: turn one upstream into geolocated
 * observations in the metric's own units. It does no aggregation, no
 * normalization and no scoring — `aggregate.ts` rolls observations up to cells,
 * and the existing engine winsorizes and normalizes from there. Keeping raw
 * units all the way to the cell is what lets `cost` stay ₪/m² and a stop count
 * stay a stop count, rather than becoming an invented 0–100 score on the way in.
 */

import type { BBox, LatLng } from "@/lib/geo";
import type { Confidence } from "@/lib/scoring/types";
import type { PoliteFetcher } from "./fetcher";

/**
 * The metrics real data can currently replace.
 *
 * Each name matches a key in `src/lib/scoring/registry.ts`, which is what lets
 * a measured value drop into the existing pipeline untouched.
 */
export type MeasuredMetric = "cost" | "transit" | "parking" | "shelter";

export const MEASURED_METRICS: MeasuredMetric[] = [
  "cost",
  "transit",
  "parking",
  "shelter",
];

/**
 * How completely a source covers the area it was asked about.
 *
 * The distinction decides what a *missing* record means, which is not a detail:
 *
 *  - `complete` — the query covered the whole bbox, so a cell with no records
 *    genuinely has none of that feature, and zero is a measurement.
 *  - `sparse` — records exist only where something happened. A cell with no
 *    property transactions has an unknown price level, not a price level of
 *    zero, and must keep whatever the fixture said.
 */
export type Coverage = "complete" | "sparse";

export interface Observation {
  metric: MeasuredMetric;
  location: LatLng;
  /** In the metric's own units: ₪/m² for cost, one feature for a count. */
  value: number;
  /** Provenance for this single record, e.g. a deal date and street. */
  note?: string;
}

export interface MetricCoverage {
  metric: MeasuredMetric;
  coverage: Coverage;
  /**
   * The best this source can honestly claim for this metric, before sample
   * size is taken into account. Parking outside Tel Aviv is the standing
   * example: OSM has it, but patchily enough that presenting it with the same
   * authority as a transit stop would be a lie (spec §12 risk 2).
   */
  confidence: Confidence;
}

export interface CrawlContext {
  /** The metro being crawled. */
  bbox: BBox;
  fetcher: PoliteFetcher;
  log(message: string): void;
  /** Stop after this many upstream records. 0 means no limit. */
  limit: number;
}

export interface SourceResult {
  observations: Observation[];
  /** Non-fatal problems worth printing in the run report. */
  notes: string[];
}

export interface Source {
  id: string;
  /** One line, for `--help` and the run report. */
  describe: string;
  /** Where the data comes from, named so a refusal reads as a fact. */
  homepage: string;
  /** Why this upstream is one we are entitled to crawl. */
  licence: string;
  metrics: MetricCoverage[];
  collect(ctx: CrawlContext): Promise<SourceResult>;
}

// ---------------------------------------------------------------------------
// Output — the file the app reads
// ---------------------------------------------------------------------------

export interface MeasuredValue {
  value: number;
  /** Upstream records behind this number. */
  samples: number;
  confidence: Confidence;
  /** Which source produced it. */
  source: string;
}

export interface MeasuredDataset {
  metro: string;
  /** ISO timestamp, so a stale dataset is visible rather than assumed fresh. */
  generatedAt: string;
  /** H3 resolution, asserted on load against the live grid. */
  resolution: number;
  sources: { id: string; describe: string; records: number }[];
  cells: Record<string, Partial<Record<MeasuredMetric, MeasuredValue>>>;
}
