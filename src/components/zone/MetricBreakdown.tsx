"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import type { MetricContribution } from "@/lib/scoring/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

/**
 * Why a cell scored what it scored.
 *
 * This is the trust-builder (§10.3). Without it the ranking is a black box and
 * nobody will act on it — a number between 0 and 100 is not a reason to move
 * house. Each row shows the raw value, how far it sits along the range of
 * *surviving* cells, and how much of the final score it actually contributed.
 */
export function MetricBreakdown({
  breakdown,
}: {
  breakdown: MetricContribution[];
}) {
  const total = breakdown.reduce((sum, row) => sum + row.contribution, 0);

  return (
    <div className="space-y-3">
      {breakdown.map((row) => {
        const share = total > 0 ? row.contribution / total : 0;
        const Arrow = row.direction === "higher-is-better" ? ArrowUp : ArrowDown;

        return (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
                <Arrow
                  size={12}
                  className="shrink-0 text-ink-faint"
                  aria-label={
                    row.direction === "higher-is-better"
                      ? "Higher is better"
                      : "Lower is better"
                  }
                />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                {row.formatted}
              </span>
            </div>

            {/* Position within the surviving range, not an absolute rating. */}
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                role="img"
                aria-label={`${row.label}: ${Math.round(row.normalized * 100)} out of 100 relative to other areas`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(row.normalized * 100)}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">
                {Math.round(share * 100)}% of score
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <ConfidenceBadge confidence={row.confidence} />
              <span className="text-[11px] text-ink-faint">
                {row.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
