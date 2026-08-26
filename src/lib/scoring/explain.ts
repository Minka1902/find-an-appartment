/**
 * Turning exclusions into something a user can act on.
 *
 * The engine has always computed why every zone was dropped, and the UI showed
 * one number: "2,107 excluded". That is a dead end — it tells you the search
 * failed without telling you which of your own constraints did it, and an empty
 * map reads as "nowhere suits you" rather than "your commute cap is 20 minutes".
 *
 * Pure and synchronous, over an already-computed `ScoringResult`, so it costs
 * one pass over the rejections and can be unit-tested exactly.
 */

import type {
  Household,
  Rejection,
  RejectionReason,
  ScoringResult,
} from "./types";

export interface RelaxationSuggestion {
  /** Stable key, for React and for tests. */
  id: string;
  reason: RejectionReason;
  /** What the user would be doing, e.g. "Give Maya 55 minutes". */
  label: string;
  /** Why it helps, in one line. */
  detail: string;
  /**
   * Exactly how many currently-excluded zones this change would admit.
   *
   * Counted by simulating the change against every rejection, not estimated:
   * a promise of "340 more areas" that turns out to be 12 is worse than no
   * promise at all.
   */
  unlocks: number;
  /** The edit itself, applied by the caller against the store. */
  action:
    | { kind: "person-commute"; personId: string; maxCommuteMinutes: number }
    | { kind: "max-cost"; maxCost: number | null }
    | { kind: "street-parking"; requiresStreetParking: false }
    | { kind: "unreachable-policy"; unreachablePolicy: "penalty" };
}

export interface ExclusionExplanation {
  total: number;
  /**
   * Zones blocked by exactly one constraint, per reason.
   *
   * This — not `rejectionCounts` — is the number that answers "what happens if
   * I loosen this?". A zone rejected for three reasons is counted in three
   * buckets of `rejectionCounts` but unlocked by none of them individually, so
   * relaxing one constraint moves it nowhere.
   */
  blockedSolelyBy: Record<RejectionReason, number>;
  /** Best first, by how many zones each would admit. */
  suggestions: RelaxationSuggestion[];
}

const REASON_LABELS: Record<RejectionReason, string> = {
  "over-max-commute": "Someone's commute limit",
  "over-budget": "Your price ceiling",
  "no-parking": "Street parking required",
  unreachable: "No route found",
};

export function reasonLabel(reason: RejectionReason): string {
  return REASON_LABELS[reason];
}

function emptyCounts(): Record<RejectionReason, number> {
  return {
    "over-max-commute": 0,
    "over-budget": 0,
    "no-parking": 0,
    unreachable: 0,
  };
}

/** Round up to the next step, so suggestions land on tidy numbers. */
function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Would this rejection be resolved if `personId` had `limit` minutes instead?
 *
 * Every one of the zone's reasons has to fall away, not just the commute one —
 * raising a cap does nothing for a zone that is also over budget.
 */
function unlockedByCommute(
  rejection: Rejection,
  personId: string,
  limit: number,
): boolean {
  if (rejection.reasons.some((reason) => reason !== "over-max-commute")) {
    return false;
  }
  // Every person who was over must now be within the limit. Only `personId`'s
  // limit changes, so anyone else over still blocks it.
  return rejection.commuteOverruns.every((overrun) =>
    overrun.personId === personId
      ? overrun.minutes <= limit
      : overrun.minutes <= overrun.limit,
  );
}

