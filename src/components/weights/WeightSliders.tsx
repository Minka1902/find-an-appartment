"use client";

import * as Slider from "@radix-ui/react-slider";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/scoring/registry";
import type { CommuteAggregation, Household } from "@/lib/scoring/types";
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

export function WeightSliders({ household }: { household: Household }) {
  const setWeight = useHouseholdStore((state) => state.setWeight);
  const resetWeights = useHouseholdStore((state) => state.resetWeights);
  const setAggregation = useHouseholdStore((state) => state.setAggregation);

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

        <div
          role="radiogroup"
          aria-label="Commute aggregation"
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
    </div>
  );
}
