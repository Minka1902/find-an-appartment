/**
 * Static metrics (§6): precomputed per zone by the monthly Tier A cron and
 * shared across every household in the metro.
 *
 * Each module here is a thin reader over `zone_metrics`. The work lives in the
 * pipeline; the registry entry only declares direction, weight and formatting.
 */

import type { Confidence, MetricContext, MetricDefinition } from "../types";

interface StaticMetricSpec {
  key: string;
  label: string;
  description: string;
  direction: MetricDefinition["direction"];
  defaultWeight: number;
  format: (value: number) => string;
  isAvailable?: MetricDefinition["isAvailable"];
}

function readStatic({ metrics }: MetricContext, key: string): number | null {
  const entry = metrics[key];
  return entry ? entry.value : null;
}

function readConfidence({ metrics }: MetricContext, key: string): Confidence {
  return metrics[key]?.confidence ?? "low";
}

function defineStatic(spec: StaticMetricSpec): MetricDefinition {
  return {
    key: spec.key,
    label: spec.label,
    description: spec.description,
    kind: "static",
    direction: spec.direction,
    defaultWeight: spec.defaultWeight,
    isAvailable: spec.isAvailable,
    compute: (ctx) => readStatic(ctx, spec.key),
    confidence: (ctx) => readConfidence(ctx, spec.key),
    format: spec.format,
  };
}

export const transitMetric = defineStatic({
  key: "transit",
  label: "Transit quality",
  description:
    "Frequency and reach of nearby service, from the national GTFS feed.",
  direction: "higher-is-better",
  defaultWeight: 0.7,
  format: (value) => `${Math.round(value)} / 100`,
});

export const parkingMetric = defineStatic({
  key: "parking",
  label: "Parking",
  description: "How realistic it is to park a car here overnight.",
  direction: "higher-is-better",
  defaultWeight: 0.5,
  // No car: drop the metric and redistribute its weight rather than scoring
  // every zone lower for a constraint the household doesn't have.
  isAvailable: (household) => household.carCount > 0,
  format: (value) => `${Math.round(value)} / 100`,
});

export const costMetric = defineStatic({
  key: "cost",
  // Never "rent". These are aggregated sale prices, and the sale-to-rent ratio
  // varies systematically between central and peripheral areas, so calling it
  // rent would be actively wrong.
  label: "Price level",
  description:
    "Aggregated ₪/m² from recorded sale transactions. A relative price signal, not rent.",
  direction: "lower-is-better",
  defaultWeight: 0.8,
  format: (value) => `₪${Math.round(value).toLocaleString("en-US")}/m²`,
});

export const socioeconomicMetric = defineStatic({
  key: "socioeconomic",
  label: "Socioeconomic index",
  description:
    "Official CBS index for the surrounding statistical area, 1–10.",
  direction: "higher-is-better",
  defaultWeight: 0.3,
  format: (value) => value.toFixed(1),
});

export const shelterMetric = defineStatic({
  key: "shelter",
  label: "Safe room & shelter",
  description:
    "Likelihood of a ממ\"ד based on building era, plus proximity to public shelters.",
  direction: "higher-is-better",
  defaultWeight: 0.6,
  format: (value) => `${Math.round(value)} / 100`,
});

export const shabbatMetric = defineStatic({
  key: "shabbat",
  label: "Shabbat mobility",
  description:
    "Saturday transit service nearby — a genuine week-shaping difference for a car-free household.",
  direction: "higher-is-better",
  defaultWeight: 0.2,
  format: (value) => `${Math.round(value)} / 100`,
});
