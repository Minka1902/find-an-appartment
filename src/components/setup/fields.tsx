"use client";

import { useId, useState } from "react";

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

  /**
   * What the user is currently typing, or null when the field is settled.
   *
   * A plain controlled number input cannot be edited: clearing it to retype
   * yields `""`, and `Number("")` is `0`, which is finite — so the old code
   * committed the minimum the instant you deleted the last digit, and the
   * field snapped back under your cursor. Holding the in-progress text locally
   * lets the field be empty for a keystroke without the household seeing a
   * value nobody chose.
   */
  const [draft, setDraft] = useState<string | null>(null);

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
          value={draft ?? String(value)}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);

            // A number input reports "" for anything it can't parse, including
            // a half-typed "-" and a cleared field. Nothing to commit yet.
            if (raw === "") return;

            const next = Number(raw);
            if (Number.isFinite(next)) {
              onChange(Math.min(max, Math.max(min, next)));
            }
          }}
          // Let go of the draft so the field shows the clamped, committed
          // value — typing 90 into a field capped at 7 should end up reading 7.
          onBlur={() => setDraft(null)}
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

      {/*
        Real checkboxes behind chip labels, not buttons wearing
        `role="checkbox"`. The ARIA role told assistive tech it was a checkbox
        while the element brought none of the behaviour — no Space to toggle,
        no participation in the fieldset, nothing for a forms-mode reader to
        find. A visually-hidden input inside its own `<label>` gets all of that
        from the platform, and the chip is just how it looks.

        Wraps rather than scrolls: four chips fit two-up at 360px.
      */}
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((mode) => {
          const active = value.includes(mode.value);
          return (
            <label
              key={mode.value}
              className={cn(
                "touch-target inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                // `focus-within` puts the ring on the chip, since the input
                // itself is not visible.
                "focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-1",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-subtle text-ink-muted hover:bg-surface-sunken",
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(mode.value)}
                className="sr-only"
              />
              {mode.label}
            </label>
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
