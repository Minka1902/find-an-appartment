"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useAsync } from "@/hooks/use-async";
import { provider, type Metro } from "@/lib/data/provider";
import type { ZoneDataset } from "@/lib/fixtures/zones";
import { scoreZones } from "@/lib/scoring/score-zones";
import { householdTargets } from "@/lib/scoring/targets";
import type {
  Household,
  Rejection,
  ScoringResult,
  ZoneTravel,
} from "@/lib/scoring/types";
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

/**
 * The metro's identity and bounds.
 *
 * Screens that need the map's extent go through this rather than importing the
 * Gush Dan fixture, so the data seam actually holds when a second metro exists.
 */
export function useMetro() {
  const run = useCallback(() => provider.getMetro(), []);
  return useAsync<Metro>(run, "metro");
}

/** Tier A: the metro's cell grid and static metrics. Loaded once. */
export function useZoneDataset() {
  const run = useCallback(() => provider.getZoneDataset(), []);
  return useAsync<ZoneDataset>(run, "zone-dataset");
}

/**
 * Tier B: isochrone-derived travel times. Recomputed only on address change.
 *
 * The key is `travelKey(household)` — target coordinates only. Weight changes
 * must never appear in it: that is the whole point of the tier split, and
 * including the household would rebuild every isochrone on each slider drag.
 */
export function useTravel(household: Household) {
  const key = travelKey(household);

  const run = useCallback(
    () => provider.getTravel(household),
    // `household` is deliberately excluded: it gets a new identity on every
    // edit, weights included, and re-running on that would defeat the tier
    // split. `key` covers the only changes that alter the isochrones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return useAsync<Record<string, ZoneTravel>>(run, key);
}

export interface RankingState {
  result: ScoringResult | null;
  /** True until both the grid and the travel times are in. */
  isLoading: boolean;
  /** Non-null when either tier failed. Distinguishes failed from slow. */
  error: Error | null;
  /** Re-runs whichever tier failed. */
  retry(): void;
  /**
   * `h3 -> rejection` for zones the hard filters dropped.
   *
   * `ScoringResult.rejections` is an array, but every consumer wants a lookup:
   * clicking a greyed-out cell on the map has only its h3 to go on. Built once
   * here rather than scanning thousands of rejections per click.
   */
  rejectionsByH3: Map<string, Rejection>;
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
    if (!dataset.data || !travel.data) return null;
    return scoreZones({
      zones: dataset.data.zones,
      metrics: dataset.data.metrics,
      travel: travel.data,
      household,
    });
  }, [dataset.data, travel.data, household]);

  const rejectionsByH3 = useMemo(() => {
    const byH3 = new Map<string, Rejection>();
    for (const rejection of result?.rejections ?? []) {
      byH3.set(rejection.h3, rejection);
    }
    return byH3;
  }, [result]);

  const retry = useCallback(() => {
    if (dataset.error) dataset.retry();
    if (travel.error) travel.retry();
  }, [dataset, travel]);

  return {
    result,
    isLoading: dataset.isLoading || travel.isLoading,
    error: dataset.error ?? travel.error,
    retry,
    rejectionsByH3,
  };
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
