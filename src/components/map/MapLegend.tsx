"use client";

import { cn } from "@/lib/cn";
import {
  EXCLUDED_FILL_OPACITY,
  excludedColor,
  legendGradient,
} from "./score-color";

/**
 * The scale legend.
 *
 * A sequential ramp spans the lightness band, so its lighter steps sit below
 * 3:1 against the surface. The relief for that is exactly this: a labelled
 * scale plus the ranked list beside the map, so magnitude is never carried by
 * colour alone.
 */
export function MapLegend({
  isDark,
  excludedCount,
  className,
}: {
  isDark: boolean;
  excludedCount: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-surface/95 px-3 py-2",
        "shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="mb-1 text-[11px] font-medium text-ink-muted">
        Match score
      </div>

      <div
        className="h-2 w-full min-w-[132px] rounded-full"
        style={{ background: legendGradient(isDark) }}
        role="img"
        aria-label="Score scale from 0, worst match, to 100, best match"
      />

      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>

      {excludedCount > 0 ? (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle pt-2 text-[11px] text-ink-muted">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: excludedColor(isDark), opacity: EXCLUDED_FILL_OPACITY }}
          />
          <span>
            {excludedCount.toLocaleString()} excluded by your limits
          </span>
        </div>
      ) : null}
    </div>
  );
}
