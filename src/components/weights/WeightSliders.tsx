"use client";

import * as Slider from "@radix-ui/react-slider";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/scoring/registry";
import type {
  CommuteAggregation,
  DroppedMetric,
  Household,
} from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * Live weight controls (Tier C).
 *
 * Every change re-scores synchronously in the browser, so these are sliders
 * rather than a form with a "Recalculate" button. That immediacy is the point:
 * the negotiation over whose commute matters more is the real product, and it
 * only works if you can see the map move as you argue.
 */

const AGGREGATIONS: {
  value: CommuteAggregation;
  label: string;
  hint: string;
}[] = [
  { value: "mean", label: "Average", hint: "Optimize the household average" },
  {
    value: "balanced",
    label: "Balanced",
    hint: "60% average, 40% the worst commute",
  },
  { value: "max", label: "Protect worst", hint: "Optimize the worst commute" },
];

export function WeightSliders({
  household,
  droppedMetrics = [],
}: {
  household: Household;
  /**
   * Metrics the engine excluded from this run.
   *
   * Matters for `incomplete-coverage`: the metric applies to the household and
   * its slider reads 60%, but it was dropped because some surviving zone had
   * no value for it. Without saying so, the slider claims an influence the
   * score does not have.
   */
  droppedMetrics?: DroppedMetric[];
}) {
  const setWeight = useHouseholdStore((state) => state.setWeight);
  const resetWeights = useHouseholdStore((state) => state.resetWeights);
  const setAggregation = useHouseholdStore((state) => state.setAggregation);
  const setUnreachablePolicy = useHouseholdStore(
    (state) => state.setUnreachablePolicy,
  );

  /** Arrow keys move the selection, wrapping at both ends, as radios do. */
  const onAggregationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;

    event.preventDefault();
    const current = AGGREGATIONS.findIndex(
      (option) => option.value === household.commuteAggregation,
    );
    const next =
      AGGREGATIONS[
        (current + step + AGGREGATIONS.length) % AGGREGATIONS.length
      ];

    setAggregation(next.value);
    // Selection follows focus in a radio group, so focus has to follow too.
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-aggregation="${next.value}"]`)
      ?.focus();
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            What matters
          </h3>
          <button
            type="button"
            onClick={resetWeights}
            className="touch-target flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <RotateCcw size={13} aria-hidden />
            Reset
          </button>
        </div>

        <div className="space-y-3.5">
          {METRICS.map((metric) => {
            const available = metric.isAvailable?.(household) ?? true;
            const value = household.weights[metric.key] ?? metric.defaultWeight;
            const uncounted = droppedMetrics.some(
              (dropped) =>
                dropped.key === metric.key &&
                dropped.reason === "incomplete-coverage",
            );

            return (
              <div key={metric.key} className={cn(!available && "opacity-45")}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`weight-${metric.key}`}
                    className="text-sm font-medium"
                  >
                    {metric.label}
                  </label>
                  <span className="text-xs tabular-nums text-ink-faint">
                    {available ? `${Math.round(value * 100)}%` : "n/a"}
                  </span>
                </div>

                <Slider.Root
                  id={`weight-${metric.key}`}
                  aria-label={`${metric.label} weight`}
                  className="relative flex h-6 w-full touch-none items-center select-none"
                  value={[value]}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!available}
                  onValueChange={([next]) => setWeight(metric.key, next)}
                >
                  <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-surface-sunken">
                    <Slider.Range className="absolute h-full rounded-full bg-accent" />
                  </Slider.Track>
                  {/* 20px visual thumb, but a 44px hit area on touch — see the
                      `.touch-target` rule in globals.css. */}
                  <Slider.Thumb className="touch-target block h-5 w-5 rounded-full border-2 border-accent bg-surface shadow focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none" />
                </Slider.Root>

                {!available ? (
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {metric.key === "parking"
                      ? "No car — parking is excluded and its weight redistributed."
                      : "Not available for this household."}
                  </p>
                ) : uncounted ? (
                  <p className="mt-0.5 text-[11px] text-caution">
                    Not counted — some matching areas have no data for this, so
                    its weight went to the other metrics.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Whose commute wins
        </h3>

        {/*
          A radio group behaves as one tab stop with arrow keys moving between
          options. Before this all three were separately tabbable and the arrow
          keys did nothing, so it announced itself as a radio group and then
          didn't act like one — which is worse than plain buttons, because the
          role sets an expectation the widget breaks.
        */}
        <div
          role="radiogroup"
          aria-label="Commute aggregation"
          onKeyDown={onAggregationKeyDown}
          className="flex gap-1 rounded-lg bg-surface-sunken p-1"
        >
          {AGGREGATIONS.map((option) => {
            const active = household.commuteAggregation === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                // Roving tabindex: only the checked option is in the tab order.
                tabIndex={active ? 0 : -1}
                data-aggregation={option.value}
                title={option.hint}
                onClick={() => setAggregation(option.value)}
                className={cn(
                  "touch-target flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="mt-1.5 text-[11px] text-ink-faint">
          {
            AGGREGATIONS.find(
              (option) => option.value === household.commuteAggregation,
            )?.hint
          }
        </p>
      </section>

      {/*
        Spec open decision #1, handed to the user instead of resolved by fiat.
        A cell can be unroutable by transit and an ordinary drive away, so
        whether that should delete it or merely cost it points depends on the
        household — and it is the difference between an empty board and a full
        one for anyone working near the metro edge.
      */}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Areas with no route
        </h3>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={household.unreachablePolicy === "penalty"}
            onChange={(event) =>
              setUnreachablePolicy(event.target.checked ? "penalty" : "reject")
            }
            className="touch-target mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Keep them, scored badly
            </span>
            <span className="block text-[11px] leading-relaxed text-ink-faint">
              {household.unreachablePolicy === "penalty"
                ? "Areas nobody can route to stay on the map with a heavy commute penalty."
                : "Areas nobody can route to are excluded entirely."}
            </span>
          </span>
        </label>
      </section>
    </div>
  );
}
