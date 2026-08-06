/**
 * Fixture isochrone bands — the stand-in for Tier B.
 *
 * In production OTP2 (transit/walk) and Valhalla (drive/bike) produce these
 * polygons, one set per target, and Postgres stores them. That is
 * `people + anchors` routing requests — typically 5–10 — not `cells × targets`.
 *
 * The important part is that the *shape of the work* is identical here: bands
 * are polygons, and a zone's travel time is a containment test against them.
 * Swapping in real routing replaces this file and nothing downstream.
 */

import type { BBox, LatLng, Ring } from "@/lib/geo";
import {
  bboxContains,
  destination,
  EMPTY_BBOX,
  extendBBox,
  pointInRing,
} from "@/lib/geo";
import { ISOCHRONE_BANDS } from "@/lib/scoring/config";
import type { Target } from "@/lib/scoring/targets";
import type { TravelMode, Zone, ZoneTravel } from "@/lib/scoring/types";
import { unitFrom } from "./random";

/** Effective door-to-door speed in km/h, well below vehicle speed. */
const MODE_SPEED_KMH: Record<TravelMode, number> = {
  drive: 26,
  transit: 16,
  bike: 13,
  walk: 4.5,
};

export function effectiveSpeed(modes: TravelMode[]): number {
  if (modes.length === 0) return MODE_SPEED_KMH.transit;
  return Math.max(...modes.map((mode) => MODE_SPEED_KMH[mode]));
}

export interface IsochroneBand {
  minutes: number;
  ring: Ring;
  bbox: BBox;
}

export interface TargetIsochrones {
  targetId: string;
  /** Ascending by minutes. */
  bands: IsochroneBand[];
}

const RING_POINTS = 72;

/**
 * Build one band as a closed ring around `origin`.
 *
 * Radius varies with bearing using a few low-frequency harmonics, so the band
 * is lobed like a real isochrone (fast along corridors, slow across them)
 * rather than a circle — while staying deterministic and cheap.
 */
function buildRing(
  origin: LatLng,
  radiusKm: number,
  seed: string,
): { ring: Ring; bbox: BBox } {
  const harmonics = [1, 2, 3].map((k) => ({
    k,
    amplitude: 0.08 + unitFrom(seed, "amp", k) * 0.16,
    phase: unitFrom(seed, "phase", k) * Math.PI * 2,
  }));

  const ring: Ring = [];
  let bbox = EMPTY_BBOX;

  for (let i = 0; i < RING_POINTS; i++) {
    const bearing = (i / RING_POINTS) * Math.PI * 2;

    let factor = 1;
    for (const { k, amplitude, phase } of harmonics) {
      factor += amplitude * Math.cos(k * bearing + phase);
    }
    // Never let the harmonics collapse or balloon the band.
    factor = Math.min(1.45, Math.max(0.55, factor));

    const point = destination(origin, radiusKm * factor, bearing);
    ring.push([point.lng, point.lat]);
    bbox = extendBBox(bbox, point);
  }

  ring.push(ring[0]);
  return { ring, bbox };
}

export function buildIsochrones(
  target: Target,
  modes: TravelMode[],
): TargetIsochrones {
  const speed = effectiveSpeed(modes);

  const bands = ISOCHRONE_BANDS.map((minutes) => {
    const radiusKm = (speed * minutes) / 60;
    const { ring, bbox } = buildRing(target.location, radiusKm, target.id);
    return { minutes, ring, bbox };
  });

  return { targetId: target.id, bands };
}

/**
 * Smallest band containing the point, or `null` when it falls outside the
 * widest one — the definition of unreachable.
 */
export function minutesForPoint(
  point: LatLng,
  isochrones: TargetIsochrones,
): number | null {
  for (const band of isochrones.bands) {
    if (!bboxContains(band.bbox, point)) continue;
    if (pointInRing(point, band.ring)) return band.minutes;
  }
  return null;
}

/**
 * Invert isochrones into per-zone travel times.
 *
 * This is the core optimization from §2: a cell's travel time becomes a
 * containment test rather than a routing call, so the cost is
 * `zones × targets × bands` cheap geometry instead of `zones × targets`
 * network round-trips.
 */
export function computeZoneTravel(
  zones: Zone[],
  isochrones: TargetIsochrones[],
): Record<string, ZoneTravel> {
  const travel: Record<string, ZoneTravel> = {};

  for (const zone of zones) {
    const minutes: Record<string, number | null> = {};
    for (const target of isochrones) {
      minutes[target.targetId] = minutesForPoint(zone.centroid, target);
    }
    travel[zone.h3] = { minutes };
  }

  return travel;
}
