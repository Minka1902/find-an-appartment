"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { demoHousehold } from "@/lib/fixtures/household";
import { defaultWeights } from "@/lib/scoring/registry";
import type {
  Anchor,
  CommuteAggregation,
  Household,
  Person,
  UnreachablePolicy,
} from "@/lib/scoring/types";
import { parseHouseholdOrDemo } from "./household-schema";

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankPerson(): Person {
  return {
    id: newId("p"),
    name: "",
    work: null,
    workLabel: "",
    modes: ["transit"],
    daysInOffice: 5,
    maxCommuteMinutes: 45,
    weight: 1,
  };
}

export function blankAnchor(): Anchor {
  return {
    id: newId("a"),
    label: "",
    location: null,
    locationLabel: "",
    visitsPerMonth: 4,
    modes: ["drive"],
  };
}

/** How many areas can be compared at once before the columns stop fitting. */
export const MAX_PINNED = 4;

interface HouseholdState {
  household: Household;
  /** Currently inspected cell, or null. Drives the detail panel/sheet. */
  selectedZone: string | null;
  /**
   * Areas the household has actually chosen, newest first.
   *
   * Deliberately outside `Household`: it is not an input to the ranking, and
   * putting it there would change `travelKey` and rebuild every isochrone on
   * each pin.
   */
  pinned: string[];

  setHousehold(household: Household): void;
  updatePerson(id: string, patch: Partial<Person>): void;
  addPerson(): void;
  removePerson(id: string): void;
  updateAnchor(id: string, patch: Partial<Anchor>): void;
  addAnchor(): void;
  removeAnchor(id: string): void;
  setWeight(key: string, value: number): void;
  resetWeights(): void;
  setAggregation(aggregation: CommuteAggregation): void;
  setUnreachablePolicy(policy: UnreachablePolicy): void;
  setCarCount(count: number): void;
  setRequiresStreetParking(required: boolean): void;
  setMaxCost(maxCost: number | null): void;
  selectZone(h3: string | null): void;
  togglePin(h3: string): void;
  clearPins(): void;
  loadDemo(): void;
}

export const useHouseholdStore = create<HouseholdState>()(
  persist(
    (set) => ({
      // Start on the demo case so the map is meaningful on first load, and so
      // the P0 exit criterion is one click away rather than behind a form.
      household: demoHousehold(),
      selectedZone: null,
      pinned: [],

      setHousehold: (household) => set({ household }),

      updatePerson: (id, patch) =>
        set((state) => ({
          household: {
            ...state.household,
            people: state.household.people.map((person) =>
              person.id === id ? { ...person, ...patch } : person,
            ),
          },
        })),

      addPerson: () =>
        set((state) => ({
          household: {
            ...state.household,
            people: [...state.household.people, blankPerson()],
          },
        })),

      removePerson: (id) =>
        set((state) => ({
          household: {
            ...state.household,
            // Never leave the household with nobody in it.
            people:
              state.household.people.length > 1
                ? state.household.people.filter((person) => person.id !== id)
                : state.household.people,
          },
        })),

      updateAnchor: (id, patch) =>
        set((state) => ({
          household: {
            ...state.household,
            anchors: state.household.anchors.map((anchor) =>
              anchor.id === id ? { ...anchor, ...patch } : anchor,
            ),
          },
        })),

      addAnchor: () =>
        set((state) => ({
          household: {
            ...state.household,
            anchors: [...state.household.anchors, blankAnchor()],
          },
        })),

      removeAnchor: (id) =>
        set((state) => ({
          household: {
            ...state.household,
            anchors: state.household.anchors.filter(
              (anchor) => anchor.id !== id,
            ),
          },
        })),

      setWeight: (key, value) =>
        set((state) => ({
          household: {
            ...state.household,
            weights: { ...state.household.weights, [key]: value },
          },
        })),

      resetWeights: () =>
        set((state) => ({
          household: { ...state.household, weights: defaultWeights() },
        })),

      setAggregation: (commuteAggregation) =>
        set((state) => ({
          household: { ...state.household, commuteAggregation },
        })),

      setUnreachablePolicy: (unreachablePolicy) =>
        set((state) => ({
          household: { ...state.household, unreachablePolicy },
        })),

      setCarCount: (carCount) =>
        set((state) => ({
          household: {
            ...state.household,
            carCount,
            // Requiring street parking without a car is incoherent.
            requiresStreetParking:
              carCount === 0 ? false : state.household.requiresStreetParking,
          },
        })),

      setRequiresStreetParking: (requiresStreetParking) =>
        set((state) => ({
          household: { ...state.household, requiresStreetParking },
        })),

      setMaxCost: (maxCost) =>
        set((state) => ({ household: { ...state.household, maxCost } })),

      selectZone: (selectedZone) => set({ selectedZone }),

      togglePin: (h3) =>
        set((state) => {
          if (state.pinned.includes(h3)) {
            return { pinned: state.pinned.filter((pin) => pin !== h3) };
          }
          // Newest first, and capped: past four the comparison columns stop
          // fitting, and dropping the oldest beats refusing the click.
          return { pinned: [h3, ...state.pinned].slice(0, MAX_PINNED) };
        }),

      clearPins: () => set({ pinned: [] }),

      loadDemo: () =>
        set({ household: demoHousehold(), selectedZone: null, pinned: [] }),
    }),
    {
      name: "where-to-live/household",
      version: 2,

      /**
       * `localStorage` is untrusted input: user-writable, and it survives across
       * deploys that change the shape of `Household`. Validating it means a
       * corrupt entry costs the user their setup — but an unvalidated one
       * crashes the engine on boot, which costs them the same setup *and*
       * leaves no way back into the app.
       *
       * Done in `merge` rather than `migrate` deliberately. `migrate` only runs
       * when the stored version differs from `version` above, so a v2 entry
       * that was hand-edited or truncated would sail straight through it.
       * `merge` runs on every rehydration, which is the actual guarantee we
       * want. It also subsumes the v1 -> v2 migration, since the schema
       * defaults the newly-added `unreachablePolicy`.
       */
      merge: (persisted, current) => {
        const stored = persisted as {
          household?: unknown;
          pinned?: unknown;
        } | null;

        return {
          ...current,
          household: parseHouseholdOrDemo(stored?.household),
          // Pins are just H3 index strings; anything that isn't a string array
          // of the right length is discarded rather than trusted.
          pinned: Array.isArray(stored?.pinned)
            ? stored.pinned
                .filter((pin): pin is string => typeof pin === "string")
                .slice(0, MAX_PINNED)
            : [],
        };
      },
      // Rehydrate explicitly after mount rather than during store creation, so
      // the first client render matches the server's and hydration is clean.
      // `StoreHydrator` kicks it off.
      skipHydration: true,
      // Don't persist the transient selection — a refresh should land on the
      // map, not reopen a panel from a previous session. Pins are the opposite:
      // they are a deliberate choice and losing them on refresh would be the
      // bug.
      partialize: (state) => ({
        household: state.household,
        pinned: state.pinned,
      }),
    },
  ),
);
