/**
 * Parsing a location out of whatever the user pasted.
 *
 * This is the escape hatch that makes "set any address" true without a
 * geocoder. Someone who cannot find their office in the address book can always
 * find it in a map app and paste the link or the coordinates — no network, no
 * transliteration guessing, and the result is exact rather than inferred.
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

import type { LatLng } from "@/lib/geo";

/** Latitude and longitude are the only bounds worth enforcing here. */
function isValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function build(lat: number, lng: number): LatLng | null {
  if (!isValid(lat, lng)) return null;
  // Six decimals is ~10cm — well past what any of this data resolves to, and
  // it keeps pasted values from carrying fifteen meaningless digits.
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

/**
 * A bare coordinate pair: "32.0644, 34.7742", "32.0644 34.7742",
 * "32.0644°N, 34.7742°E".
 *
 * Hemisphere letters are honoured when present. Everything in this app's metro
 * is N/E, but silently ignoring an S or W would turn a typo into a location on
 * the wrong continent with no complaint.
 */
function parsePair(input: string): LatLng | null {
  const match = input.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?\s*$/,
  );
  if (!match) return null;

  const [, rawLat, latHemi, rawLng, lngHemi] = match;
  let lat = Number(rawLat);
  let lng = Number(rawLng);

  if (latHemi && latHemi.toLowerCase() === "s") lat = -lat;
  if (lngHemi && lngHemi.toLowerCase() === "w") lng = -lng;

  return build(lat, lng);
}

/**
 * A map-app URL.
 *
 * Google's `/maps/place/…` URLs carry two different points: `@lat,lng` is where
 * the *camera* sits, while `!3dlat!4dlng` is the place itself. They differ
 * whenever the map was panned before copying, so the place marker wins when
 * both are present.
 *
 * Also handles `?q=`/`?ll=`/`?daddr=` (Google, Apple Maps) and OpenStreetMap's
 * `#map=zoom/lat/lng` fragment.
 */
function parseUrl(input: string): LatLng | null {
  if (!/^https?:\/\//i.test(input.trim())) return null;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const href = url.href;

  // Google place marker — the most accurate signal when present.
  const placeMatch = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (placeMatch) {
    const point = build(Number(placeMatch[1]), Number(placeMatch[2]));
    if (point) return point;
  }

  // Query parameters used by Google and Apple Maps.
  for (const key of ["q", "ll", "daddr", "sll", "center"]) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const point = parsePair(value);
    if (point) return point;
  }

  // OpenStreetMap: #map=15/32.0644/34.7742
  const osmMatch = url.hash.match(
    /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,
  );
  if (osmMatch) {
    const point = build(Number(osmMatch[1]), Number(osmMatch[2]));
    if (point) return point;
  }

  // Google camera position — last, because it is the viewport, not the place.
  const atMatch = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const point = build(Number(atMatch[1]), Number(atMatch[2]));
    if (point) return point;
  }

  return null;
}

/**
 * Parse pasted text into a point, or return null.
 *
 * Accepts a bare coordinate pair or a map URL. Returns null for anything else,
 * including a shortened link (`maps.app.goo.gl/…`) — those carry no
 * coordinates at all and would need a network round-trip to resolve, so the UI
 * says so rather than appearing to accept them.
 */
export function parseCoordinates(input: string): LatLng | null {
  if (!input.trim()) return null;
  return parseUrl(input) ?? parsePair(input);
}

/** True for a link that only resolves to coordinates after a redirect. */
export function isShortenedMapLink(input: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(input.trim());
}

/** Display form for a picked point. Matches what map apps show. */
export function formatCoordinates({ lat, lng }: LatLng): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
