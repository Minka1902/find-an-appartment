import { describe, expect, it } from "vitest";

import { anchorDecay } from "./metrics/anchors";
import { aggregateCommute } from "./metrics/commute";
import { defaultWeights } from "./registry";
import { scoreZones, type ScoreZonesInput } from "./score-zones";
import { anchorTargetId, personTargetId } from "./targets";
import type {
  Household,
  Person,
  Zone,
  ZoneMetrics,
  ZoneTravel,
} from "./types";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function makeZone(id: string): Zone {
  return {
    h3: id,
    centroid: { lat: 32.07, lng: 34.78 },
    boundary: [
      [34.78, 32.07],
      [34.79, 32.07],
      [34.79, 32.08],
      [34.78, 32.07],
    ],
    municipality: "Tel Aviv-Yafo",
    statAreaId: "stat-1",
  };
}

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Alex",
    work: { lat: 32.07, lng: 34.79 },
    workLabel: "Rothschild 1",
    modes: ["transit"],
    daysInOffice: 5,
    maxCommuteMinutes: 60,
    weight: 1,
    ...overrides,
  };
}

function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: "h1",
    metro: "gush-dan",
    people: [makePerson()],
    anchors: [],
    carCount: 1,
    requiresStreetParking: false,
    maxCost: null,
    weights: defaultWeights(),
    commuteAggregation: "balanced",
    ...overrides,
  };
}

/**
 * Weights with everything off except the named metrics.
 *
 * An absent key falls back to the metric's `defaultWeight`, so isolating one
 * metric means zeroing the rest rather than omitting them.
 */
function onlyWeights(...keys: string[]): Record<string, number> {
  const weights = defaultWeights();
  for (const key of Object.keys(weights)) {
    weights[key] = keys.includes(key) ? 1 : 0;
  }
  return weights;
}

/** Every zone gets identical static metrics unless overridden. */
function staticMetrics(overrides: Record<string, number> = {}): ZoneMetrics {
  const base: Record<string, number> = {
    transit: 50,
    cost: 30000,
    parking: 50,
    shelter: 50,
    shabbat: 50,
    socioeconomic: 5,
    ...overrides,
  };

  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      { value, confidence: "high" as const },
    ]),
  );
}

function travelTo(personMinutes: number | null): ZoneTravel {
  return { minutes: { [personTargetId("p1")]: personMinutes } };
}

/** Build a scoring input from `[zoneId, commuteMinutes, staticOverrides]`. */
function buildInput(
  rows: [string, number | null, Record<string, number>?][],
  household: Household,
): ScoreZonesInput {
  return {
    zones: rows.map(([id]) => makeZone(id)),
    metrics: Object.fromEntries(
      rows.map(([id, , overrides]) => [id, staticMetrics(overrides)]),
    ),
    travel: Object.fromEntries(
      rows.map(([id, minutes]) => [id, travelTo(minutes)]),
    ),
    household,
  };
}

// ---------------------------------------------------------------------------

describe("hard filters", () => {
  it("rejects a zone past a person's max commute", () => {
    const household = makeHousehold({
      people: [makePerson({ maxCommuteMinutes: 30 })],
    });
    const result = scoreZones(
      buildInput(
        [
          ["a", 20],
          ["b", 45],
        ],
        household,
      ),
    );

    expect(result.scored.map((z) => z.zone.h3)).toEqual(["a"]);
    expect(result.rejectionCounts["over-max-commute"]).toBe(1);
    expect(result.rejections[0].detail).toContain("Alex");
  });

  it("rejects zones over budget only when maxCost is set", () => {
    const rows: [string, number, Record<string, number>][] = [
      ["cheap", 20, { cost: 20000 }],
      ["pricey", 20, { cost: 60000 }],
    ];

    const unlimited = scoreZones(buildInput(rows, makeHousehold()));
    expect(unlimited.scored).toHaveLength(2);

    const capped = scoreZones(
      buildInput(rows, makeHousehold({ maxCost: 40000 })),
    );
    expect(capped.scored.map((z) => z.zone.h3)).toEqual(["cheap"]);
    expect(capped.rejectionCounts["over-budget"]).toBe(1);
  });

  it("rejects zones with no parking when street parking is required", () => {
    const household = makeHousehold({ requiresStreetParking: true });
    const result = scoreZones(
      buildInput(
        [
          ["ok", 20, { parking: 40 }],
          ["none", 20, { parking: 0 }],
        ],
        household,
      ),
    );

    expect(result.scored.map((z) => z.zone.h3)).toEqual(["ok"]);
    expect(result.rejectionCounts["no-parking"]).toBe(1);
  });

  it("rejects unreachable zones under the default policy", () => {
    const result = scoreZones(
      buildInput(
        [
          ["reachable", 25],
          ["nowhere", null],
        ],
        makeHousehold(),
      ),
    );

    expect(result.scored.map((z) => z.zone.h3)).toEqual(["reachable"]);
    expect(result.rejectionCounts.unreachable).toBe(1);
  });
});

