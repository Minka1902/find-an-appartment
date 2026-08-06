"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a media query.
 *
 * Use only where JS genuinely has to branch — rendering a sheet instead of a
 * side panel, or changing map padding. Anything CSS can express should stay in
 * CSS, so the layout is correct before hydration.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: matchMedia *is* an
 * external store, and this way the first client render already has the right
 * answer instead of rendering false and then correcting.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // The server has no viewport, so it renders the compact layout. Anything
  // that would flash must be expressible in CSS instead.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The one layout hinge in the app: below `lg` the map needs a bottom sheet, at
 * or above it there's room for a persistent sidebar.
 */
export const WIDE_QUERY = "(min-width: 1024px)";

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}

/** True on touch-first devices, where hit targets need to be larger. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
