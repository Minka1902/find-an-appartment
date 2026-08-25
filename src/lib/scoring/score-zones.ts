/**
 * The scoring engine (§7).
 *
 * Pure and synchronous by design: it runs client-side on every slider drag
 * (Tier C), over a zone set already narrowed to the household's 60-minute
 * isochrone union. No network, no React, no I/O.
 */

import { collectCommutes } from "./metrics/commute";
import { applicableMetrics, METRICS } from "./registry";
import { normalize, percentile } from "./stats";
import { WINSOR_HIGH, WINSOR_LOW } from "./config";
import { anchorTargetId, personTargetId } from "./targets";
import type {
  AnchorTime,
  DroppedMetric,
  Household,
  MetricContext,
  MetricContribution,
  MetricDefinition,
  PersonCommute,
  Rejection,
  RejectionReason,
  ScoredZone,
  ScoringResult,
  Zone,
  ZoneMetrics,
  ZoneTravel,
} from "./types";

export interface ScoreZonesInput {
  zones: Zone[];
  /** h3 -> static metric values (Tier A). */
  metrics: Record<string, ZoneMetrics>;
  /** h3 -> travel times to every target (Tier B). */
  travel: Record<string, ZoneTravel>;
  household: Household;
}

const EMPTY_METRICS: ZoneMetrics = {};
const EMPTY_TRAVEL: ZoneTravel = { minutes: {} };

function emptyRejectionCounts(): Record<RejectionReason, number> {
  return {
    "over-max-commute": 0,
    "over-budget": 0,
    "no-parking": 0,
    unreachable: 0,
  };
}

// ---------------------------------------------------------------------------
// Hard filters
// ---------------------------------------------------------------------------

/**
 * Eliminate zones that violate a stated constraint, before any scoring.
 *
 * Filtering first is what makes the normalization step meaningful: a distant
 * area you would never consider can't rescale the whole board.
 */
