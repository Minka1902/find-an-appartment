import { describe, expect, it } from "vitest";

import { explainExclusions } from "./explain";
import { defaultWeights } from "./registry";
import type {
  Household,
  Person,
  Rejection,
  ScoringResult,
} from "./types";

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "Maya",
    work: { lat: 32.07, lng: 34.79 },
    workLabel: "Rothschild 1",
    modes: ["transit"],
    daysInOffice: 5,
    maxCommuteMinutes: 45,
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
    unreachablePolicy: "reject",
    ...overrides,
  };
}

function commuteRejection(
  h3: string,
  overruns: { personId: string; name: string; minutes: number; limit: number }[],
): Rejection {
  return {
    h3,
    reasons: ["over-max-commute"],
    detail: "",
    commuteOverruns: overruns,
    costOverrun: null,
  };
}

function makeResult(rejections: Rejection[]): ScoringResult {
  return {
    scored: [],
    rejections,
    rejectionCounts: {
      "over-max-commute": 0,
      "over-budget": 0,
      "no-parking": 0,
      unreachable: 0,
    },
    activeWeights: {},
    droppedMetrics: [],
    zonesConsidered: rejections.length,
  };
}

describe("explainExclusions", () => {
  describe("blockedSolelyBy", () => {
    it("counts zones with exactly one reason", () => {
      const result = makeResult([
        commuteRejection("a", [
          { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
        ]),
        commuteRejection("b", [
          { personId: "p1", name: "Maya", minutes: 55, limit: 45 },
        ]),
      ]);

      const explanation = explainExclusions(result, makeHousehold());
      expect(explanation.blockedSolelyBy["over-max-commute"]).toBe(2);
      expect(explanation.total).toBe(2);
    });

    it("excludes zones blocked by more than one thing", () => {
      // The whole point of this number: relaxing any single constraint would
      // not admit this zone, so counting it under each would be a lie.
      const result = makeResult([
        {
          h3: "a",
          reasons: ["over-max-commute", "over-budget"],
          detail: "",
          commuteOverruns: [
            { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
          ],
          costOverrun: 60000,
        },
      ]);

      const explanation = explainExclusions(result, makeHousehold());
      expect(explanation.blockedSolelyBy["over-max-commute"]).toBe(0);
      expect(explanation.blockedSolelyBy["over-budget"]).toBe(0);
      expect(explanation.total).toBe(1);
    });
  });

  describe("commute suggestions", () => {
    it("proposes a limit and counts exactly what it admits", () => {
      // Overruns of 50, 60, 70 -> median 60, already a multiple of 5.
      // At 60 minutes, the 50 and 60 zones qualify; the 70 does not.
      const result = makeResult([
        commuteRejection("a", [
          { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
        ]),
        commuteRejection("b", [
          { personId: "p1", name: "Maya", minutes: 60, limit: 45 },
        ]),
        commuteRejection("c", [
          { personId: "p1", name: "Maya", minutes: 70, limit: 45 },
        ]),
      ]);

      const [suggestion] = explainExclusions(result, makeHousehold()).suggestions;
      expect(suggestion.action).toEqual({
        kind: "person-commute",
        personId: "p1",
        maxCommuteMinutes: 60,
      });
      expect(suggestion.unlocks).toBe(2);
      expect(suggestion.label).toBe("Give Maya 60 minutes");
    });

    it("rounds a proposed limit up to a tidy number", () => {
      const result = makeResult([
        commuteRejection("a", [
          { personId: "p1", name: "Maya", minutes: 47, limit: 45 },
        ]),
      ]);

      const [suggestion] = explainExclusions(result, makeHousehold()).suggestions;
      expect(suggestion.action).toMatchObject({ maxCommuteMinutes: 50 });
      expect(suggestion.unlocks).toBe(1);
    });

    it("does not count a zone a second person also blocks", () => {
      // Raising Maya's cap cannot admit a zone Yonatan is also over on.
      const household = makeHousehold({
        people: [
          makePerson(),
          makePerson({ id: "p2", name: "Yonatan", maxCommuteMinutes: 60 }),
        ],
      });

      const result = makeResult([
        commuteRejection("a", [
          { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
        ]),
        commuteRejection("b", [
          { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
          { personId: "p2", name: "Yonatan", minutes: 90, limit: 60 },
        ]),
      ]);

      const suggestion = explainExclusions(result, household).suggestions.find(
        (item) => item.id === "commute:p1",
      );

      expect(suggestion?.unlocks).toBe(1);
    });

    it("makes no suggestion when nothing would change", () => {
      const result = makeResult([]);
      expect(explainExclusions(result, makeHousehold()).suggestions).toEqual([]);
    });
  });

  describe("other constraints", () => {
    it("offers to drop the parking requirement", () => {
      const result = makeResult([
        {
          h3: "a",
          reasons: ["no-parking"],
          detail: "",
          commuteOverruns: [],
          costOverrun: null,
        },
      ]);

      const explanation = explainExclusions(
        result,
        makeHousehold({ requiresStreetParking: true }),
      );

      expect(explanation.suggestions[0]).toMatchObject({
        id: "parking",
        unlocks: 1,
        action: { kind: "street-parking", requiresStreetParking: false },
      });
    });

    it("offers to raise the price ceiling", () => {
      const result = makeResult([
        {
          h3: "a",
          reasons: ["over-budget"],
          detail: "",
          commuteOverruns: [],
          costOverrun: 41200,
        },
      ]);

      const explanation = explainExclusions(
        result,
        makeHousehold({ maxCost: 40000 }),
      );

      expect(explanation.suggestions[0]).toMatchObject({
        id: "cost",
        unlocks: 1,
        action: { kind: "max-cost", maxCost: 42000 },
      });
    });

    it("offers to keep unroutable areas when the policy rejects them", () => {
      const result = makeResult([
        {
          h3: "a",
          reasons: ["unreachable"],
          detail: "",
          commuteOverruns: [],
          costOverrun: null,
        },
      ]);

      const explanation = explainExclusions(result, makeHousehold());
      expect(explanation.suggestions[0]).toMatchObject({
        id: "unreachable",
        unlocks: 1,
      });
    });

    it("says nothing about a constraint that isn't switched on", () => {
      const result = makeResult([
        {
          h3: "a",
          reasons: ["no-parking"],
          detail: "",
          commuteOverruns: [],
          costOverrun: null,
        },
      ]);

      // Parking is not required, so it cannot be the thing to relax.
      const explanation = explainExclusions(
        result,
        makeHousehold({ requiresStreetParking: false }),
      );
      expect(explanation.suggestions).toEqual([]);
    });
  });

  it("ranks suggestions by how much they admit", () => {
    const result = makeResult([
      commuteRejection("a", [
        { personId: "p1", name: "Maya", minutes: 50, limit: 45 },
      ]),
      ...Array.from({ length: 5 }, (_, index) => ({
        h3: `p${index}`,
        reasons: ["no-parking" as const],
        detail: "",
        commuteOverruns: [],
        costOverrun: null,
      })),
    ]);

    const explanation = explainExclusions(
      result,
      makeHousehold({ requiresStreetParking: true }),
    );

    expect(explanation.suggestions.map((item) => item.id)).toEqual([
      "parking",
      "commute:p1",
    ]);
  });
});
