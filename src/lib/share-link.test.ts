import { describe, expect, it } from "vitest";

import { demoHousehold } from "@/lib/fixtures/household";
import {
  buildShareUrl,
  decodeHousehold,
  describeHousehold,
  encodeHousehold,
  MAX_SHARE_LENGTH,
  readShareParam,
} from "./share-link";
import type { Household } from "@/lib/scoring/types";

describe("share links", () => {
  it("round-trips a household", () => {
    const original = demoHousehold();
    const encoded = encodeHousehold(original);
    expect(encoded).not.toBeNull();
    expect(decodeHousehold(encoded as string)).toEqual(original);
  });

  it("survives Hebrew labels", () => {
    // btoa is Latin-1 only, so anything non-ASCII has to be UTF-8 encoded
    // first — and every address in this app has a Hebrew form.
    const household: Household = {
      ...demoHousehold(),
      people: [
        {
          ...demoHousehold().people[0],
          name: "מאיה",
          workLabel: "שדרות רוטשילד, תל אביב",
        },
      ],
    };

    const decoded = decodeHousehold(encodeHousehold(household) as string);
    expect(decoded?.people[0].name).toBe("מאיה");
    expect(decoded?.people[0].workLabel).toBe("שדרות רוטשילד, תל אביב");
  });

  it("produces a URL-safe string", () => {
    const encoded = encodeHousehold(demoHousehold()) as string;
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("refuses a household too large for a URL", () => {
    const huge: Household = {
      ...demoHousehold(),
      people: Array.from({ length: 40 }, (_, index) => ({
        ...demoHousehold().people[0],
        id: `p${index}`,
        workLabel: "a very long workplace label that repeats".repeat(4),
      })),
    };

    expect(encodeHousehold(huge)).toBeNull();
    expect(buildShareUrl("https://example.com", "/setup", huge)).toBeNull();
  });

  it("stays within the stated ceiling", () => {
    const encoded = encodeHousehold(demoHousehold()) as string;
    expect(encoded.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });

  describe("decoding untrusted input", () => {
    it("rejects garbage rather than throwing", () => {
      expect(decodeHousehold("not-base64!!")).toBeNull();
      expect(decodeHousehold("")).toBeNull();
    });

    it("rejects valid base64 that isn't a household", () => {
      const encoded = encodeHousehold(demoHousehold()) as string;
      // Truncating gives well-formed base64 of malformed JSON.
      expect(decodeHousehold(encoded.slice(0, 40))).toBeNull();
    });

    it("rejects a structurally wrong household", () => {
      // A link is third-party input: this must fail closed, because the caller
      // is about to replace the user's entire setup with it.
      const bytes = new TextEncoder().encode(
        JSON.stringify({ id: "x", people: "not an array" }),
      );
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      expect(decodeHousehold(encoded)).toBeNull();
    });
  });

  describe("buildShareUrl and readShareParam", () => {
    it("builds a link the reader can parse back", () => {
      const url = buildShareUrl(
        "https://example.com",
        "/setup",
        demoHousehold(),
      ) as string;

      expect(url.startsWith("https://example.com/setup?h=")).toBe(true);

      const search = new URL(url).search;
      const param = readShareParam(search) as string;
      expect(decodeHousehold(param)).toEqual(demoHousehold());
    });

    it("returns null when there is no share parameter", () => {
      expect(readShareParam("?other=1")).toBeNull();
      expect(readShareParam("")).toBeNull();
    });
  });

  describe("describeHousehold", () => {
    it("names the people, so the prompt says what is being replaced", () => {
      expect(describeHousehold(demoHousehold())).toBe(
        "Maya, Yonatan, 2 anchors",
      );
    });

    it("falls back to a count when nobody is named", () => {
      const household: Household = {
        ...demoHousehold(),
        anchors: [],
        people: demoHousehold().people.map((person) => ({ ...person, name: "" })),
      };
      expect(describeHousehold(household)).toBe("2 people");
    });
  });
});