function hardFilter(ctx: MetricContext): Rejection | null {
  const { zone, metrics, travel, household } = ctx;
  const reasons: RejectionReason[] = [];
  const details: string[] = [];

  for (const person of household.people) {
    if (!person.work) continue;
    const minutes = travel.minutes[personTargetId(person.id)] ?? null;

    if (minutes === null) {
      if (household.unreachablePolicy === "reject") {
        reasons.push("unreachable");
        details.push(`No route found for ${person.name}`);
      }
      continue;
    }

    if (minutes > person.maxCommuteMinutes) {
      reasons.push("over-max-commute");
      details.push(
        `${person.name}: ${Math.round(minutes)} min > ${person.maxCommuteMinutes} min limit`,
      );
    }
  }

  if (household.maxCost !== null) {
    const cost = metrics.cost?.value;
    if (cost !== undefined && cost > household.maxCost) {
      reasons.push("over-budget");
      details.push(
        `Price level ₪${Math.round(cost).toLocaleString("en-US")}/m² over budget`,
      );
    }
  }

  if (household.requiresStreetParking) {
    const parking = metrics.parking?.value ?? 0;
    if (parking <= 0) {
      reasons.push("no-parking");
      details.push("Street parking required but unavailable here");
    }
  }

  if (reasons.length === 0) return null;

  return {
    h3: zone.h3,
    // Dedupe: several people can trip the same reason.
    reasons: [...new Set(reasons)],
    detail: details.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Per-zone detail for the breakdown UI
// ---------------------------------------------------------------------------

function personCommutes(
  household: Household,
  travel: ZoneTravel,
): PersonCommute[] {
  const byId = new Map(
    collectCommutes(household, travel).map((sample) => [
      sample.personId,
      sample.minutes,
    ]),
  );

  return household.people.map((person) => ({
    personId: person.id,
    name: person.name,
    minutes: person.work ? (byId.get(person.id) ?? null) : null,
    maxCommuteMinutes: person.maxCommuteMinutes,
    daysInOffice: person.daysInOffice,
  }));
}

function anchorTimes(household: Household, travel: ZoneTravel): AnchorTime[] {
  return household.anchors.map((anchor) => ({
    anchorId: anchor.id,
    label: anchor.label,
    minutes: anchor.location
      ? (travel.minutes[anchorTargetId(anchor.id)] ?? null)
      : null,
    visitsPerMonth: anchor.visitsPerMonth,
  }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function scoreZones(input: ScoreZonesInput): ScoringResult {
  const { zones, metrics, travel, household } = input;

  const rejections: Rejection[] = [];
  const rejectionCounts = emptyRejectionCounts();
  const survivors: MetricContext[] = [];

  // --- 1. Hard filters -----------------------------------------------------
  for (const zone of zones) {
    const ctx: MetricContext = {
      zone,
      metrics: metrics[zone.h3] ?? EMPTY_METRICS,
      travel: travel[zone.h3] ?? EMPTY_TRAVEL,
      household,
    };

    const rejection = hardFilter(ctx);
    if (rejection) {
      rejections.push(rejection);
      for (const reason of rejection.reasons) rejectionCounts[reason] += 1;
      continue;
    }

    survivors.push(ctx);
  }

  if (survivors.length === 0) {
    return {
      scored: [],
      rejections,
      rejectionCounts,
      activeWeights: {},
      droppedMetrics: [],
      zonesConsidered: zones.length,
    };
  }

  // --- 2. Raw values over survivors only -----------------------------------
  const candidates = applicableMetrics(household);
  // Metrics that don't apply to this household at all (no car -> parking).
  const droppedMetrics: DroppedMetric[] = notApplicableMetrics(
    household,
    METRICS,
  );
  const active: { metric: MetricDefinition; raws: number[] }[] = [];

  for (const metric of applicableMetricsWithDrops(
    household,
    candidates,
    droppedMetrics,
  )) {
    const raws: number[] = [];
    let complete = true;

    for (const ctx of survivors) {
      const value = metric.compute(ctx);
      if (value === null || !Number.isFinite(value)) {
        complete = false;
        break;
      }
      raws.push(value);
    }

    // A metric counts only if present for *all* surviving zones. Otherwise it's
    // dropped rather than penalizing the zones that happen to have data gaps.
    if (!complete) {
      droppedMetrics.push({
        key: metric.key,
        label: metric.label,
        reason: "incomplete-coverage",
      });
      continue;
    }

    active.push({ metric, raws });
  }

  // --- 3. Winsorized normalization -----------------------------------------
  const ranges = active.map(({ raws }) => ({
    low: percentile(raws, WINSOR_LOW),
    high: percentile(raws, WINSOR_HIGH),
  }));

  // --- 4. Renormalize weights over what actually survived -------------------
  const rawWeights = active.map(
    ({ metric }) => household.weights[metric.key] ?? metric.defaultWeight,
  );
  const weightSum = rawWeights.reduce((sum, weight) => sum + weight, 0);
  const weights =
    weightSum > 0
      ? rawWeights.map((weight) => weight / weightSum)
      : rawWeights.map(() => 1 / Math.max(active.length, 1));

  const activeWeights: Record<string, number> = {};
  active.forEach(({ metric }, index) => {
    activeWeights[metric.key] = weights[index];
  });

  // --- 5. Score ------------------------------------------------------------
  const scored: ScoredZone[] = survivors.map((ctx, zoneIndex) => {
    const breakdown: MetricContribution[] = [];
    let score = 0;

    active.forEach(({ metric, raws }, metricIndex) => {
      const raw = raws[zoneIndex];
      const scaled = normalize(raw, ranges[metricIndex]);
      // Flip so 1 is always "good", whatever the metric's direction.
      const normalized =
        metric.direction === "lower-is-better" ? 1 - scaled : scaled;

      const weight = weights[metricIndex];
      const contribution = normalized * weight;
      score += contribution;

      breakdown.push({
        key: metric.key,
        label: metric.label,
        description: metric.description,
        direction: metric.direction,
        raw,
        formatted: metric.format(raw),
        normalized,
        weight,
        contribution,
        confidence: metric.confidence(ctx),
      });
    });

    breakdown.sort((a, b) => b.contribution - a.contribution);

    return {
      zone: ctx.zone,
      score: score * 100,
      rank: 0,
      breakdown,
      commutes: personCommutes(household, ctx.travel),
      anchorTimes: anchorTimes(household, ctx.travel),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((zone, index) => {
    zone.rank = index + 1;
  });

  return {
    scored,
    rejections,
    rejectionCounts,
    activeWeights,
    droppedMetrics,
    zonesConsidered: zones.length,
  };
}

/**
 * Filter out metrics the household has zeroed, recording why they were
 * dropped so the UI can explain a missing row rather than silently omitting it.
 */
function applicableMetricsWithDrops(
  household: Household,
  candidates: MetricDefinition[],
  drops: DroppedMetric[],
): MetricDefinition[] {
  const kept: MetricDefinition[] = [];

  for (const metric of candidates) {
    const weight = household.weights[metric.key] ?? metric.defaultWeight;
    if (weight <= 0) {
      drops.push({
        key: metric.key,
        label: metric.label,
        reason: "zero-weight",
      });
      continue;
    }
    kept.push(metric);
  }

  return kept;
}

/** Metrics excluded because they don't apply to this household at all. */
export function notApplicableMetrics(
  household: Household,
  all: MetricDefinition[],
): DroppedMetric[] {
  return all
    .filter((metric) => !(metric.isAvailable?.(household) ?? true))
    .map((metric) => ({
      key: metric.key,
      label: metric.label,
      reason: "not-applicable" as const,
    }));
}
