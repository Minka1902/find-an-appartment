/**
 * Camera geometry, kept free of MapLibre so it can be tested directly.
 *
 * The map component owns the projection; everything here is arithmetic on the
 * result of it.
 */

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Box {
  width: number;
  height: number;
}

/**
 * Is a projected point inside the part of the map a user can actually see?
 *
 * The padded rect, not the canvas. On compact the bottom sheet covers the lower
 * half of the canvas and `padding.bottom` is what accounts for it, so
 * `map.getBounds().contains(…)` — which knows nothing about padding — reported
 * cells hidden behind the sheet as visible, and picking one from the ranked
 * list moved the map not at all.
 */
export function isPointInPaddedBox(
  point: { x: number; y: number },
  box: Box,
  padding: Padding,
): boolean {
  return (
    point.x >= padding.left &&
    point.x <= box.width - padding.right &&
    point.y >= padding.top &&
    point.y <= box.height - padding.bottom
  );
}
