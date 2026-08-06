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

export interface DataProvider {
  readonly id: string;
  getMetro(): Promise<Metro>;
  getZoneDataset(): Promise<ZoneDataset>;
  getTravel(household: Household): Promise<Record<string, ZoneTravel>>;
  searchAddresses(query: string): Promise<AddressSuggestion[]>;
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

  async getListings(topZones) {
    return buildListings(topZones);
  },
};

export const provider: DataProvider = fixtureProvider;
