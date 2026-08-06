/**
 * Deterministic pseudo-randomness for fixture generation.
 *
 * Everything derived from a string key, so the demo dataset is identical on
 * every load and across server and client — no hydration mismatches, and a
 * ranking you can actually reason about while tuning weights.
 */

/** FNV-1a. Fast, stable, good enough for jitter. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Uniform in [0, 1) from a string key. */
export function unitFrom(...parts: (string | number)[]): number {
  return hashString(parts.join("|")) / 0x100000000;
}

/** Uniform in [min, max) from a string key. */
export function rangeFrom(
  min: number,
  max: number,
  ...parts: (string | number)[]
): number {
  return min + unitFrom(...parts) * (max - min);
}

/**
 * Roughly bell-shaped noise in [-1, 1], by averaging three uniforms.
 * Keeps fixture metrics from looking like uniform static.
 */
export function noiseFrom(...parts: (string | number)[]): number {
  const a = unitFrom(...parts, "a");
  const b = unitFrom(...parts, "b");
  const c = unitFrom(...parts, "c");
  return ((a + b + c) / 3 - 0.5) * 2;
}
