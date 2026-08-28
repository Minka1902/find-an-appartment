import { describe, expect, it } from "vitest";

import { isPlausibleItm, itmToWgs84, wgs84ToItm } from "./itm";

/** Places whose coordinates the rest of the app already depends on. */
const PLACES = [
  { name: "Rothschild Blvd, Tel Aviv", lat: 32.0644, lng: 34.7742 },
  { name: "Herzliya Pituach", lat: 32.1624, lng: 34.8093 },
  { name: "Holon", lat: 32.0158, lng: 34.7874 },
  { name: "Jerusalem, Old City", lat: 31.7767, lng: 35.2345 },
  { name: "Haifa", lat: 32.794, lng: 34.9896 },
  { name: "Beer Sheva", lat: 31.2518, lng: 34.7913 },
];

describe("Israeli TM Grid", () => {
  it("round-trips to well under the size of a cell", () => {
    for (const place of PLACES) {
      const { x, y } = wgs84ToItm(place.lat, place.lng);
      const back = itmToWgs84(x, y);

      // A res-9 cell is ~340m across; 1e-7 degrees is ~1cm.
      expect(back.lat, place.name).toBeCloseTo(place.lat, 7);
      expect(back.lng, place.name).toBeCloseTo(place.lng, 7);
    }
  });

  it("projects Israeli places into the published ITM range", () => {
    for (const place of PLACES) {
      const { x, y } = wgs84ToItm(place.lat, place.lng);
      expect(isPlausibleItm(x, y), `${place.name} -> ${x},${y}`).toBe(true);
    }
  });

  it("puts the grid origin at its false easting and northing", () => {
    // 31°44'03.817"N 35°12'16.261"E is the projection's origin by definition.
    const origin = wgs84ToItm(
      31 + 44 / 60 + 3.817 / 3600,
      35 + 12 / 60 + 16.261 / 3600,
    );
    expect(origin.x).toBeCloseTo(219529.584, 3);
    expect(origin.y).toBeCloseTo(626907.39, 3);
  });

  it("keeps north and east pointing the right way", () => {
    const south = wgs84ToItm(31.5, 34.8);
    const north = wgs84ToItm(32.5, 34.8);
    const west = wgs84ToItm(32.0, 34.5);
    const east = wgs84ToItm(32.0, 35.0);

    expect(north.y).toBeGreaterThan(south.y);
    expect(east.x).toBeGreaterThan(west.x);
  });

  it("rejects numbers that are not an ITM pair", () => {
    // Latitude/longitude accidentally left in the X/Y columns.
    expect(isPlausibleItm(34.77, 32.06)).toBe(false);
    expect(isPlausibleItm(Number.NaN, 600000)).toBe(false);
  });
});
