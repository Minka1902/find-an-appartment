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
import type { Listing } from "@/lib/fixtures/listings";
import type { ZoneDataset } from "@/lib/fixtures/zones";
import type { BBox, LatLng } from "@/lib/geo";
import type { Household, ScoredZone, ZoneTravel } from "@/lib/scoring/types";
import { fixtureProvider } from "./fixture-provider";
import { measuredProvider, type Transaction } from "./measured";

export interface Metro {
  id: string;
  name: string;
  center: LatLng;
  bbox: BBox;
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
  /**
   * Recorded property transactions in these cells.
   *
   * Separate from `getListings` because they are a different kind of thing: a
   * sale that happened at a real address, not a home currently for rent. Empty
   * until a crawl has been run — see `measured.ts`.
   */
  getTransactions(topZones: ScoredZone[]): Promise<Transaction[]>;
}

/**
 * The provider the app uses.
 *
 * `measuredProvider` composes `fixtureProvider` and overlays whatever a crawl
 * has produced, so this is a single switch rather than a fork: with no crawl
 * output present it behaves exactly as the fixture provider did.
 */
export const provider: DataProvider = measuredProvider;

export { fixtureProvider };
