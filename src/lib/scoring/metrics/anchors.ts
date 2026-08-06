import { ANCHOR_TAU_MINUTES } from "../config";
import { anchorTargetId } from "../targets";
import type { MetricContext, MetricDefinition } from "../types";

/**
 * Proximity value of being `minutes` away from an anchor.
 *
 * Exponential decay, not linear distance: 20 vs 30 minutes to your parents is
 * nearly the same life, 30 vs 90 is not.
 */
export function anchorDecay(minutes: number): number {
  return Math.exp(-minutes / ANCHOR_TAU_MINUTES);
}

export const anchorsMetric: MetricDefinition = {
  key: "anchors",
  label: "Family & anchors",
  description:
    "Closeness to the people you visit, weighted by how often you visit them.",
  kind: "relational",
  direction: "higher-is-better",
  defaultWeight: 0.6,

  isAvailable(household) {
    return household.anchors.some((anchor) => anchor.location !== null);
  },

  compute({ household, travel }: MetricContext) {
    const anchors = household.anchors.filter((anchor) => anchor.location);
    if (anchors.length === 0) return null;

    let weighted = 0;
    let totalWeight = 0;

    for (const anchor of anchors) {
      const weight = Math.max(anchor.visitsPerMonth, 0);
      const minutes = travel.minutes[anchorTargetId(anchor.id)] ?? null;

      // An unreachable anchor contributes zero rather than rejecting the zone —
      // living far from family is a trade-off, not a disqualification.
      const value = minutes === null ? 0 : anchorDecay(minutes);

      weighted += value * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return null;
    return weighted / totalWeight;
  },

  confidence() {
    return "high";
  },

  format(value) {
    return `${Math.round(value * 100)} / 100`;
  },
};
