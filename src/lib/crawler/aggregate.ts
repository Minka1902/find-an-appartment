/**
 * Roll geolocated observations up to the H3 cells the app already ranks.
 *
 * The join is the whole point: cells are keyed by the same `latLngToCell` at
 * the same resolution as `fixtures/zones.ts`, so a measured value drops into
 * `ZoneMetrics` with no translation layer and no second grid to keep in sync.
 *
 * Nothing here normalizes anything. The scoring engine already winsorizes and
 * rescales raw metric values across the board (`score-zones.ts`), so a median
 * price stays in ₪/m² and a stop count stays a count all the way to the UI —
 * which is what makes "medium confidence, 4 deals" a statement anyone can check.
 */

import { gridDisk, latLngToCell } from "h3-js";

import { ZONE_RESOLUTION } from "@/lib/fixtures/zones";
import { percentile } from "@/lib/scoring/stats";
import type { Confidence, Zone } from "@/lib/scoring/types";
import type {
  MeasuredDataset,
  MeasuredMetric,
  MeasuredMetricSummary,
  MeasuredValue,
  MetricCoverage,
  Observation,
  Replacement,
} from "./types";

/**
 * Sample counts at which a measurement earns its confidence.
 *
 * Below the lower bound a number is an anecdote: one recorded sale in a cell
 * says almost nothing about the cell, and presenting it beside eleven others
 * with the same authority is the failure mode this app exists to avoid.
 */
export const MIN_SAMPLES_MEDIUM = 3;
export const MIN_SAMPLES_HIGH = 8;

/**
 * How far a count metric reaches.
 *
 * A res-9 cell is ~340m across, so a station one cell over is a two-minute walk
 * and plainly serves this cell too. `1` sums the cell and its six neighbours —
 * roughly a 1km² catchment — which is a defensible reading of "transit near
 * here" and stops the layer looking like scattered dots.
 */
export const COUNT_RING = 1;

/**
 * How much of the grid a complete metric must actually find something in.
 *
 * A complete metric covers every cell by construction — that is what
 * "complete" means — so cell coverage alone can never catch a query that
 * timed out, was rate-limited into a partial answer, or hit an area nobody has
 * mapped. All three arrive as a grid of confident zeros, which would replace a
 * modelled signal with an artefact. Below this share the fixture stays, and the
 * file says why.
 */
export const MIN_COMPLETE_SIGNAL = 0.02;

export interface AggregateInput {
  metro: string;
  /** The live grid. Cells outside it are dropped — they cannot be ranked. */
  zones: Zone[];
  sources: {
    id: string;
    describe: string;
    metrics: MetricCoverage[];
    observations: Observation[];
  }[];
}

/** Cap a source's own confidence by how many records back the number. */
export function confidenceFor(base: Confidence, samples: number): Confidence {
  if (samples < MIN_SAMPLES_MEDIUM) return "low";
  if (samples < MIN_SAMPLES_HIGH) return base === "high" ? "medium" : base;
  return base;
}

/**
 * The cell a point belongs to.
 *
 * Exported because the identity of this call — same function, same resolution
 * as the grid — is the contract between the crawler and the app.
 */
export function cellFor(lat: number, lng: number): string {
  return latLngToCell(lat, lng, ZONE_RESOLUTION);
}

/**
 * May this metric stand in for the fixture value, and how?
 *
 * The units question decides everything. Sale prices are ₪/m² on both sides, so
 * a measured cell can sit beside a generated one. A count of bus stops cannot —
 * mixing counts with the fixture's 0–100 scores puts two scales on one axis and
 * silently reorders the board — so those metrics are all-or-nothing, and are
 * cleared only once every ranked cell has a number.
 */
