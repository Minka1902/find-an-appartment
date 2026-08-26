import { describe, expect, it } from "vitest";

import {
  formatCoordinates,
  isShortenedMapLink,
  parseCoordinates,
} from "./coords";

describe("parseCoordinates", () => {
  describe("bare pairs", () => {
    it("parses a comma-separated pair", () => {
      expect(parseCoordinates("32.0644, 34.7742")).toEqual({
        lat: 32.0644,
        lng: 34.7742,
      });
    });

    it("parses a space-separated pair", () => {
      expect(parseCoordinates("32.0644 34.7742")).toEqual({
        lat: 32.0644,
        lng: 34.7742,
      });
    });

    it("tolerates surrounding whitespace", () => {
      expect(parseCoordinates("  32.0644,34.7742  ")).toEqual({
        lat: 32.0644,
        lng: 34.7742,
      });
    });

    it("honours hemisphere letters", () => {
      expect(parseCoordinates("32.0644°N, 34.7742°E")).toEqual({
        lat: 32.0644,
        lng: 34.7742,
      });
      // Silently ignoring S/W would turn a typo into the wrong continent.
      expect(parseCoordinates("32.0644 S, 34.7742 W")).toEqual({
        lat: -32.0644,
        lng: -34.7742,
      });
    });

    it("parses negative coordinates", () => {
      expect(parseCoordinates("-33.8688, 151.2093")).toEqual({
        lat: -33.8688,
        lng: 151.2093,
      });
    });

    it("rejects out-of-range values", () => {
      expect(parseCoordinates("132.06, 34.77")).toBeNull();
      expect(parseCoordinates("32.06, 234.77")).toBeNull();
    });

    it("rejects text that isn't a coordinate pair", () => {
      expect(parseCoordinates("Rothschild Blvd")).toBeNull();
      expect(parseCoordinates("32.0644")).toBeNull();
      expect(parseCoordinates("")).toBeNull();
    });
  });

  describe("map URLs", () => {
    it("prefers the place marker over the camera position", () => {
      // `@` is where the map was looking; `!3d/!4d` is the pin itself. They
      // differ whenever the user panned before copying the link.
      const url =
        "https://www.google.com/maps/place/Azrieli/@32.0700,34.7900,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d32.0741!4d34.7925";
      expect(parseCoordinates(url)).toEqual({ lat: 32.0741, lng: 34.7925 });
    });

    it("falls back to the camera position when there is no marker", () => {
      expect(
        parseCoordinates("https://www.google.com/maps/@32.0644,34.7742,15z"),
      ).toEqual({ lat: 32.0644, lng: 34.7742 });
    });

    it("parses a q= query parameter", () => {
      expect(
        parseCoordinates("https://maps.google.com/?q=32.0644,34.7742"),
      ).toEqual({ lat: 32.0644, lng: 34.7742 });
    });

    it("parses an OpenStreetMap fragment", () => {
      expect(
        parseCoordinates(
          "https://www.openstreetmap.org/#map=16/32.0644/34.7742",
        ),
      ).toEqual({ lat: 32.0644, lng: 34.7742 });
    });

    it("returns null for a URL with no coordinates", () => {
      expect(parseCoordinates("https://example.com/somewhere")).toBeNull();
    });

    it("returns null for malformed URLs", () => {
      expect(parseCoordinates("http://")).toBeNull();
    });
  });

  it("rounds to a sane precision", () => {
    const point = parseCoordinates("32.06440123456789, 34.77421987654321");
    expect(point).toEqual({ lat: 32.064401, lng: 34.77422 });
  });
});

describe("isShortenedMapLink", () => {
  it("detects links that need a redirect to resolve", () => {
    expect(isShortenedMapLink("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isShortenedMapLink("https://goo.gl/maps/abc123")).toBe(true);
  });

  it("does not flag ordinary map URLs", () => {
    expect(
      isShortenedMapLink("https://www.google.com/maps/@32.06,34.77,15z"),
    ).toBe(false);
  });
});

describe("formatCoordinates", () => {
  it("renders the pair the way map apps do", () => {
    expect(formatCoordinates({ lat: 32.0644, lng: 34.7742 })).toBe(
      "32.06440, 34.77420",
    );
  });
});
