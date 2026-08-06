import {
  BALANCED_MEAN_SHARE,
  UNREACHABLE_PENALTY_MINUTES,
  UNREACHABLE_POLICY,
} from "../config";
import { personTargetId } from "../targets";
import type { Household, MetricContext, MetricDefinition, ZoneTravel } from "../types";

/**
 * Effective commute weight for a person.
 *
 * Someone in the office twice a week shouldn't drag the ranking as hard as
 * someone going five days, so days-in-office multiplies their stated weight.
 */
export function commuteWeight(person: {
  weight: number;
  daysInOffice: number;
}): number {
  return person.weight * person.daysInOffice;
}

export interface CommuteSample {
  personId: string;
  minutes: number | null;
  weight: number;
}

export function collectCommutes(
  household: Household,
  travel: ZoneTravel,
): CommuteSample[] {
  return household.people
    .filter((person) => person.work !== null)
    .map((person) => ({
      personId: person.id,
      minutes: travel.minutes[personTargetId(person.id)] ?? null,
      weight: commuteWeight(person),
    }));
}

/**
 * Reduce per-person commutes to a single number.
 *
 * Households genuinely differ on whether they optimize the average or protect
 * the worst-off person, so the aggregation is a household setting rather than
 * a hardcoded choice.
 */
export function aggregateCommute(
  samples: CommuteSample[],
  aggregation: Household["commuteAggregation"],
): number | null {
  const resolved = samples.map((sample) => ({
    ...sample,
    minutes:
      sample.minutes ??
      (UNREACHABLE_POLICY === "penalty" ? UNREACHABLE_PENALTY_MINUTES : null),
  }));

  if (resolved.some((sample) => sample.minutes === null)) return null;
  if (resolved.length === 0) return null;

  const minutes = resolved.map((sample) => sample.minutes as number);
  const worst = Math.max(...minutes);

  const totalWeight = resolved.reduce((sum, sample) => sum + sample.weight, 0);
  // Everyone fully remote: fall back to an unweighted mean rather than 0/0.
  const mean =
    totalWeight > 0
      ? resolved.reduce(
          (sum, sample) => sum + (sample.minutes as number) * sample.weight,
          0,
        ) / totalWeight
      : minutes.reduce((sum, value) => sum + value, 0) / minutes.length;

  switch (aggregation) {
    case "mean":
      return mean;
    case "max":
      return worst;
    case "balanced":
      return BALANCED_MEAN_SHARE * mean + (1 - BALANCED_MEAN_SHARE) * worst;
  }
}

export const commuteMetric: MetricDefinition = {
  key: "commute",
  label: "Commute",
  description:
    "Travel time to each person's workplace, weighted by how many days a week they go in.",
  kind: "relational",
  direction: "lower-is-better",
  defaultWeight: 1,

  isAvailable(household) {
    return household.people.some((person) => person.work !== null);
  },

  compute({ household, travel }: MetricContext) {
    return aggregateCommute(
      collectCommutes(household, travel),
      household.commuteAggregation,
    );
  },

  confidence() {
    // Straight from the routing graph — as good as the isochrones themselves.
    return "high";
  },

  format(value) {
    return `${Math.round(value)} min`;
  },
};
