/**
 * Domain contract for the ranking engine.
 *
 * Deliberately country-agnostic and free of I/O: everything here is plain data
 * so the engine can run client-side on every slider drag (Tier C).
 */

import type { LatLng, Ring } from "@/lib/geo";

export type { LatLng, Ring };

export type TravelMode = "transit" | "drive" | "walk" | "bike";

export type Confidence = "high" | "medium" | "low";

/** How a household resolves disagreement between its members' commutes. */
export type CommuteAggregation = "mean" | "max" | "balanced";

/**
 * What to do with a zone nobody can route to (spec open decision #1).
 *
 * `reject` drops it entirely; `penalty` keeps it and scores the commute as
 * `UNREACHABLE_PENALTY_MINUTES`. This lives on the household rather than in
 * `config.ts` because it is a genuine preference, not a tuning constant: with
 * arbitrary workplaces a peripheral cell can be unreachable by transit and a
 * perfectly ordinary drive, and only the household knows which it meant.
 */
export type UnreachablePolicy = "reject" | "penalty";

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  work: LatLng | null;
  workLabel: string;
  modes: TravelMode[];
  /** 0–7. Scales this person's pull on the ranking. */
  daysInOffice: number;
  maxCommuteMinutes: number;
  /** Relative importance within the household, 0–1. */
  weight: number;
}

export interface Anchor {
  id: string;
  label: string;
  location: LatLng | null;
  locationLabel: string;
  visitsPerMonth: number;
  modes: TravelMode[];
}

export interface Household {
  id: string;
  metro: string;
  people: Person[];
  anchors: Anchor[];
  carCount: number;
  requiresStreetParking: boolean;
  /**
   * Upper bound on the price level metric, or `null` to disable the hard
   * filter and let cost act purely as a weighted metric (open decision #4).
   */
  maxCost: number | null;
  /** metricKey -> slider position, 0–1. */
  weights: Record<string, number>;
  commuteAggregation: CommuteAggregation;
  /** Whether an unroutable zone is dropped or merely penalised. */
  unreachablePolicy: UnreachablePolicy;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export interface Zone {
  /** H3 resolution 9 index. */
  h3: string;
  centroid: LatLng;
  /** Cell boundary in GeoJSON order, closed. */
  boundary: Ring;
  municipality: string;
  statAreaId: string;
}

export interface MetricValue {
  value: number;
  confidence: Confidence;
}

/** Static, precomputed metrics for one zone (Tier A). */
export type ZoneMetrics = Record<string, MetricValue>;

/**
 * Travel time from one zone to every household target, derived by testing the
 * zone against each target's isochrone bands (Tier B). `null` means the zone
 * fell outside the widest band — unreachable.
 */
export interface ZoneTravel {
  /** targetId -> minutes, or null when unreachable. */
  minutes: Record<string, number | null>;
}

/** Everything a metric module needs to produce a value for one zone. */
export interface MetricContext {
  zone: Zone;
  metrics: ZoneMetrics;
  travel: ZoneTravel;
  household: Household;
}

// ---------------------------------------------------------------------------
// Metric registry (§6)
// ---------------------------------------------------------------------------

export type MetricKind = "static" | "relational";
export type MetricDirection = "higher-is-better" | "lower-is-better";

export interface MetricDefinition {
  key: string;
  /** User-facing name. The single source of truth for UI copy. */
  label: string;
  /** One line explaining what the metric means, shown in the breakdown. */
  description: string;
  kind: MetricKind;
  direction: MetricDirection;
  defaultWeight: number;
  /** Raw value for a zone, or `null` when unavailable here. */
  compute(ctx: MetricContext): number | null;
  confidence(ctx: MetricContext): Confidence;
  /**
   * Whether the metric applies to this household at all. A car-free household
   * drops `parking` entirely rather than scoring every zone lower.
   */
  isAvailable?(household: Household): boolean;
  /** Human-readable rendering of a raw value. */
  format(value: number): string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface MetricContribution {
  key: string;
  label: string;
  description: string;
  direction: MetricDirection;
  raw: number;
  formatted: string;
  /** 0–1 after winsorized normalization, already flipped for direction. */
  normalized: number;
  /** Renormalized weight actually applied. */
  weight: number;
  /** `normalized * weight` — the metric's share of the final score. */
  contribution: number;
  confidence: Confidence;
}

export interface PersonCommute {
  personId: string;
  name: string;
  minutes: number | null;
  maxCommuteMinutes: number;
  daysInOffice: number;
}

export interface AnchorTime {
  anchorId: string;
  label: string;
  minutes: number | null;
  visitsPerMonth: number;
}

export interface ScoredZone {
  zone: Zone;
  /** 0–100. */
  score: number;
  /** 1-based, after sorting. */
  rank: number;
  breakdown: MetricContribution[];
  commutes: PersonCommute[];
  anchorTimes: AnchorTime[];
}

export type RejectionReason =
  | "over-max-commute"
  | "over-budget"
  | "no-parking"
  | "unreachable";

export interface Rejection {
  h3: string;
  reasons: RejectionReason[];
  detail: string;
}

export interface DroppedMetric {
  key: string;
  label: string;
  reason: "not-applicable" | "zero-weight" | "incomplete-coverage";
}

export interface ScoringResult {
  /** Survivors, sorted best first. */
  scored: ScoredZone[];
  rejections: Rejection[];
  rejectionCounts: Record<RejectionReason, number>;
  /** Metric keys that actually contributed, with their renormalized weights. */
  activeWeights: Record<string, number>;
  droppedMetrics: DroppedMetric[];
  zonesConsidered: number;
}
