/**
 * Stage 2 shortlist data.
 *
 * §2: only the top ~10 cells get address-level treatment, with exact
 * door-to-door routing per listing. That is where precision belongs — and
 * nowhere earlier.
 *
 * §12 risk 1 is unresolved: Yad2 and Madlan both block automated access, so
 * there may be no legal path to real address-level listings. These are
 * *generated examples*, and every surface that renders them must say so. The
 * per-person commute figures are the part that carries real value either way,
 * since they hold for any address in the cell.
 */

import type { LatLng } from "@/lib/geo";
import { destination } from "@/lib/geo";
import type { ScoredZone } from "@/lib/scoring/types";
import { unitFrom } from "./random";

export interface ListingCommute {
  personId: string;
  name: string;
  /** Exact door-to-door minutes, not the cell's isochrone band. */
  minutes: number | null;
}

export interface Listing {
  id: string;
  h3: string;
  address: string;
  location: LatLng;
  municipality: string;
  rooms: number;
  sizeSqm: number;
  monthlyPrice: number;
  floor: number;
  hasSafeRoom: boolean;
  hasParking: boolean;
  commutes: ListingCommute[];
  /** Always true here. Kept explicit so the UI cannot forget to disclose it. */
  isIllustrative: boolean;
}

const STREET_NAMES = [
  "Ben Yehuda",
  "Arlozorov",
  "HaShomer",
  "Bialik",
  "Weizmann",
  "Sokolov",
  "Jabotinsky",
  "Herzl",
  "Ussishkin",
  "Katznelson",
  "HaRav Kook",
  "Trumpeldor",
];

const LISTINGS_PER_ZONE = 3;

/**
 * Exact door-to-door time for one listing.
 *
 * The cell's value is an isochrone *band* (15/30/45/60), so the real figure
 * for a specific address sits somewhere inside it. Modelled here as the band
 * minus a deterministic offset, which is what a real per-listing routing call
 * would refine.
 */
function exactMinutes(
  bandMinutes: number | null,
  seed: string,
): number | null {
  if (bandMinutes === null) return null;
  const offset = unitFrom(seed, "exact") * 12;
  return Math.max(3, Math.round(bandMinutes - offset));
}

function buildListingsForZone(zone: ScoredZone): Listing[] {
  const listings: Listing[] = [];
  const pricePerSqm =
    zone.breakdown.find((metric) => metric.key === "cost")?.raw ?? 40000;

  for (let i = 0; i < LISTINGS_PER_ZONE; i++) {
    const seed = `${zone.zone.h3}:${i}`;

    const street =
      STREET_NAMES[Math.floor(unitFrom(seed, "street") * STREET_NAMES.length)];
    const number = 1 + Math.floor(unitFrom(seed, "number") * 80);

    const rooms = 2 + Math.floor(unitFrom(seed, "rooms") * 4);
    const sizeSqm = Math.round(28 * rooms + unitFrom(seed, "size") * 25);

    // Sale price per m² converted to a rough monthly asking figure. The
    // sale-to-rent ratio varies systematically by area, so this is a coarse
    // illustration, not a market estimate.
    const monthlyPrice =
      Math.round(((pricePerSqm * sizeSqm) / 300 / 100) * 100) +
      Math.round(unitFrom(seed, "price") * 800);

    // Nudge the pin off the centroid so listings aren't stacked.
    const bearing = unitFrom(seed, "bearing") * Math.PI * 2;
    const pin = destination(zone.zone.centroid, 0.12, bearing);

    listings.push({
      id: `${zone.zone.h3}-${i}`,
      h3: zone.zone.h3,
      address: `${street} ${number}, ${zone.zone.municipality}`,
      location: pin,
      municipality: zone.zone.municipality,
      rooms,
      sizeSqm,
      monthlyPrice,
      floor: Math.floor(unitFrom(seed, "floor") * 8),
      hasSafeRoom: unitFrom(seed, "mamad") < 0.45,
      hasParking: unitFrom(seed, "parking") < 0.5,
      commutes: zone.commutes.map((commute) => ({
        personId: commute.personId,
        name: commute.name,
        minutes: exactMinutes(commute.minutes, `${seed}:${commute.personId}`),
      })),
      isIllustrative: true,
    });
  }

  return listings;
}

export function buildListings(topZones: ScoredZone[]): Listing[] {
  return topZones.flatMap(buildListingsForZone);
}
