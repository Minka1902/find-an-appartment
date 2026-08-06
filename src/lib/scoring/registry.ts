/**
 * The metric registry (§6).
 *
 * Adding a metric is a new module file plus one entry here — never a schema
 * migration, because static values live in a key-value `zone_metrics` table.
 */

import { anchorsMetric } from "./metrics/anchors";
import { commuteMetric } from "./metrics/commute";
import {
  costMetric,
  parkingMetric,
  shabbatMetric,
  shelterMetric,
  socioeconomicMetric,
  transitMetric,
} from "./metrics/static-metrics";
import type { Household, MetricDefinition } from "./types";

export const METRICS: MetricDefinition[] = [
  commuteMetric,
  anchorsMetric,
  transitMetric,
  costMetric,
  parkingMetric,
  shelterMetric,
  shabbatMetric,
  socioeconomicMetric,
];

export const METRICS_BY_KEY: Record<string, MetricDefinition> =
  Object.fromEntries(METRICS.map((metric) => [metric.key, metric]));

export function getMetric(key: string): MetricDefinition | undefined {
  return METRICS_BY_KEY[key];
}

/** Starting slider positions for a new household. */
export function defaultWeights(): Record<string, number> {
  return Object.fromEntries(
    METRICS.map((metric) => [metric.key, metric.defaultWeight]),
  );
}

/** Metrics that apply to this household at all, before coverage is checked. */
export function applicableMetrics(household: Household): MetricDefinition[] {
  return METRICS.filter(
    (metric) => metric.isAvailable?.(household) ?? true,
  );
}
