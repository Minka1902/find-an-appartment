"use client";

import { cn } from "@/lib/cn";
import type { ScoredZone } from "@/lib/scoring/types";

/**
 * The ranked results beside the map.
 *
 * Also the accessible reading of the choropleth: the scale's lighter steps sit
 * below 3:1 against the surface, so this list is the required relief — every
 * value is legible as a number and reachable by keyboard, not only as a colour
 * on a map.
 */
export function RankedList({
  zones,
  selectedH3,
  onSelect,
  limit = 40,
}: {
  zones: ScoredZone[];
  selectedH3: string | null;
  onSelect(h3: string): void;
  limit?: number;
}) {
  if (zones.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-ink-muted">
        No areas passed your limits. Try raising a commute cap or your budget.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {zones.slice(0, limit).map((zone) => {
        const active = zone.zone.h3 === selectedH3;
        const topReason = zone.breakdown[0];

        return (
          <li key={zone.zone.h3}>
            <button
              type="button"
              onClick={() => onSelect(zone.zone.h3)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-accent-soft"
                  : "hover:bg-surface-sunken",
              )}
            >
              <span className="w-6 shrink-0 text-xs tabular-nums text-ink-faint">
                {zone.rank}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {zone.zone.municipality}
                </span>
                {topReason ? (
                  <span className="block truncate text-[11px] text-ink-faint">
                    Best on {topReason.label.toLowerCase()} ·{" "}
                    {topReason.formatted}
                  </span>
                ) : null}
              </span>

              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {Math.round(zone.score)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
