/**
 * Real measurements, overlaid on the fixture dataset.
 *
 * This is where a crawl stops being a file and starts changing what the app
 * says. It composes `fixtureProvider` rather than replacing it, so the app has
 * exactly one behaviour when no crawl has been run: the one that shipped.
 *
 * Two rules do the work, and both exist to stop a measurement being worth less
 * than the fixture it replaced:
 *
 * 1. **A metric is replaced only as its units allow.** `aggregate` decides this
 *    and records the verdict in the file, because getting it wrong is invisible:
 *    a cell holding a count of bus stops next to a cell holding a 0–100 score
 *    looks fine and silently reorders the entire board once the engine
 *    normalizes across them.
 * 2. **A cell with no measurement keeps its fixture value.** Absence is not
 *    zero. A cell where nothing sold has an unknown price level, and ranking it
 *    as free would be the single most misleading thing this app could do.
 *
 * Loaded over HTTP from `public/` rather than imported, so a missing file is a
 * 404 the provider shrugs off at runtime instead of a build error — and so
 * refreshing the data is a crawl plus a deploy, not a rebuild.
 */

import { z } from "zod";

import type { MeasuredDataset, MeasuredMetric } from "@/lib/crawler/types";
import type { ZoneDataset } from "@/lib/fixtures/zones";
import { ZONE_RESOLUTION } from "@/lib/fixtures/zones";
import type { Confidence, ScoredZone, ZoneMetrics } from "@/lib/scoring/types";
import { fixtureProvider } from "./fixture-provider";
import type { DataProvider } from "./provider";

/**
 * A recorded property transaction.
 *
 * Deliberately not a `Listing`. It is a sale that happened, not a home for
 * rent, and the sale-to-rent ratio varies systematically between central and
 * peripheral areas — so presenting one as the other would be exactly the kind
 * of confident wrong number the rest of this app goes out of its way to avoid.
 */
export interface Transaction {
  id: string;
  h3: string;
  address: string;
  municipality: string;
  sizeSqm: number;
  price: number;
  pricePerSqm: number;
  /** ISO date, as published. */
  date: string;
}

// ---------------------------------------------------------------------------
// The files, validated rather than trusted
// ---------------------------------------------------------------------------

const confidence = z.enum(["high", "medium", "low"]);

const measuredValue = z.object({
  value: z.number(),
  samples: z.number(),
  confidence,
  source: z.string(),
});

const metricSummary = z.object({
  coverage: z.enum(["complete", "sparse"]),
  source: z.string(),
  cells: z.number(),
  confidence,
  replaces: z.enum(["all", "per-cell", "none"]),
  reason: z.string().optional(),
});

const measuredDataset = z.object({
  metro: z.string(),
  generatedAt: z.string(),
  resolution: z.number(),
  sources: z.array(
    z.object({ id: z.string(), describe: z.string(), records: z.number() }),
  ),
  metrics: z.record(z.string(), metricSummary),
  cells: z.record(z.string(), z.record(z.string(), measuredValue)),
});

const transactionFile = z.object({
  metro: z.string(),
  generatedAt: z.string(),
  cells: z.record(
    z.string(),
    z.array(
      z.object({
        address: z.string(),
        municipality: z.string(),
        sizeSqm: z.number(),
        price: z.number(),
        pricePerSqm: z.number(),
        date: z.string(),
      }),
    ),
  ),
});

export type TransactionFile = z.infer<typeof transactionFile>;

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/** A measurement only stands in for a fixture value at medium or better. */
function isApplicable(level: Confidence): boolean {
  return level === "high" || level === "medium";
}

/**
 * Overlay measurements onto the fixture metrics.
 *
 * Pure, so the rules above are testable without a network or a filesystem.
 */
export function applyMeasurements(
  base: ZoneDataset,
  dataset: MeasuredDataset,
): ZoneDataset {
  // A dataset built against a different grid would key onto cells that no
  // longer exist and quietly measure nothing at all.
  if (dataset.resolution !== ZONE_RESOLUTION) return base;

  const applicable = Object.entries(dataset.metrics).filter(
    ([, summary]) => summary && summary.replaces !== "none",
  ) as [MeasuredMetric, NonNullable<MeasuredDataset["metrics"][MeasuredMetric]>][];

  if (applicable.length === 0) return base;

  const metrics: Record<string, ZoneMetrics> = {};

  for (const zone of base.zones) {
    const fixture = base.metrics[zone.h3] ?? {};
    const measured = dataset.cells[zone.h3];
    let next: ZoneMetrics | null = null;

    for (const [metric, summary] of applicable) {
      const value = measured?.[metric];
      if (!value || !isApplicable(value.confidence)) {
        // "all" means every cell or none, so a gap disqualifies the metric
        // wholesale — but that is `aggregate`'s call, already made in the file.
        // Here a gap simply leaves the fixture value in place.
        continue;
      }
      if (summary.replaces === "all" && summary.cells < base.zones.length) continue;

      next ??= { ...fixture };
      next[metric] = { value: value.value, confidence: value.confidence };
    }

    metrics[zone.h3] = next ?? fixture;
  }

  return { zones: base.zones, metrics };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Where a crawl writes, and where the app looks. */
export function metricsUrl(metro: string): string {
  return `/data/${metro}.metrics.json`;
}

export function transactionsUrl(metro: string): string {
  return `/data/${metro}.transactions.json`;
}

/**
 * Fetch and validate a crawl output, or return null.
 *
 * Never throws: no crawl having been run is the *expected* state, not an error,
 * and the whole point of the fallback is that the app does not notice.
 */
async function loadJson<T>(
  url: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(`Ignoring ${url}: it does not match the expected shape.`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

// Cached per process: the dataset is one file that never changes at runtime,
// and the map screen would otherwise refetch it on every remount.
let datasetPromise: Promise<ZoneDataset> | null = null;
let transactionsPromise: Promise<TransactionFile | null> | null = null;

export const measuredProvider: DataProvider = {
  ...fixtureProvider,
  id: "measured",

  async getZoneDataset() {
    datasetPromise ??= (async () => {
      const base = await fixtureProvider.getZoneDataset();
      const metro = await fixtureProvider.getMetro();

      const measured = await loadJson(
        metricsUrl(metro.id),
        measuredDataset as unknown as z.ZodType<MeasuredDataset>,
      );
      if (!measured) return base;

      return applyMeasurements(base, measured);
    })();

    return datasetPromise;
  },

  async getTransactions(topZones: ScoredZone[]) {
    const metro = await fixtureProvider.getMetro();
    transactionsPromise ??= loadJson(transactionsUrl(metro.id), transactionFile);

    const file = await transactionsPromise;
    if (!file) return [];

    const wanted = new Set(topZones.map((zone) => zone.zone.h3));
    const transactions: Transaction[] = [];

    for (const h3 of wanted) {
      for (const [index, record] of (file.cells[h3] ?? []).entries()) {
        transactions.push({ id: `${h3}-${index}`, h3, ...record });
      }
    }

    // Most recent first: a two-year-old sale is weaker evidence than a recent
    // one, and the date is on screen so the ordering is legible.
    return transactions.sort((a, b) => b.date.localeCompare(a.date));
  },
};

/** Test seam — the module-level caches would otherwise leak between cases. */
export function resetMeasuredCache(): void {
  datasetPromise = null;
  transactionsPromise = null;
}
