/**
 * Israeli TM Grid (EPSG:2039) ↔ WGS84.
 *
 * Israeli government datasets publish coordinates as ITM X/Y far more often
 * than as latitude and longitude, so without this most of data.gov.il is
 * unusable here — and the alternative, geocoding the street address, is exactly
 * what §5 of the spec rules out.
 *
 * EPSG:2039 is a Transverse Mercator projection on GRS80, using the Israel 1993
 * datum. That datum is within a metre of WGS84 across the country, well below
 * the ~340m resolution of an H3 level 9 cell, so no datum shift is applied and
 * none is needed for this purpose.
 *
 * Pure arithmetic, no dependencies — the formulae are the standard TM series.
 */

/** Published EPSG:2039 parameters. */
const A = 6378137.0; // GRS80 semi-major axis
const INVERSE_FLATTENING = 298.257222101;
const F = 1 / INVERSE_FLATTENING;
const E2 = F * (2 - F); // first eccentricity squared
const K0 = 1.0000067; // scale factor at the central meridian
const LAT_ORIGIN = (31 + 44 / 60 + 3.817 / 3600) * (Math.PI / 180);
const LNG_ORIGIN = (35 + 12 / 60 + 16.261 / 3600) * (Math.PI / 180);
const FALSE_EASTING = 219529.584;
const FALSE_NORTHING = 626907.39;

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** Meridional arc from the equator to `lat`. */
function meridianArc(lat: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;

  const c0 = 1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
  const c2 = (3 / 8) * (E2 + e4 / 4 + (15 * e6) / 128);
  const c4 = (15 / 256) * (e4 + (3 * e6) / 4);
  const c6 = (35 / 3072) * e6;

  return (
    A *
    (c0 * lat - c2 * Math.sin(2 * lat) + c4 * Math.sin(4 * lat) - c6 * Math.sin(6 * lat))
  );
}

const M_ORIGIN = meridianArc(LAT_ORIGIN);

export interface ItmPoint {
  /** Easting, metres. Roughly 120,000–270,000 over Israel. */
  x: number;
  /** Northing, metres. Roughly 380,000–800,000 over Israel. */
  y: number;
}

/** WGS84 → Israeli TM Grid. */
export function wgs84ToItm(lat: number, lng: number): ItmPoint {
  const phi = lat * RAD;
  const lambda = lng * RAD;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const n = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = (E2 / (1 - E2)) * cosPhi * cosPhi;
  const a1 = (lambda - LNG_ORIGIN) * cosPhi;

  const a2 = a1 * a1;
  const a3 = a2 * a1;
  const a4 = a2 * a2;
  const a5 = a4 * a1;
  const a6 = a4 * a2;

  const x =
    FALSE_EASTING +
    K0 *
      n *
      (a1 +
        ((1 - t + c) * a3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * (E2 / (1 - E2))) * a5) / 120);

  const y =
    FALSE_NORTHING +
    K0 *
      (meridianArc(phi) -
        M_ORIGIN +
        n *
          tanPhi *
          (a2 / 2 +
            ((5 - t + 9 * c + 4 * c * c) * a4) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * (E2 / (1 - E2))) * a6) / 720));

  return { x, y };
}

/** Israeli TM Grid → WGS84. */
export function itmToWgs84(x: number, y: number): { lat: number; lng: number } {
  const m = M_ORIGIN + (y - FALSE_NORTHING) / K0;

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const eP2 = E2 / (1 - E2);
  const c1 = eP2 * cosPhi1 * cosPhi1;
  const t1 = tanPhi1 * tanPhi1;
  const n1 = A / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const r1 = (A * (1 - E2)) / (1 - E2 * sinPhi1 * sinPhi1) ** 1.5;
  const d = (x - FALSE_EASTING) / (n1 * K0);

  const d2 = d * d;
  const d4 = d2 * d2;
  const d6 = d4 * d2;

  const lat =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      (d2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eP2) * d4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eP2 - 3 * c1 * c1) * d6) / 720);

  const lng =
    LNG_ORIGIN +
    (d -
      ((1 + 2 * t1 + c1) * d2 * d) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eP2 + 24 * t1 * t1) * d4 * d) / 120) /
      cosPhi1;

  return { lat: lat * DEG, lng: lng * DEG };
}

/**
 * Do these numbers look like an ITM pair at all?
 *
 * Guards against a resource whose "X"/"Y" columns turn out to hold something
 * else entirely — silently projecting those would scatter cells across the
 * Mediterranean and look like a bug in the grid.
 */
export function isPlausibleItm(x: number, y: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 100_000 &&
    x <= 300_000 &&
    y >= 350_000 &&
    y <= 850_000
  );
}
