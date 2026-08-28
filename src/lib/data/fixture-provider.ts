/**
 * The fixture-backed provider.
 *
 * Its own module rather than living beside the interface, because
 * `measured.ts` composes it and `provider.ts` picks between them: with all
 * three in one file the import cycle resolves differently depending on which
 * module the bundler reaches first, and one of those orders leaves
 * `fixtureProvider` in its temporal dead zone when `measuredProvider` spreads
 * it. That failure is invisible until something imports `measured.ts` first.
 */

import { searchAddresses } from "@/lib/fixtures/addresses";
import { GUSH_DAN_BBOX, GUSH_DAN_CENTER } from "@/lib/fixtures/geography";
import { buildIsochrones, computeZoneTravel } from "@/lib/fixtures/isochrones";
import { buildListings } from "@/lib/fixtures/listings";
import { getZoneDataset } from "@/lib/fixtures/zones";
import type { LatLng } from "@/lib/geo";
import { householdTargets } from "@/lib/scoring/targets";
import type { DataProvider } from "./provider";

export const fixtureProvider: DataProvider = {
  id: "fixture",

  async getMetro() {
    return {
      id: "gush-dan",
      name: "Gush Dan",
      center: GUSH_DAN_CENTER,
      bbox: GUSH_DAN_BBOX,
    };
  },

  async getZoneDataset() {
    return getZoneDataset();
  },

  async getTravel(household) {
    const { zones } = getZoneDataset();

    // One isochrone set per target — people + anchors, typically 5–10.
    const isochrones = householdTargets(household).map((target) => {
      const person = household.people.find(
        (candidate) => `person:${candidate.id}` === target.id,
      );
      const anchor = household.anchors.find(
        (candidate) => `anchor:${candidate.id}` === target.id,
      );
      const modes = person?.modes ?? anchor?.modes ?? ["transit"];
      return buildIsochrones(target, modes);
    });

    return computeZoneTravel(zones, isochrones);
  },

  async searchAddresses(query) {
    return searchAddresses(query);
  },

  async geocode(query) {
    if (query.trim().length < 3) {
      return { available: true, results: [] };
    }

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(query.trim())}`,
      );
      const body = (await response.json()) as {
        available?: boolean;
        reason?: string;
        results?: {
          id: string;
          label: string;
          city: string;
          location: LatLng;
        }[];
      };

      return {
        available: body.available ?? false,
        reason: body.reason,
        results: (body.results ?? []).map((hit) => ({
          ...hit,
          source: "geocoder" as const,
        })),
      };
    } catch {
      // The route handler already turns upstream failures into a structured
      // body; reaching here means the app's own origin was unreachable.
      return {
        available: false,
        reason: "Address search is offline.",
        results: [],
      };
    }
  },

  async getListings(topZones) {
    return buildListings(topZones);
  },

  // Fixtures cannot have these: a generated transaction at a generated address
  // is exactly the thing the shortlist already discloses as illustrative, and
  // there is nothing to gain from inventing a second flavour of it.
  async getTransactions() {
    return [];
  },
};