describe("winsorized normalization", () => {
  it("does not let outliers compress the real differences", () => {
    // Commute-only ranking so the outliers' effect is isolated.
    const household = makeHousehold({
      people: [makePerson({ maxCommuteMinutes: 600 })],
      weights: onlyWeights("commute"),
    });

    // p5/p95 only trims outliers once the sample is large enough that 5% of it
    // is at least one point — below ~20 zones the percentile interpolates into
    // the outlier itself. Real runs cover 2–4k cells, so test at that scale.
    const normal: [string, number][] = Array.from({ length: 100 }, (_, i) => [
      `n${i}`,
      10 + (i % 21),
    ]);
    const outliers: [string, number][] = Array.from({ length: 5 }, (_, i) => [
      `far${i}`,
      600,
    ]);

    const withoutOutliers = scoreZones(buildInput(normal, household));
    const withOutliers = scoreZones(
      buildInput([...normal, ...outliers], household),
    );

    const spread = (result: ReturnType<typeof scoreZones>) => {
      const scores = result.scored
        .filter((z) => !z.zone.h3.startsWith("far"))
        .map((z) => z.score);
      return Math.max(...scores) - Math.min(...scores);
    };

    // Plain min-max would crush the 10–30 min band into a few points of range.
    // Winsorizing keeps essentially all of the spread.
    expect(spread(withOutliers)).toBeCloseTo(spread(withoutOutliers), 0);
    expect(spread(withOutliers)).toBeGreaterThan(90);
  });

  it("gives every zone the same score when a metric is constant", () => {
    const household = makeHousehold({ weights: { transit: 1 } });
    const result = scoreZones(
      buildInput(
        [
          ["a", 20],
          ["b", 20],
        ],
        household,
      ),
    );

    expect(result.scored[0].score).toBeCloseTo(result.scored[1].score);
  });
});

describe("weight handling", () => {
  it("drops parking and redistributes its weight when there is no car", () => {
    const household = makeHousehold({ carCount: 0 });
    const result = scoreZones(
      buildInput(
        [
          ["a", 20],
          ["b", 30],
        ],
        household,
      ),
    );

    expect(result.activeWeights).not.toHaveProperty("parking");
    expect(result.droppedMetrics.map((m) => m.key)).toContain("parking");

    const total = Object.values(result.activeWeights).reduce(
      (sum, w) => sum + w,
      0,
    );
    expect(total).toBeCloseTo(1);
  });

  it("always renormalizes active weights to 1", () => {
    const household = makeHousehold({
      weights: { commute: 0.2, transit: 0.2, cost: 0.2 },
    });
    const result = scoreZones(
      buildInput(
        [
          ["a", 20, { transit: 80 }],
          ["b", 40, { transit: 20 }],
        ],
        household,
      ),
    );

    const total = Object.values(result.activeWeights).reduce(
      (sum, w) => sum + w,
      0,
    );
    expect(total).toBeCloseTo(1);
    expect(result.scored[0].score).toBeLessThanOrEqual(100);
  });

  it("excludes zero-weight metrics from the breakdown", () => {
    const household = makeHousehold({
      weights: { ...defaultWeights(), transit: 0 },
    });
    const result = scoreZones(
      buildInput(
        [
          ["a", 20],
          ["b", 30],
        ],
        household,
      ),
    );

    expect(result.scored[0].breakdown.map((b) => b.key)).not.toContain(
      "transit",
    );
    expect(
      result.droppedMetrics.find((m) => m.key === "transit")?.reason,
    ).toBe("zero-weight");
  });
});

