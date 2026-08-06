/**
 * The demo household.
 *
 * Concrete and opinionated on purpose: §11's P0 exit criterion is "the ranking
 * matches intuition for a case you already know the answer to", which needs a
 * case, not an empty form.
 */

import { defaultWeights } from "@/lib/scoring/registry";
import type { Household } from "@/lib/scoring/types";

export function demoHousehold(): Household {
  return {
    id: "demo",
    metro: "gush-dan",
    people: [
      {
        id: "p1",
        name: "Maya",
        // Rothschild / Ahad Ha'am, central Tel Aviv.
        work: { lat: 32.0644, lng: 34.7742 },
        workLabel: "Rothschild Blvd, Tel Aviv",
        modes: ["transit", "bike"],
        daysInOffice: 5,
        maxCommuteMinutes: 45,
        weight: 1,
      },
      {
        id: "p2",
        name: "Yonatan",
        // Herzliya Pituach tech park.
        work: { lat: 32.1624, lng: 34.8093 },
        workLabel: "Herzliya Pituach",
        modes: ["drive"],
        daysInOffice: 2,
        maxCommuteMinutes: 60,
        weight: 1,
      },
    ],
    anchors: [
      {
        id: "a1",
        label: "Maya's parents",
        location: { lat: 32.0684, lng: 34.8248 },
        locationLabel: "Ramat Gan",
        visitsPerMonth: 6,
        modes: ["drive"],
      },
      {
        id: "a2",
        label: "Yonatan's sister",
        location: { lat: 32.0158, lng: 34.7874 },
        locationLabel: "Holon",
        visitsPerMonth: 2,
        modes: ["drive"],
      },
    ],
    carCount: 1,
    requiresStreetParking: true,
    // Open decision #4: cost is a weighted metric by default. Setting a number
    // here also turns it into a hard filter.
    maxCost: null,
    weights: defaultWeights(),
    commuteAggregation: "balanced",
  };
}

/** A household with nothing filled in, for a fresh setup flow. */
export function emptyHousehold(): Household {
  return {
    id: "new",
    metro: "gush-dan",
    people: [
      {
        id: "p1",
        name: "",
        work: null,
        workLabel: "",
        modes: ["transit"],
        daysInOffice: 5,
        maxCommuteMinutes: 45,
        weight: 1,
      },
    ],
    anchors: [],
    carCount: 1,
    requiresStreetParking: false,
    maxCost: null,
    weights: defaultWeights(),
    commuteAggregation: "balanced",
  };
}