function verdictFor(
  metric: MetricCoverage,
  measuredCells: number,
  totalCells: number,
  cellsWithSignal: number,
): { replaces: Replacement; reason?: string } {
  if (metric.confidence === "low") {
    return {
      replaces: "none",
      reason: `low confidence at source — recorded, but not applied`,
    };
  }

  if (metric.sameUnitsAsFixture) return { replaces: "per-cell" };

  if (measuredCells < totalCells) {
    return {
      replaces: "none",
      reason:
        `not in the fixture's units, so it can only replace every cell at once — ` +
        `${measuredCells} of ${totalCells} covered`,
    };
  }

  const share = totalCells === 0 ? 0 : cellsWithSignal / totalCells;
  if (share < MIN_COMPLETE_SIGNAL) {
    return {
      replaces: "none",
      reason:
        `only ${cellsWithSignal} of ${totalCells} cells found anything, below the ` +
        `${Math.round(MIN_COMPLETE_SIGNAL * 100)}% floor — a partial or failed ` +
        `query looks exactly like this, so the fixture stays`,
    };
  }

  return { replaces: "all" };
}

export function aggregate(input: AggregateInput): MeasuredDataset {
  const grid = new Set(input.zones.map((zone) => zone.h3));
  const cells: MeasuredDataset["cells"] = {};
  const metrics: MeasuredDataset["metrics"] = {};

  const put = (h3: string, metric: MeasuredMetric, value: MeasuredValue) => {
    cells[h3] ??= {};
    const existing = cells[h3][metric];
    // Two sources offering the same metric: the better-evidenced one wins,
    // rather than the one that happened to run second.
    if (existing && existing.samples >= value.samples) return;
    cells[h3][metric] = value;
  };

  for (const source of input.sources) {
    for (const {
      metric,
      coverage,
      confidence,
      sameUnitsAsFixture,
    } of source.metrics) {
      const relevant = source.observations.filter((o) => o.metric === metric);

      // Bucket by cell, dropping anything outside the ranked grid.
      const byCell = new Map<string, number[]>();
      for (const observation of relevant) {
        const h3 = cellFor(observation.location.lat, observation.location.lng);
        if (!grid.has(h3)) continue;
        const bucket = byCell.get(h3);
        if (bucket) bucket.push(observation.value);
        else byCell.set(h3, [observation.value]);
      }

      const summarise = (measuredCells: number, cellsWithSignal: number): void => {
        const summary: MeasuredMetricSummary = {
          coverage,
          source: source.id,
          cells: measuredCells,
          cellsWithSignal,
          confidence,
          ...verdictFor(
            { metric, coverage, confidence, sameUnitsAsFixture },
            measuredCells,
            input.zones.length,
            cellsWithSignal,
          ),
        };
        // A metric offered by two sources keeps the wider coverage.
        const existing = metrics[metric];
        if (!existing || existing.cells < measuredCells) metrics[metric] = summary;
      };

      if (coverage === "sparse") {
        // A price level is the middle of what actually sold there. The median,
        // not the mean: one penthouse should not reprice a street.
        for (const [h3, values] of byCell) {
          put(h3, metric, {
            value: Math.round(percentile(values, 0.5)),
            samples: values.length,
            confidence: confidenceFor(confidence, values.length),
            source: source.id,
          });
        }
        // Every sparse cell has a real record behind it by definition.
        summarise(byCell.size, byCell.size);
        continue;
      }

      // Complete coverage: every cell in the grid gets a number, including the
      // zeros — the query covered the whole bbox, so "none here" is a finding.
      let cellsWithSignal = 0;
      for (const zone of input.zones) {
        let total = 0;
        let contributing = 0;
        for (const neighbour of gridDisk(zone.h3, COUNT_RING)) {
          const values = byCell.get(neighbour);
          if (!values) continue;
          for (const value of values) total += value;
          contributing += values.length;
        }

        if (total > 0) cellsWithSignal++;

        put(zone.h3, metric, {
          value: total,
          samples: contributing,
          // A confident zero: the sample count measures how much was found, and
          // finding nothing over a whole neighbourhood is itself well-evidenced
          // once the source covers the area. Confidence therefore comes from
          // the source, not from the count.
          confidence,
          source: source.id,
        });
      }

      summarise(input.zones.length, cellsWithSignal);
    }
  }

  return {
    metro: input.metro,
    generatedAt: new Date().toISOString(),
    resolution: ZONE_RESOLUTION,
    sources: input.sources.map((source) => ({
      id: source.id,
      describe: source.describe,
      records: source.observations.length,
    })),
    metrics,
    cells,
  };
}
