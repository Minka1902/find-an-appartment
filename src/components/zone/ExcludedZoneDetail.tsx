"use client";

import { Ban, Clock, Car, Coins, RouteOff } from "lucide-react";

import { reasonLabel } from "@/lib/scoring/explain";
import type {
  Rejection,
  RejectionReason,
  Zone,
} from "@/lib/scoring/types";

/**
 * Why one particular area is out.
 *
 * Excluded cells were always clickable — they are in the same fill layer — but
 * selecting one produced an empty panel, because only survivors carry a score.
 * Given that a user clicks a greyed-out cell precisely to ask "why not this
 * one?", answering with nothing was the worst possible response.
 */

const REASON_ICONS: Record<RejectionReason, typeof Clock> = {
  "over-max-commute": Clock,
  "over-budget": Coins,
  "no-parking": Car,
  unreachable: RouteOff,
};

export function ExcludedZoneDetail({
  zone,
  rejection,
}: {
  zone: Zone | null;
  rejection: Rejection;
}) {
  return (
    <div className="space-y-5 pt-1">
      <section className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-raised p-3">
        <Ban size={18} aria-hidden className="mt-px shrink-0 text-ink-faint" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Excluded by your limits</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
            This area is filtered out before scoring, so it has no rank. Hard
            limits run first — otherwise somewhere you would never live could
            stretch the scale for everywhere you would.
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {rejection.reasons.length === 1 ? "The reason" : "The reasons"}
        </h3>

        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {rejection.reasons.map((reason) => {
            const Icon = REASON_ICONS[reason];
            return (
              <li key={reason} className="flex items-start gap-2.5 px-3 py-2.5">
                <Icon
                  size={15}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-ink-faint"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {reasonLabel(reason)}
                  </div>
                  <div className="text-[11px] leading-relaxed text-ink-faint">
                    {describe(reason, rejection)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {rejection.reasons.length > 1 ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            Loosening any one of these on its own would not bring this area
            back — all of them have to pass.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg bg-surface-raised p-3">
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Cell {rejection.h3}
          {zone ? ` · ${zone.municipality} · statistical area ${zone.statAreaId}` : ""}
        </p>
      </section>
    </div>
  );
}

/** The specific numbers, where the rejection carries them. */
function describe(reason: RejectionReason, rejection: Rejection): string {
  switch (reason) {
    case "over-max-commute":
      return rejection.commuteOverruns
        .map(
          (overrun) =>
            `${overrun.name || "Someone"} would travel ${Math.round(overrun.minutes)} min, past their ${overrun.limit} min limit.`,
        )
        .join(" ");

    case "over-budget":
      return rejection.costOverrun === null
        ? "The price level here is over your ceiling."
        : `Price level here is ₪${Math.round(rejection.costOverrun).toLocaleString("en-US")}/m², over your ceiling.`;

    case "no-parking":
      return "Parking a car here overnight isn't realistic, and you required street parking.";

    case "unreachable":
      return "No route was found to at least one workplace within 60 minutes.";
  }
}
