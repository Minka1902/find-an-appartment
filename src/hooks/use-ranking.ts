"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { provider } from "@/lib/data/provider";
import type { ZoneDataset } from "@/lib/fixtures/zones";
import { scoreZones } from "@/lib/scoring/score-zones";
import { householdTargets } from "@/lib/scoring/targets";
import type { Household, ScoringResult, ZoneTravel } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * A stable key over everything that would change the isochrones.
 *
 * Weight changes must *not* appear here — that's the whole point of the tier
 * split. Recomputing travel is expensive; re-scoring is not.
 */
function travelKey(household: Household): string {
  return JSON.stringify(
    householdTargets(household).map((target) => [
      target.id,
      target.location.lat,
      target.location.lng,
    ]),
  );
}

/** Tier A: the metro's cell grid and static metrics. Loaded once. */
export function useZoneDataset(): ZoneDataset | null {
  const [dataset, setDataset] = useState<ZoneDataset | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider.getZoneDataset().then((next) => {
      if (!cancelled) setDataset(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return dataset;
}

/** Tier B: isochrone-derived travel times. Recomputed only on address change. */
export function useTravel(household: Household): Record<string, ZoneTravel> | null {
  const [travel, setTravel] = useState<Record<string, ZoneTravel> | null>(null);
  const key = travelKey(household);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    lastKey.current = key;

    provider.getTravel(household).then((next) => {
      // Drop results from a superseded household edit.
      if (!cancelled && lastKey.current === key) setTravel(next);
    });

    return () => {
      cancelled = true;
    };
    // `household` is intentionally excluded: only the targets matter, and
    // including it would recompute isochrones on every slider drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return travel;
}

export interface RankingState {
  result: ScoringResult | null;
  /** True until both the grid and the travel times are in. */
  isLoading: boolean;
}

/**
 * The full ranking pipeline.
 *
 * Tier C — the `useMemo` below — is the only part that reruns when a weight
 * slider moves, and it does so synchronously with no network round-trip. That
 * is what lets weights be a live control rather than a "Recalculate" button.
 */
export function useRanking(): RankingState {
  const household = useHouseholdStore((state) => state.household);
  const dataset = useZoneDataset();
  const travel = useTravel(household);

  const result = useMemo(() => {
    if (!dataset || !travel) return null;
    return scoreZones({
      zones: dataset.zones,
      metrics: dataset.metrics,
      travel,
      household,
    });
  }, [dataset, travel, household]);

  return { result, isLoading: !dataset || !travel };
}

/**
 * Whether the persisted household has been loaded from `localStorage`.
 *
 * Screens show a skeleton until this flips, so nothing renders from stored
 * state during SSR and mismatches the hydrated markup.
 *
 * The subscription is to the store's own rehydration event — a real
 * notification that genuinely fires after subscribe. A `useSyncExternalStore`
 * whose subscribe never calls back has no guaranteed re-render, which silently
 * leaves the app stuck on the skeleton.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useHouseholdStore.persist.onFinishHydration(onChange),
    () => useHouseholdStore.persist.hasHydrated(),
    () => false,
  );
}
