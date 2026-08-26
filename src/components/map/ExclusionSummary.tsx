"use client";

import { ChevronDown, Filter } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import {
  explainExclusions,
  reasonLabel,
  type RelaxationSuggestion,
} from "@/lib/scoring/explain";
import type {
  Household,
  RejectionReason,
  ScoringResult,
} from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * Why areas were excluded, and how to get them back.
 *
 * The count on its own ("2,107 excluded") is a dead end: it reports that the
 * search failed without naming which of the user's own constraints did it. That
 * matters most in the case where it is the only thing on screen — an empty map,
 * which reads as "nowhere suits you" rather than "your commute cap is 20
 * minutes".
 *
 * Each suggestion carries an exact count, computed by simulating the change
 * rather than estimating it, and applies with one click.
 */
export function ExclusionSummary({
  result,
  household,
}: {
  result: ScoringResult;
  household: Household;
}) {
  const [open, setOpen] = useState(false);

  const updatePerson = useHouseholdStore((state) => state.updatePerson);
  const setMaxCost = useHouseholdStore((state) => state.setMaxCost);
  const setRequiresStreetParking = useHouseholdStore(
    (state) => state.setRequiresStreetParking,
  );
  const setUnreachablePolicy = useHouseholdStore(
    (state) => state.setUnreachablePolicy,
  );

  const explanation = explainExclusions(result, household);
  if (explanation.total === 0) return null;

  const apply = (suggestion: RelaxationSuggestion) => {
    const { action } = suggestion;
    switch (action.kind) {
      case "person-commute":
        updatePerson(action.personId, {
          maxCommuteMinutes: action.maxCommuteMinutes,
        });
        break;
      case "max-cost":
        setMaxCost(action.maxCost);
        break;
      case "street-parking":
        setRequiresStreetParking(false);
        break;
      case "unreachable-policy":
        setUnreachablePolicy("penalty");
        break;
    }
  };

  const soleReasons = (
    Object.entries(explanation.blockedSolelyBy) as [RejectionReason, number][]
  )
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  // The empty board is the case this exists for, so it opens itself there
  // rather than hiding the explanation behind a disclosure the user has no
  // reason to suspect is there.
  const forcedOpen = result.scored.length === 0;
  const expanded = open || forcedOpen;

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={expanded}
        disabled={forcedOpen}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left",
          !forcedOpen && "hover:bg-surface-sunken",
        )}
      >
        <Filter size={14} aria-hidden className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 text-xs font-medium">
          {explanation.total.toLocaleString()} areas excluded by your limits
        </span>
        {!forcedOpen ? (
          <ChevronDown
            size={15}
            aria-hidden
            className={cn(
              "shrink-0 text-ink-faint transition-transform",
              expanded && "rotate-180",
            )}
          />
        ) : null}
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border-subtle px-3 py-3">
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              What&apos;s blocking them
            </h4>
            <ul className="space-y-1">
              {soleReasons.map(([reason, count]) => (
                <li
                  key={reason}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate text-ink-muted">
                    {reasonLabel(reason)}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-faint">
                    {count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
              Counts areas blocked by that limit <em>alone</em> — the ones
              loosening it would actually bring back.
            </p>
          </div>

          {explanation.suggestions.length > 0 ? (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Loosen something
              </h4>
              <ul className="space-y-1.5">
                {explanation.suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => apply(suggestion)}
                      className="touch-target w-full rounded-lg border border-border-subtle bg-surface px-2.5 py-2 text-left hover:border-accent"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-medium">
                          {suggestion.label}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-accent">
                          +{suggestion.unlocks.toLocaleString()}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-ink-faint">
                        {suggestion.detail}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              No single change would bring areas back — most excluded areas fail
              more than one limit at once.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
