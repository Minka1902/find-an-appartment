import { cellToLatLng } from "h3-js";
import { describe, expect, it } from "vitest";

import { ZONE_RESOLUTION } from "@/lib/fixtures/zones";
import type { Zone } from "@/lib/scoring/types";
import { aggregate, cellFor, confidenceFor } from "./aggregate";
import type { Observation } from "./types";

/** A cell in central Tel Aviv, and one three rings away. */
const CENTRE = cellFor(32.0644, 34.7742);
const FAR = cellFor(32.09, 34.81);

function zone(h3: string): Zone {
  const [lat, lng] = cellToLatLng(h3);
  return {
    h3,
    centroid: { lat, lng },
    boundary: [],
    municipality: "Tel Aviv-Yafo",
    statAreaId: `t-${h3.slice(-3)}`,
  };
}

function at(h3: string, metric: Observation["metric"], value: number): Observation {
  const [lat, lng] = cellToLatLng(h3);
  return { metric, location: { lat, lng }, value };
}

const ZONES = [zone(CENTRE), zone(FAR)];

describe("cellFor", () => {
  it("keys cells the same way the ranked grid does", () => {
    // If these ever diverge, every measured value silently lands on a cell the
    // app does not rank, and the crawl looks like it did nothing.
    expect(CENTRE).toMatch(/^8[0-9a-f]+$/);
    expect(cellFor(32.0644, 34.7742)).toBe(CENTRE);
    expect(ZONE_RESOLUTION).toBe(9);
  });
});

describe("confidenceFor", () => {
  it("calls a one-record measurement low however good the source is", () => {
    expect(confidenceFor("high", 1)).toBe("low");
    expect(confidenceFor("high", 2)).toBe("low");
  });

  it("caps a thinly-sampled measurement at medium", () => {
    expect(confidenceFor("high", 4)).toBe("medium");
  });

  it("lets a well-sampled measurement keep the source's own confidence", () => {
    expect(confidenceFor("high", 12)).toBe("high");
    expect(confidenceFor("low", 12)).toBe("low");
  });
});

describe("aggregate", () => {
  it("takes the median of a sparse metric, so one outlier cannot reprice a cell", () => {
    const dataset = aggregate({
      metro: "gush-dan",
      zones: ZONES,
      sources: [
        {
          id: "nadlan",
          describe: "transactions",
          metrics: [{ metric: "cost", coverage: "sparse", confidence: "high" }],
          observations: [
            at(CENTRE, "cost", 40000),
            at(CENTRE, "cost", 42000),
            at(CENTRE, "cost", 44000),
            at(CENTRE, "cost", 900000),
          ],
        },
      ],
    });

    expect(dataset.cells[CENTRE].cost).toMatchObject({
      value: 43000,
      samples: 4,
      confidence: "medium",
    });
  });

  it("leaves a sparse metric absent where nothing was recorded", () => {
    // No deals means an unknown price level, not a price level of zero — the
    // app must fall back to the fixture rather than rank the cell as free.
    const dataset = aggregate({
      metro: "gush-dan",
      zones: ZONES,
      sources: [
        {
          id: "nadlan",
          describe: "transactions",
          metrics: [{ metric: "cost", coverage: "sparse", confidence: "high" }],
          observations: [at(CENTRE, "cost", 40000)],
        },
      ],
    });

    expect(dataset.cells[FAR]?.cost).toBeUndefined();
  });

  it("gives a complete metric a value everywhere, zeros included", () => {
    const dataset = aggregate({
      metro: "gush-dan",
      zones: ZONES,
      sources: [
        {
          id: "overpass",
          describe: "stops",
          metrics: [{ metric: "transit", coverage: "complete", confidence: "high" }],
          observations: [at(CENTRE, "transit", 1), at(CENTRE, "transit", 1)],
        },
      ],
    });

    expect(dataset.cells[CENTRE].transit).toMatchObject({ value: 2, samples: 2 });
    expect(dataset.cells[FAR].transit).toMatchObject({ value: 0, samples: 0 });
  });

  it("keeps a well-evidenced zero confident rather than downgrading it", () => {
    const dataset = aggregate({
      metro: "gush-dan",
      zones: ZONES,
      sources: [
        {
          id: "overpass",
          describe: "stops",
          metrics: [{ metric: "transit", coverage: "complete", confidence: "high" }],
          observations: [],
        },
      ],
    });

    expect(dataset.cells[FAR].transit?.confidence).toBe("high");
  });

  it("drops observations outside the ranked grid", () => {
    const dataset = aggregate({
      metro: "gush-dan",
      zones: [zone(CENTRE)],
      sources: [
        {
          id: "nadlan",
          describe: "transactions",
          metrics: [{ metric: "cost", coverage: "sparse", confidence: "high" }],
          // Haifa.
          observations: [
            { metric: "cost", location: { lat: 32.794, lng: 34.989 }, value: 30000 },
          ],
        },
      ],
    });

    expect(Object.keys(dataset.cells)).toEqual([]);
  });

  it("records the resolution so a stale file cannot be read against a new grid", () => {
    const dataset = aggregate({ metro: "gush-dan", zones: ZONES, sources: [] });
    expect(dataset.resolution).toBe(ZONE_RESOLUTION);
  });
});
