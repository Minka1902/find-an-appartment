/** Reference geography for the Gush Dan demo metro. */

import type { LatLng } from "@/lib/geo";
import { haversineKm } from "@/lib/geo";

export const GUSH_DAN_BBOX = {
  minLat: 31.96,
  maxLat: 32.18,
  minLng: 34.72,
  maxLng: 34.93,
};

export const GUSH_DAN_CENTER: LatLng = { lat: 32.07, lng: 34.79 };

export interface Municipality {
  name: string;
  center: LatLng;
  /** Rough share of housing built after the 1992 safe-room mandate. */
  newBuildShare: number;
  /** Whether the municipality runs any Saturday transit. */
  shabbatService: boolean;
}

export const MUNICIPALITIES: Municipality[] = [
  {
    name: "Tel Aviv-Yafo",
    center: { lat: 32.0775, lng: 34.7758 },
    newBuildShare: 0.25,
    shabbatService: true,
  },
  {
    name: "Ramat Gan",
    center: { lat: 32.0684, lng: 34.8248 },
    newBuildShare: 0.35,
    shabbatService: true,
  },
  {
    name: "Givatayim",
    center: { lat: 32.0723, lng: 34.8125 },
    newBuildShare: 0.3,
    shabbatService: true,
  },
  {
    name: "Bnei Brak",
    center: { lat: 32.0807, lng: 34.8338 },
    newBuildShare: 0.45,
    shabbatService: false,
  },
  {
    name: "Holon",
    center: { lat: 32.0158, lng: 34.7874 },
    newBuildShare: 0.4,
    shabbatService: false,
  },
  {
    name: "Bat Yam",
    center: { lat: 32.0171, lng: 34.7457 },
    newBuildShare: 0.3,
    shabbatService: false,
  },
  {
    name: "Ramat HaSharon",
    center: { lat: 32.1462, lng: 34.8394 },
    newBuildShare: 0.5,
    shabbatService: false,
  },
  {
    name: "Petah Tikva",
    center: { lat: 32.0878, lng: 34.8878 },
    newBuildShare: 0.5,
    shabbatService: false,
  },
];

/** Nearest municipality centre — a stand-in for a real boundary join. */
export function municipalityFor(point: LatLng): Municipality {
  let best = MUNICIPALITIES[0];
  let bestDistance = Infinity;

  for (const municipality of MUNICIPALITIES) {
    const distance = haversineKm(point, municipality.center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = municipality;
    }
  }

  return best;
}

/**
 * Stylised high-capacity transit spine, roughly the Red Line corridor from
 * Jaffa through central Tel Aviv and Ramat Gan toward Petah Tikva.
 */
export const TRANSIT_SPINE: LatLng[] = [
  { lat: 32.035, lng: 34.752 },
  { lat: 32.055, lng: 34.766 },
  { lat: 32.0685, lng: 34.78 },
  { lat: 32.0725, lng: 34.7955 },
  { lat: 32.0735, lng: 34.8135 },
  { lat: 32.0805, lng: 34.8395 },
  { lat: 32.0865, lng: 34.8665 },
  { lat: 32.0905, lng: 34.8865 },
];

/** Distance in km from a point to the nearest spine vertex. */
export function distanceToSpineKm(point: LatLng): number {
  let best = Infinity;
  for (const node of TRANSIT_SPINE) {
    const distance = haversineKm(point, node);
    if (distance < best) best = distance;
  }
  return best;
}
