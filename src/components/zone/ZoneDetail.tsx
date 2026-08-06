"use client";

import Link from "next/link";

import { anchorDecay } from "@/lib/scoring/metrics/anchors";
import type { ScoredZone } from "@/lib/scoring/types";
import { MetricBreakdown } from "./MetricBreakdown";

/**
 * Everything known about one cell.
 *
 * Leads with the per-person commute table, because that is the number people
 * actually argue about, then the metric breakdown that justifies the score.
 */
export function ZoneDetail({ zone }: { zone: ScoredZone }) {
  return (
    <div className="space-y-6 pt-1">
      <section className="flex items-baseline gap-3">
        <div className="text-3xl font-semibold tabular-nums">
          {Math.round(zone.score)}
        </div>
        <div className="text-sm text-ink-muted">
          match score · ranked #{zone.rank}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Commutes from here
        </h3>

        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {zone.commutes.map((commute) => (
            <li
              key={commute.personId}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {commute.name || "Unnamed"}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {commute.daysInOffice} days/week · limit{" "}
                  {commute.maxCommuteMinutes} min
                </div>
              </div>

              <div className="shrink-0 text-right">
                {commute.minutes === null ? (
                  <span className="text-sm text-ink-faint">
                    no work address
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-semibold tabular-nums">
                      ≤ {commute.minutes} min
                    </span>
                    <div className="text-[10px] text-ink-faint">
                      isochrone band
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-1.5 text-[11px] text-ink-faint">
          Times are the isochrone band containing this cell. Exact door-to-door
          figures are computed per address on the shortlist.
        </p>
      </section>

      {zone.anchorTimes.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Family &amp; anchors
          </h3>

          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {zone.anchorTimes.map((anchor) => (
              <li
                key={anchor.anchorId}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {anchor.label || "Unnamed"}
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    {anchor.visitsPerMonth} visits/month
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {anchor.minutes === null ? (
                    <span className="text-sm text-ink-faint">
                      over 60 min
                    </span>
                  ) : (
                    <>
                      <span className="text-sm font-semibold tabular-nums">
                        ≤ {anchor.minutes} min
                      </span>
                      <div className="text-[10px] text-ink-faint">
                        {Math.round(anchorDecay(anchor.minutes) * 100)}%
                        proximity value
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Why it scored this way
        </h3>
        <MetricBreakdown breakdown={zone.breakdown} />
      </section>

      <section className="rounded-lg bg-surface-raised p-3">
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Bars show where this cell sits against the other areas that passed
          your limits — not an absolute rating. Cell {zone.zone.h3} ·{" "}
          {zone.zone.municipality} · statistical area {zone.zone.statAreaId}.
        </p>
        <Link
          href="/shortlist"
          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
        >
          See addresses in the top areas →
        </Link>
      </section>
    </div>
  );
}
