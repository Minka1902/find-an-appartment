/**
 * Tunables for the scoring engine.
 *
 * These are the knobs the P0 exit criterion (§11) is validated against: if the
 * ranking doesn't match intuition for a case you already know, the answer is
 * almost always in this file rather than in `score-zones.ts`.
 */

import type { UnreachablePolicy } from "./types";

/**
 * Open decision #1 (§13) — now resolved in the UI rather than here.
 *
 * The policy moved onto `Household.unreachablePolicy` once people could enter
 * arbitrary workplaces: whether an unroutable cell should vanish or just score
 * badly depends on the household's modes, not on a global tuning constant. This
 * value is only the default for a household that has never expressed a choice,
 * and it preserves the engine's original behaviour.
 */
export const DEFAULT_UNREACHABLE_POLICY: UnreachablePolicy = "reject";

/** Stand-in commute time under `penalty` policy. Deliberately punitive. */
export const UNREACHABLE_PENALTY_MINUTES = 120;

/**
 * Anchor proximity decays as `exp(-minutes / ANCHOR_TAU)`.
 *
 * 20 vs 30 minutes to your parents is nearly the same life; 30 vs 90 is not.
 * Linear distance cannot express that.
 */
export const ANCHOR_TAU_MINUTES = 25;

/**
 * Winsorization bounds for normalization.
 *
 * Plain min-max lets a single 90-minute outlier compress every real difference
 * into the bottom of the range. Clamping at p5/p95 keeps the spread readable.
 */
export const WINSOR_LOW = 0.05;
export const WINSOR_HIGH = 0.95;

/** `balanced` aggregation: this much weighted mean, the rest worst-case. */
export const BALANCED_MEAN_SHARE = 0.6;

/** Isochrone bands available from the routing tier, in minutes. */
export const ISOCHRONE_BANDS = [15, 30, 45, 60] as const;
