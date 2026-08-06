"use client";

import { useEffect } from "react";

import { useHouseholdStore } from "./household";

/**
 * Kicks off persisted-store rehydration once, after mount.
 *
 * The store is created with `skipHydration`, so the first client render uses
 * the same defaults the server rendered. This then loads whatever was saved and
 * notifies subscribers, which is what flips `useHydrated`.
 */
export function StoreHydrator() {
  useEffect(() => {
    void useHouseholdStore.persist.rehydrate();
  }, []);

  return null;
}
