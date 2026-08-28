import { describe, expect, it } from "vitest";

import { isPointInPaddedBox } from "./camera";

const BOX = { width: 1000, height: 800 };

/** Compact: the bottom sheet at its half snap, plus 16px of breathing room. */
const SHEET_PADDING = { top: 16, right: 16, bottom: 432, left: 16 };
const WIDE_PADDING = { top: 24, right: 24, bottom: 24, left: 24 };

describe("isPointInPaddedBox", () => {
  it("accepts a point in the middle of the visible area", () => {
    expect(isPointInPaddedBox({ x: 500, y: 200 }, BOX, SHEET_PADDING)).toBe(true);
  });

  it("rejects a point hidden behind the bottom sheet", () => {
    // On the canvas, so `map.getBounds().contains(…)` called this visible and
    // the map never moved to reveal the cell. It is under the sheet.
    expect(isPointInPaddedBox({ x: 500, y: 600 }, BOX, SHEET_PADDING)).toBe(false);
  });

  it("treats the padding edge as visible", () => {
    expect(isPointInPaddedBox({ x: 500, y: 368 }, BOX, SHEET_PADDING)).toBe(true);
    expect(isPointInPaddedBox({ x: 500, y: 369 }, BOX, SHEET_PADDING)).toBe(false);
  });

  it("rejects points off every side", () => {
    expect(isPointInPaddedBox({ x: 10, y: 400 }, BOX, WIDE_PADDING)).toBe(false);
    expect(isPointInPaddedBox({ x: 990, y: 400 }, BOX, WIDE_PADDING)).toBe(false);
    expect(isPointInPaddedBox({ x: 500, y: 10 }, BOX, WIDE_PADDING)).toBe(false);
    expect(isPointInPaddedBox({ x: 500, y: 790 }, BOX, WIDE_PADDING)).toBe(false);
  });

  it("rejects a point projected outside the canvas entirely", () => {
    // `project` happily returns negative coordinates for off-screen geography.
    expect(isPointInPaddedBox({ x: -320, y: 400 }, BOX, WIDE_PADDING)).toBe(false);
  });
});