describe("commute aggregation", () => {
  const samples = [
    { personId: "a", minutes: 20, weight: 5 },
    { personId: "b", minutes: 60, weight: 1 },
  ];

  it("weights the mean by days in office", () => {
    // Unweighted mean would be 40; the 5-day person pulls it toward 20.
    expect(aggregateCommute(samples, "mean")).toBeCloseTo((20 * 5 + 60) / 6);
  });

  it("takes the worst commute under max", () => {
    expect(aggregateCommute(samples, "max")).toBe(60);
  });

  it("puts balanced between mean and max", () => {
    const mean = aggregateCommute(samples, "mean")!;
    const max = aggregateCommute(samples, "max")!;
    const balanced = aggregateCommute(samples, "balanced")!;

    expect(balanced).toBeGreaterThan(mean);
    expect(balanced).toBeLessThan(max);
  });

  it("returns null when anyone is unreachable", () => {
    expect(
      aggregateCommute(
        [{ personId: "a", minutes: null, weight: 5 }],
        "balanced",
      ),
    ).toBeNull();
  });

  it("falls back to an unweighted mean when everyone is fully remote", () => {
    const remote = [
      { personId: "a", minutes: 20, weight: 0 },
      { personId: "b", minutes: 60, weight: 0 },
    ];
    expect(aggregateCommute(remote, "mean")).toBeCloseTo(40);
  });
});

describe("anchor decay", () => {
  it("is non-linear: a 10-minute step near home is not a 60-minute step far away", () => {
    const nearGap = anchorDecay(20) - anchorDecay(30);
    const farGap = anchorDecay(30) - anchorDecay(90);

    // 20 vs 30 min is nearly the same life; 30 vs 90 is not, so the wider gap
    // must cost more in total...
    expect(farGap).toBeGreaterThan(nearGap);

    // ...while each individual minute still matters most when you're close,
    // which is what linear distance cannot express.
    expect(farGap / 60).toBeLessThan(nearGap / 10);
  });

  it("is monotonically decreasing and bounded", () => {
    expect(anchorDecay(0)).toBeCloseTo(1);
    expect(anchorDecay(15)).toBeGreaterThan(anchorDecay(45));
    expect(anchorDecay(240)).toBeGreaterThan(0);
  });

  it("scores a zone near family above an identical distant one", () => {
    const household = makeHousehold({
      anchors: [
        {
          id: "mum",
          label: "Mum",
          location: { lat: 32.1, lng: 34.8 },
          locationLabel: "Ramat Gan",
          visitsPerMonth: 8,
          modes: ["drive"],
        },
      ],
      weights: onlyWeights("anchors"),
    });

    const input = buildInput(
      [
        ["near", 20],
        ["far", 20],
      ],
      household,
    );
    input.travel.near.minutes[anchorTargetId("mum")] = 10;
    input.travel.far.minutes[anchorTargetId("mum")] = 55;

    const result = scoreZones(input);
    expect(result.scored[0].zone.h3).toBe("near");
  });
});

describe("result shape", () => {
  it("ranks survivors from 1 and exposes a full breakdown", () => {
    const result = scoreZones(
      buildInput(
        [
          ["a", 15, { transit: 90 }],
          ["b", 35, { transit: 30 }],
          ["c", 50, { transit: 10 }],
        ],
        makeHousehold(),
      ),
    );

    expect(result.scored.map((z) => z.rank)).toEqual([1, 2, 3]);
    expect(result.scored[0].zone.h3).toBe("a");
    expect(result.zonesConsidered).toBe(3);

    const breakdown = result.scored[0].breakdown;
    expect(breakdown.length).toBeGreaterThan(0);

    // Contributions must reconstruct the score exactly — this is what the
    // cell-detail screen shows to justify the ranking.
    const sum = breakdown.reduce((total, b) => total + b.contribution, 0);
    expect(sum * 100).toBeCloseTo(result.scored[0].score);

    // Sorted by influence, so the UI can lead with the reason that mattered.
    for (let i = 1; i < breakdown.length; i++) {
      expect(breakdown[i - 1].contribution).toBeGreaterThanOrEqual(
        breakdown[i].contribution,
      );
    }
  });

  it("reports per-person commutes and anchor times for each zone", () => {
    const household = makeHousehold({
      people: [
        makePerson(),
        makePerson({ id: "p2", name: "Sam", work: null, daysInOffice: 0 }),
      ],
    });
    const result = scoreZones(buildInput([["a", 20]], household));

    expect(result.scored[0].commutes).toHaveLength(2);
    expect(result.scored[0].commutes[0].minutes).toBe(20);
    expect(result.scored[0].commutes[1].minutes).toBeNull();
  });

  it("returns an empty ranking rather than throwing when all zones fail", () => {
    const household = makeHousehold({
      people: [makePerson({ maxCommuteMinutes: 5 })],
    });
    const result = scoreZones(buildInput([["a", 60]], household));

    expect(result.scored).toEqual([]);
    expect(result.rejections).toHaveLength(1);
  });
});
