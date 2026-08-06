/** Small statistics helpers used by the normalization step. */

/**
 * Linear-interpolated percentile over an unsorted sample.
 * `q` is a fraction in [0, 1].
 */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);

  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface NormalizationRange {
  low: number;
  high: number;
}

/**
 * Map a value into 0–1 against a winsorized range.
 *
 * A degenerate range (every zone identical) yields 0.5 for all zones — the
 * metric carries no information, so it should not tilt the ranking either way.
 */
export function normalize(value: number, range: NormalizationRange): number {
  const span = range.high - range.low;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp((value - range.low) / span, 0, 1);
}