function commuteSuggestions(
  rejections: Rejection[],
  household: Household,
): RelaxationSuggestion[] {
  const suggestions: RelaxationSuggestion[] = [];

  for (const person of household.people) {
    if (!person.work) continue;

    // Zones this person alone is keeping out: commute is the only reason, and
    // they are the only one over their limit.
    const soleBlame = rejections.filter(
      (rejection) =>
        rejection.reasons.length === 1 &&
        rejection.reasons[0] === "over-max-commute" &&
        rejection.commuteOverruns.length === 1 &&
        rejection.commuteOverruns[0].personId === person.id,
    );

    if (soleBlame.length === 0) continue;

    const overruns = soleBlame.map((rejection) => rejection.commuteOverruns[0].minutes);
    // The median lands on a limit that admits about half of what this person is
    // blocking — a visible improvement without proposing a two-hour commute.
    const proposed = roundUpTo(median(overruns), 5);
    if (proposed <= person.maxCommuteMinutes) continue;

    const unlocks = rejections.filter((rejection) =>
      unlockedByCommute(rejection, person.id, proposed),
    ).length;

    if (unlocks === 0) continue;

    suggestions.push({
      id: `commute:${person.id}`,
      reason: "over-max-commute",
      label: `Give ${person.name || "them"} ${proposed} minutes`,
      detail: `Currently capped at ${person.maxCommuteMinutes} min.`,
      unlocks,
      action: {
        kind: "person-commute",
        personId: person.id,
        maxCommuteMinutes: proposed,
      },
    });
  }

  return suggestions;
}

function costSuggestion(
  rejections: Rejection[],
  household: Household,
): RelaxationSuggestion | null {
  if (household.maxCost === null) return null;

  const soleBlame = rejections.filter(
    (rejection) =>
      rejection.reasons.length === 1 &&
      rejection.reasons[0] === "over-budget" &&
      rejection.costOverrun !== null,
  );
  if (soleBlame.length === 0) return null;

  const proposed = roundUpTo(
    median(soleBlame.map((rejection) => rejection.costOverrun as number)),
    1000,
  );
  if (proposed <= household.maxCost) return null;

  const unlocks = soleBlame.filter(
    (rejection) => (rejection.costOverrun as number) <= proposed,
  ).length;
  if (unlocks === 0) return null;

  return {
    id: "cost",
    reason: "over-budget",
    label: `Raise the ceiling to ₪${proposed.toLocaleString("en-US")}/m²`,
    detail: `Currently ₪${household.maxCost.toLocaleString("en-US")}/m².`,
    unlocks,
    action: { kind: "max-cost", maxCost: proposed },
  };
}

function parkingSuggestion(
  rejections: Rejection[],
  household: Household,
): RelaxationSuggestion | null {
  if (!household.requiresStreetParking) return null;

  const unlocks = rejections.filter(
    (rejection) =>
      rejection.reasons.length === 1 && rejection.reasons[0] === "no-parking",
  ).length;
  if (unlocks === 0) return null;

  return {
    id: "parking",
    reason: "no-parking",
    label: "Drop the street-parking requirement",
    detail: "Parking still counts as a weighted metric, just not a hard filter.",
    unlocks,
    action: { kind: "street-parking", requiresStreetParking: false },
  };
}

function unreachableSuggestion(
  rejections: Rejection[],
  household: Household,
): RelaxationSuggestion | null {
  if (household.unreachablePolicy !== "reject") return null;

  const unlocks = rejections.filter(
    (rejection) =>
      rejection.reasons.length === 1 && rejection.reasons[0] === "unreachable",
  ).length;
  if (unlocks === 0) return null;

  return {
    id: "unreachable",
    reason: "unreachable",
    label: "Keep areas with no route, scored badly",
    detail: "They stay on the map with a heavy commute penalty instead.",
    unlocks,
    action: { kind: "unreachable-policy", unreachablePolicy: "penalty" },
  };
}

export function explainExclusions(
  result: ScoringResult,
  household: Household,
): ExclusionExplanation {
  const blockedSolelyBy = emptyCounts();

  for (const rejection of result.rejections) {
    if (rejection.reasons.length === 1) {
      blockedSolelyBy[rejection.reasons[0]] += 1;
    }
  }

  const suggestions = [
    ...commuteSuggestions(result.rejections, household),
    costSuggestion(result.rejections, household),
    parkingSuggestion(result.rejections, household),
    unreachableSuggestion(result.rejections, household),
  ]
    .filter((suggestion): suggestion is RelaxationSuggestion => suggestion !== null)
    .sort((a, b) => b.unlocks - a.unlocks);

  return {
    total: result.rejections.length,
    blockedSolelyBy,
    suggestions,
  };
}
