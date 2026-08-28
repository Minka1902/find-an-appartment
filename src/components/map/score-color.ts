/**
 * The choropleth colour scale.
 *
 * Score is a magnitude, so this is a **sequential** encoding: one hue, stepped
 * light→dark. Never a rainbow — a multi-hue ramp invents category boundaries
 * that aren't in the data.
 *
 * The anchor flips in dark mode. The rule isn't "light means low", it's that
 * the low end recedes toward the surface it sits on — which is the light end on
 * a light basemap and the dark end on a dark one.
 */

/** Sequential blue ramp, steps 100→700. */
const BLUE = {
  100: "#cde2fb",
  200: "#9ec5f4",
  350: "#5598e7",
  450: "#2a78d6",
  550: "#1c5cab",
  650: "#104281",
  700: "#0d366b",
} as const;

export interface ScaleStop {
  score: number;
  color: string;
}

export const LIGHT_STOPS: ScaleStop[] = [
  { score: 0, color: BLUE[100] },
  { score: 25, color: BLUE[200] },
  { score: 50, color: BLUE[350] },
  { score: 75, color: BLUE[450] },
  { score: 100, color: BLUE[650] },
];

export const DARK_STOPS: ScaleStop[] = [
  { score: 0, color: BLUE[700] },
  { score: 25, color: BLUE[550] },
  { score: 50, color: BLUE[450] },
  { score: 75, color: BLUE[350] },
  { score: 100, color: BLUE[200] },
];

export function scaleStops(isDark: boolean): ScaleStop[] {
  return isDark ? DARK_STOPS : LIGHT_STOPS;
}

/** Zones that failed a hard filter: present, but visibly not in the running. */
export function excludedColor(isDark: boolean): string {
  return isDark ? "#4d545e" : "#c8ccd2";
}

/**
 * Fill opacity for the two states a cell can be in.
 *
 * The excluded value is deliberately not much lower than the scored one. At
 * 0.25 over the dark basemap (`#0d0f12`) excluded cells composited to roughly
 * `#191b1f` — indistinguishable from bare background, so the ranked cells read
 * as a lone island floating in empty space rather than as the dense part of a
 * grid that covers the whole metro. Exported so the legend swatch and the map
 * cannot drift apart.
 */
export const EXCLUDED_FILL_OPACITY = 0.45;
export const SCORED_FILL_OPACITY = 0.72;

/**
 * A MapLibre paint expression driven by `feature-state`.
 *
 * Reading the score from feature-state rather than from feature properties is
 * what keeps a slider drag cheap: re-ranking calls `setFeatureState` per cell
 * and the GPU recolours, instead of re-serializing thousands of polygons into
 * a new GeoJSON payload on every frame.
 */
export function fillColorExpression(isDark: boolean): unknown[] {
  const stops = scaleStops(isDark);
  const excluded = excludedColor(isDark);

  return [
    "interpolate",
    ["linear"],
    // Unscored cells (hard-filtered, or not yet ranked) land on the sentinel.
    ["coalesce", ["feature-state", "score"], -1],
    -1,
    excluded,
    // Flat to just below zero so the sentinel never blends into the ramp.
    -0.001,
    excluded,
    ...stops.flatMap((stop) => [stop.score, stop.color]),
  ];
}

/** CSS gradient matching the map ramp, for the legend. */
export function legendGradient(isDark: boolean): string {
  const stops = scaleStops(isDark)
    .map((stop) => `${stop.color} ${stop.score}%`)
    .join(", ");
  return `linear-gradient(to right, ${stops})`;
}
