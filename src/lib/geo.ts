/** Shared geometry helpers. No dependency on scoring or React. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** [lng, lat] — GeoJSON order. */
export type Position = [number, number];

/** A closed linear ring in GeoJSON order. */
export type Ring = Position[];

const EARTH_RADIUS_KM = 6371;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from `a` to `b`, in radians, clockwise from north. */
export function bearingRad(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const theta = Math.atan2(y, x);
  return (theta + 2 * Math.PI) % (2 * Math.PI);
}

/** Offset a point by `distanceKm` along `bearing` (radians from north). */
export function destination(
  origin: LatLng,
  distanceKm: number,
  bearing: number,
): LatLng {
  const angular = distanceKm / EARTH_RADIUS_KM;
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/**
 * Ray-casting point-in-polygon over a single ring.
 *
 * This is the in-browser stand-in for PostGIS `ST_Contains`. When isochrones
 * move to PostGIS (Tier B), the containment test moves with them and this
 * function is only used by the fixture provider.
 */
export function pointInRing(point: LatLng, ring: Ring): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const straddles = yi > point.lat !== yj > point.lat;
    if (!straddles) continue;

    const xIntersect = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (point.lng < xIntersect) inside = !inside;
  }

  return inside;
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function ringBBox(ring: Ring): BBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return { minLat, minLng, maxLat, maxLng };
}

export function bboxContains(box: BBox, point: LatLng): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

/** Grow a bbox to include a point. */
export function extendBBox(box: BBox, point: LatLng): BBox {
  return {
    minLat: Math.min(box.minLat, point.lat),
    minLng: Math.min(box.minLng, point.lng),
    maxLat: Math.max(box.maxLat, point.lat),
    maxLng: Math.max(box.maxLng, point.lng),
  };
}

export const EMPTY_BBOX: BBox = {
  minLat: Infinity,
  minLng: Infinity,
  maxLat: -Infinity,
  maxLng: -Infinity,
};
