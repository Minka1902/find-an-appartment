import { describe, expect, it } from "vitest";

import { demoHousehold } from "@/lib/fixtures/household";
import { parseHousehold, parseHouseholdOrDemo } from "./household-schema";

/**
 * These guard the boot path. `localStorage` is user-writable and survives
 * deploys that change the shape of `Household`, so anything that gets through
 * here reaches `scoreZones` directly.
 */
describe("parseHousehold", () => {
  it("accepts a real household unchanged", () => {
    const household = demoHousehold();
    expect(parseHousehold(household)).toEqual(household);
  });

  it("rejects non-objects", () => {
    expect(parseHousehold(null)).toBeNull();
    expect(parseHousehold(undefined)).toBeNull();
    expect(parseHousehold("household")).toBeNull();
    expect(parseHousehold([])).toBeNull();
  });

  it("rejects a household with nobody in it", () => {
    expect(parseHousehold({ ...demoHousehold(), people: [] })).toBeNull();
  });

  it("rejects a person with no travel modes", () => {
    // With no modes there is no way to route to them, and every zone would
    // silently read as unreachable.
    const household = demoHousehold();
    expect(
      parseHousehold({
        ...household,
        people: [{ ...household.people[0], modes: [] }],
      }),
    ).toBeNull();
  });

  it("rejects a string where a number belongs", () => {
    const household = demoHousehold();
    expect(
      parseHousehold({
        ...household,
        people: [{ ...household.people[0], daysInOffice: "five" }],
      }),
    ).toBeNull();
  });

  it("rejects coordinates outside the possible range", () => {
    const household = demoHousehold();
    expect(
      parseHousehold({
        ...household,
        people: [{ ...household.people[0], work: { lat: 999, lng: 34.7 } }],
      }),
    ).toBeNull();
  });

  it("rejects an unknown aggregation", () => {
    expect(
      parseHousehold({ ...demoHousehold(), commuteAggregation: "median" }),
    ).toBeNull();
  });

  it("defaults the unreachable policy for state saved before it existed", () => {
    // This *is* the v1 -> v2 migration: older entries simply have no such key.
    const withoutPolicy: Record<string, unknown> = { ...demoHousehold() };
    delete withoutPolicy.unreachablePolicy;

    expect(parseHousehold(withoutPolicy)?.unreachablePolicy).toBe("reject");
  });

  it("allows a null work address, for someone who hasn't set one", () => {
    const household = demoHousehold();
    const parsed = parseHousehold({
      ...household,
      people: [{ ...household.people[0], work: null, workLabel: "" }],
    });
    expect(parsed?.people[0].work).toBeNull();
  });
});

describe("parseHouseholdOrDemo", () => {
  it("falls back rather than leaving the app unbootable", () => {
    // Losing a corrupt setup is bad; an app that cannot start costs the user
    // the same setup and leaves no way back in.
    expect(parseHouseholdOrDemo("garbage")).toEqual(demoHousehold());
  });

  it("passes a valid household straight through", () => {
    const household = demoHousehold();
    expect(parseHouseholdOrDemo(household)).toEqual(household);
  });
});
