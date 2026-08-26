/**
 * The seam between the app and its data.
 *
 * Screens depend only on this interface. Today it is backed by generated
 * fixtures; swapping in Postgres/PostGIS + OTP2/Valhalla replaces the
 * implementation and touches no UI. The method boundaries follow the compute
 * tiers of §2:
 *
 *   getZoneDataset  — Tier A, per metro, monthly cron, shared by all households
 *   getTravel       — Tier B, per household, recomputed only on address change
 *   (scoring)       — Tier C, client-side, every slider drag, no provider call
 */

import type { AddressSuggestion } from "@/lib/fixtures/addresses";
import { searchAddresses } from "@/lib/fixtures/addresses";
import { GUSH_DAN_BBOX, GUSH_DAN_CENTER } from "@/lib/fixtures/geography";
import { buildIsochrones, computeZoneTravel } from "@/lib/fixtures/isochrones";
import { buildListings, type Listing } from "@/lib/fixtures/listings";
import type { ZoneDataset } from "@/lib/fixtures/zones";
import { getZoneDataset } from "@/lib/fixtures/zones";
import type { LatLng } from "@/lib/geo";
import { householdTargets } from "@/lib/scoring/targets";
import type { Household, ScoredZone, ZoneTravel } from "@/lib/scoring/types";

export interface Metro {
  id: string;
  name: string;
  center: LatLng;
  bbox: typeof GUSH_DAN_BBOX;
}

/**
 * One suggestion, from either source.
 *
 * The address book and the geocoder produce the same thing as far as the UI is
 * concerned — a label and a real coordinate — but `source` is kept because the
 * picker orders book entries first and labels geocoded ones as needing
 * confirmation on the map (§5: a guessed transliteration must never be stored
 * as if it were picked).
 */
export interface LocationSuggestion {
  id: string;
  label: string;
  /** Hebrew label, where the source has one. */
  labelHe?: string;
  city: string;
  location: LatLng;
  source: "book" | "geocoder";
}

/**
 * The outcome of a geocode attempt.
 *
 * Availability is part of the result rather than an exception: "no geocoder
 * configured" and "the geocoder is down" are ordinary states this app is
 * designed to run in, and the UI needs to say *which* rather than showing a
 * generic failure over an empty list.
 */
export interface GeocodeOutcome {
  available: boolean;
  reason?: string;
  results: LocationSuggestion[];
}

export interface DataProvider {
  readonly id: string;
  getMetro(): Promise<Metro>;
  getZoneDataset(): Promise<ZoneDataset>;
  getTravel(household: Household): Promise<Record<string, ZoneTravel>>;
  searchAddresses(query: string): Promise<AddressSuggestion[]>;
  /** Free-text lookup. Never throws — see `GeocodeOutcome`. */
  geocode(query: string): Promise<GeocodeOutcome>;
  getListings(topZones: ScoredZone[]): Promise<Listing[]>;
}

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
};

export const provider: DataProvider = fixtureProvider;
