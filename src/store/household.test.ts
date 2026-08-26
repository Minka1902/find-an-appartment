import { beforeEach, describe, expect, it } from "vitest";

import { demoHousehold } from "@/lib/fixtures/household";
import { MAX_PINNED, useHouseholdStore } from "./household";

/** Reset to a known state; the store is a module singleton. */
beforeEach(() => {
  useHouseholdStore.setState({
    household: demoHousehold(),
    selectedZone: null,
    pinned: [],
  });
});

describe("pinning", () => {
  it("adds and removes a pin", () => {
    const { togglePin } = useHouseholdStore.getState();

    togglePin("cell-a");
    expect(useHouseholdStore.getState().pinned).toEqual(["cell-a"]);

    togglePin("cell-a");
    expect(useHouseholdStore.getState().pinned).toEqual([]);
  });

  it("keeps the newest pin first", () => {
    const { togglePin } = useHouseholdStore.getState();

    togglePin("cell-a");
    togglePin("cell-b");

    expect(useHouseholdStore.getState().pinned).toEqual(["cell-b", "cell-a"]);
  });

  it("drops the oldest past the cap rather than refusing the click", () => {
    const { togglePin } = useHouseholdStore.getState();

    for (let index = 0; index <= MAX_PINNED; index += 1) {
      togglePin(`cell-${index}`);
    }

    const { pinned } = useHouseholdStore.getState();
    expect(pinned).toHaveLength(MAX_PINNED);
    // The very first pin is the one that fell off the end.
    expect(pinned).not.toContain("cell-0");
    expect(pinned[0]).toBe(`cell-${MAX_PINNED}`);
  });

  it("clears every pin", () => {
    const { togglePin, clearPins } = useHouseholdStore.getState();
    togglePin("cell-a");
    togglePin("cell-b");

    clearPins();
    expect(useHouseholdStore.getState().pinned).toEqual([]);
  });

  it("drops pins when a different household is loaded", () => {
    // Pins point at cells ranked for one household; carrying them into another
    // would silently mix two shortlists.
    const { togglePin, loadDemo } = useHouseholdStore.getState();
    togglePin("cell-a");

    loadDemo();
    expect(useHouseholdStore.getState().pinned).toEqual([]);
  });
});

describe("household invariants", () => {
  it("never leaves the household with nobody in it", () => {
    // Try to remove everyone; the last person must survive, or the engine has
    // nothing to rank against.
    for (const person of useHouseholdStore.getState().household.people) {
      useHouseholdStore.getState().removePerson(person.id);
    }

    expect(useHouseholdStore.getState().household.people).toHaveLength(1);
  });

  it("clears the parking requirement when the last car goes", () => {
    const { setRequiresStreetParking, setCarCount } =
      useHouseholdStore.getState();

    setRequiresStreetParking(true);
    setCarCount(0);

    // Requiring street parking with no car is incoherent, and would silently
    // exclude areas for a reason that no longer applies.
    expect(useHouseholdStore.getState().household.requiresStreetParking).toBe(
      false,
    );
  });

  it("carries the unreachable policy on the household", () => {
    const { setUnreachablePolicy } = useHouseholdStore.getState();

    setUnreachablePolicy("penalty");
    expect(useHouseholdStore.getState().household.unreachablePolicy).toBe(
      "penalty",
    );
  });
});
