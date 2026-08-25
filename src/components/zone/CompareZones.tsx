"use client";

import { Star, Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/scoring/registry";
import type { ScoredZone } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * Shortlisted areas, side by side.
 *
 * The product's premise is that a household argues about where to live, and an
 * argument needs the candidates next to each other. Everything before this
 * showed one area at a time, so comparing two meant clicking back and forth and
 * holding eight numbers in your head.
 *
 * A row per metric, a column per area, and the best value in each row marked.
 * The marker is the point: "Ramat Gan wins on commute, Holon on price" is the
 * shape of the actual decision, and it is invisible in a list of scores.
 *
 * Compact: the columns scroll sideways under a sticky label column, which is
 * the one place in this app horizontal scrolling is right — the alternative is
 * truncating the numbers being compared.
 */
export function CompareZones({ zones }: { zones: ScoredZone[] }) {
  const togglePin = useHouseholdStore((state) => state.togglePin);

  if (zones.length === 0) return null;

  // Only metrics every pinned area actually carries, so a row can't compare a
  // number against a blank.
  const metricKeys = METRICS.map((metric) => metric.key).filter((key) =>
    zones.every((zone) => zone.breakdown.some((row) => row.key === key)),
  );

  const people = zones[0].commutes;

  /**
   * Municipalities repeat across cells — a large city is many H3 cells — so a
   * shortlist can easily hold two areas both labelled "Petah Tikva". Identical
   * column headers make the comparison unreadable, so colliding names get the
   * cell's tail appended to tell them apart.
   */
  const nameCounts = new Map<string, number>();
  for (const zone of zones) {
    nameCounts.set(
      zone.zone.municipality,
      (nameCounts.get(zone.zone.municipality) ?? 0) + 1,
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          Shortlisted areas compared across commute and every scored metric
        </caption>

        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-medium text-ink-muted"
            >
              <span className="sr-only">Metric</span>
            </th>
            {zones.map((zone) => (
              <th
                key={zone.zone.h3}
                scope="col"
                className="border-b border-border-subtle px-3 py-2 text-left align-top"
              >
                <div className="truncate text-sm font-semibold">
                  {zone.zone.municipality}
                  {(nameCounts.get(zone.zone.municipality) ?? 0) > 1 ? (
                    <span className="font-normal text-ink-faint">
                      {" "}
                      ·{zone.zone.h3.slice(-4)}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] font-normal text-ink-faint">
                  #{zone.rank} · score {Math.round(zone.score)}
                </div>
                <button
                  type="button"
                  onClick={() => togglePin(zone.zone.h3)}
                  className="touch-target mt-1 flex items-center gap-1 rounded-md text-[11px] font-medium text-accent"
                  aria-label={`Remove ${zone.zone.municipality} from the shortlist`}
                >
                  <Star size={11} aria-hidden fill="currentColor" />
                  Remove
                </button>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Commute first: it is the number households actually argue over. */}
          {people.map((person, personIndex) => {
            const minutes = zones.map(
              (zone) => zone.commutes[personIndex]?.minutes ?? null,
            );
            const best = bestOf(minutes, "lower");

            return (
              <tr key={person.personId}>
                <Label>
                  {person.name || "Person"}
                  <span className="block text-[10px] font-normal text-ink-faint">
                    commute
                  </span>
                </Label>
                {minutes.map((value, index) => (
                  <Cell
                    key={zones[index].zone.h3}
                    isBest={best !== null && index === best}
                  >
                    {value === null ? "—" : `≤ ${value} min`}
                  </Cell>
                ))}
              </tr>
            );
          })}

          {metricKeys.map((key) => {
            const rows = zones.map(
              (zone) => zone.breakdown.find((row) => row.key === key)!,
            );
            // `normalized` is already flipped so 1 is good, whichever direction
            // the underlying metric runs — so "best" is always the highest.
            const best = bestOf(
              rows.map((row) => row.normalized),
              "higher",
            );

            return (
              <tr key={key}>
                <Label>{rows[0].label}</Label>
                {rows.map((row, index) => (
                  <Cell
                    key={zones[index].zone.h3}
                    isBest={best !== null && index === best}
                  >
                    {row.formatted}
                  </Cell>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      className="sticky left-0 z-10 border-b border-border-subtle bg-surface px-3 py-2 text-left text-xs font-medium whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function Cell({
  isBest,
  children,
}: {
  isBest: boolean;
  children: React.ReactNode;
}) {
  return (
    <td
      className={cn(
        "border-b border-border-subtle px-3 py-2 tabular-nums whitespace-nowrap",
        isBest && "font-semibold text-positive",
      )}
    >
      <span className="flex items-center gap-1.5">
        {children}
        {isBest ? (
          <Trophy size={11} aria-label="Best of the shortlist" className="shrink-0" />
        ) : null}
      </span>
    </td>
  );
}

/**
 * Index of the winning value, or null when there's no single winner.
 *
 * A tie marks nothing: highlighting two cells as "best" reads as a comparison
 * failure rather than a genuine draw, and there is nothing to decide anyway.
 */
function bestOf(
  values: (number | null)[],
  direction: "higher" | "lower",
): number | null {
  let bestIndex: number | null = null;
  let bestValue: number | null = null;
  let tied = false;

  values.forEach((value, index) => {
    if (value === null) return;
    if (bestValue === null) {
      bestValue = value;
      bestIndex = index;
      return;
    }
    const better = direction === "higher" ? value > bestValue : value < bestValue;
    if (better) {
      bestValue = value;
      bestIndex = index;
      tied = false;
    } else if (value === bestValue) {
      tied = true;
    }
  });

  return tied ? null : bestIndex;
}
