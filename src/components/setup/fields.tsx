"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";
import type { TravelMode } from "@/lib/scoring/types";

/** Shared form primitives, sized for touch by default. */

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-ink-muted"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type="number"
          // `inputMode` gets the numeric keypad on mobile without losing the
          // spinner on desktop.
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(Math.min(max, Math.max(min, next)));
            }
          }}
          className={cn(
            "w-full rounded-lg border border-border-subtle bg-surface",
            "px-2.5 py-2 text-sm tabular-nums",
            suffix && "pr-10",
            "focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-faint">
            {suffix}
          </span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: "transit", label: "Transit" },
  { value: "drive", label: "Drive" },
  { value: "bike", label: "Bike" },
  { value: "walk", label: "Walk" },
];

export function ModePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TravelMode[];
  onChange(modes: TravelMode[]): void;
}) {
  const toggle = (mode: TravelMode) => {
    const next = value.includes(mode)
      ? value.filter((item) => item !== mode)
      : [...value, mode];
    // Never allow an empty selection — there'd be no way to route at all.
    onChange(next.length > 0 ? next : value);
  };

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-ink-muted">
        {label}
      </legend>

      {/* Wraps rather than scrolls: four chips fit two-up at 360px. */}
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((mode) => {
          const active = value.includes(mode.value);
          return (
            <button
              key={mode.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(mode.value)}
              className={cn(
                "touch-target rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-subtle text-ink-muted hover:bg-surface-sunken",
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg p-2 -mx-2",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-sunken",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-[11px] text-ink-faint">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
