import { describe, expect, it } from "vitest";

import type { MeasuredDataset } from "@/lib/crawler/types";
import { ZONE_RESOLUTION, type ZoneDataset } from "@/lib/fixtures/zones";
import type { Zone } from "@/lib/scoring/types";
import { applyMeasurements } from "./measured";

const A = "892db0cc3d3ffff";
const B = "892db0cdd2fffff";

function zone(h3: string): Zone {
  return {
    h3,
    centroid: { lat: 32.06, lng: 34.77 },
    boundary: [],
    municipality: "Tel Aviv-Yafo",
    statAreaId: `t-${h3.slice(-3)}`,
  };
}

const BASE: ZoneDataset = {
  zones: [zone(A), zone(B)],
  metrics: {
    [A]: {
      cost: { value: 50_000, confidence: "medium" },
      transit: { value: 80, confidence: "high" },
    },
    [B]: {
      cost: { value: 30_000, confidence: "medium" },
      transit: { value: 40, confidence: "high" },
    },
  },
};

function dataset(overrides: Partial<MeasuredDataset>): MeasuredDataset {
  return {
    metro: "gush-dan",
    generatedAt: "2026-01-01T00:00:00.000Z",
    resolution: ZONE_RESOLUTION,
    sources: [],
    metrics: {},
    cells: {},
    ...overrides,
  };
}

describe("applyMeasurements", () => {
  it("replaces a same-units metric cell by cell", () => {
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          cost: {
            coverage: "sparse",
            source: "nadlan",
            cells: 1,
            cellsWithSignal: 1,
            confidence: "high",
            replaces: "per-cell",
          },
        },
        cells: {
          [A]: {
            cost: { value: 61_500, samples: 9, confidence: "high", source: "nadlan" },
          },
        },
      }),
    );

    expect(merged.metrics[A].cost).toEqual({ value: 61_500, confidence: "high" });
    // Untouched: no deals here means an unknown price level, not a free one.
    expect(merged.metrics[B].cost).toEqual({ value: 30_000, confidence: "medium" });
  });

  it("leaves other metrics on the same cell alone", () => {
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          cost: {
            coverage: "sparse",
            source: "nadlan",
            cells: 1,
            cellsWithSignal: 1,
            confidence: "high",
            replaces: "per-cell",
          },
        },
        cells: {
          [A]: {
            cost: { value: 61_500, samples: 9, confidence: "high", source: "nadlan" },
          },
        },
      }),
    );

    expect(merged.metrics[A].transit).toEqual({ value: 80, confidence: "high" });
  });

  it("ignores a low-confidence measurement", () => {
    // Two recorded sales is an anecdote, and the fixture at least has the
    // decency to be internally consistent.
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          cost: {
            coverage: "sparse",
            source: "nadlan",
            cells: 1,
            cellsWithSignal: 1,
            confidence: "high",
            replaces: "per-cell",
          },
        },
        cells: {
          [A]: {
            cost: { value: 61_500, samples: 2, confidence: "low", source: "nadlan" },
          },
        },
      }),
    );

    expect(merged.metrics[A].cost).toEqual({ value: 50_000, confidence: "medium" });
  });

  it("ignores a metric the crawl marked unusable", () => {
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          transit: {
            coverage: "complete",
            source: "overpass",
            cells: 2,
            cellsWithSignal: 2,
            confidence: "low",
            replaces: "none",
            reason: "low confidence at source",
          },
        },
        cells: {
          [A]: { transit: { value: 6, samples: 6, confidence: "low", source: "overpass" } },
          [B]: { transit: { value: 0, samples: 0, confidence: "low", source: "overpass" } },
        },
      }),
    );

    expect(merged.metrics[A].transit).toEqual({ value: 80, confidence: "high" });
  });

  it("replaces an all-or-nothing metric everywhere, zeros included", () => {
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          transit: {
            coverage: "complete",
            source: "overpass",
            cells: 2,
            cellsWithSignal: 2,
            confidence: "high",
            replaces: "all",
          },
        },
        cells: {
          [A]: { transit: { value: 6, samples: 6, confidence: "high", source: "overpass" } },
          [B]: { transit: { value: 0, samples: 0, confidence: "high", source: "overpass" } },
        },
      }),
    );

    expect(merged.metrics[A].transit).toEqual({ value: 6, confidence: "high" });
    expect(merged.metrics[B].transit).toEqual({ value: 0, confidence: "high" });
  });

  it("refuses an all-or-nothing metric that does not cover every cell", () => {
    // Half the board in stop counts and half in 0–100 scores is one axis with
    // two scales on it, which reorders the ranking without looking wrong.
    const merged = applyMeasurements(
      BASE,
      dataset({
        metrics: {
          transit: {
            coverage: "complete",
            source: "overpass",
            cells: 1,
            cellsWithSignal: 1,
            confidence: "high",
            replaces: "all",
          },
        },
        cells: {
          [A]: { transit: { value: 6, samples: 6, confidence: "high", source: "overpass" } },
        },
      }),
    );

    expect(merged.metrics[A].transit).toEqual({ value: 80, confidence: "high" });
    expect(merged.metrics[B].transit).toEqual({ value: 40, confidence: "high" });
  });

  it("ignores a dataset built against a different grid", () => {
    const merged = applyMeasurements(
      BASE,
      dataset({
        resolution: ZONE_RESOLUTION + 1,
        metrics: {
          cost: {
            coverage: "sparse",
            source: "nadlan",
            cells: 1,
            cellsWithSignal: 1,
            confidence: "high",
            replaces: "per-cell",
          },
        },
        cells: {
          [A]: {
            cost: { value: 61_500, samples: 9, confidence: "high", source: "nadlan" },
          },
        },
      }),
    );

    expect(merged).toBe(BASE);
  });

  it("is a no-op when nothing was measured", () => {
    expect(applyMeasurements(BASE, dataset({}))).toBe(BASE);
  });
});

describe("data module graph", () => {
  it("imports cleanly whichever module is reached first", async () => {
    // measured.ts and provider.ts refer to each other. Reaching measured.ts
    // first used to leave `provider` undefined, because `measuredProvider`
    // spreads `fixtureProvider` at module scope and that binding was still in
    // its temporal dead zone. The fixture implementation lives in its own
    // module now; this is the guard.
    const measured = await import("./measured");
    expect(measured.measuredProvider.id).toBe("measured");

    const provider = await import("./provider");
    expect(provider.provider.id).toBe("measured");
  });
});
