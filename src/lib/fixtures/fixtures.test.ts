import { describe, expect, it } from "vitest";

import { getZoneDataset } from "./zones";

describe("fixture zone grid", () => {
  const { zones, metrics } = getZoneDataset();

  it("covers Gush Dan at a payload size the client can re-score live", () => {
    // §3: a Gush Dan household should land at 2–4k cells — small enough to
    // re-score in-browser on every slider drag.
    expect(zones.length).toBeGreaterThan(1000);
    expect(zones.length).toBeLessThan(6000);
  });

  it("is deterministic across calls", () => {
    const again = getZoneDataset();
    expect(again.zones[0].h3).toBe(zones[0].h3);
    expect(again.zones.length).toBe(zones.length);
  });

  it("gives every zone a complete metric set", () => {
    const keys = [
      "transit",
      "cost",
      "parking",
      "socioeconomic",
      "shelter",
      "shabbat",
    ];

    for (const zone of zones) {
      const zoneMetrics = metrics[zone.h3];
      expect(zoneMetrics).toBeDefined();
      for (const key of keys) {
        expect(Number.isFinite(zoneMetrics[key]?.value)).toBe(true);
      }
    }
  });

  it("produces boundaries usable as GeoJSON rings", () => {
    const [lng, lat] = zones[0].boundary[0];
    expect(lng).toBeGreaterThan(34);
    expect(lng).toBeLessThan(36);
    expect(lat).toBeGreaterThan(31);
    expect(lat).toBeLessThan(33);
  });

  it("spreads each metric over a usable range", () => {
    const spread = (key: string) => {
      const values = zones.map((zone) => metrics[zone.h3][key].value);
      return { min: Math.min(...values), max: Math.max(...values) };
    };

    // A metric with no spread carries no ranking information.
    for (const key of ["transit", "cost", "parking", "shelter"]) {
      const { min, max } = spread(key);
      expect(max).toBeGreaterThan(min);
    }

    const cost = spread("cost");
    expect(cost.min).toBeGreaterThan(15000);
    expect(cost.max).toBeLessThan(85000);
  });

  it("marks parking confidence as low outside Tel Aviv", () => {
    const outside = zones.find((zone) => zone.municipality === "Holon");
    expect(outside).toBeDefined();
    expect(metrics[outside!.h3].parking.confidence).toBe("low");

    const telAviv = zones.find((zone) => zone.municipality === "Tel Aviv-Yafo");
    expect(metrics[telAviv!.h3].parking.confidence).toBe("high");
  });

  it("gives Bnei Brak effectively no Shabbat service", () => {
    const bneiBrak = zones.filter((zone) => zone.municipality === "Bnei Brak");
    expect(bneiBrak.length).toBeGreaterThan(0);
    for (const zone of bneiBrak) {
      expect(metrics[zone.h3].shabbat.value).toBeLessThan(10);
    }
  });
});
