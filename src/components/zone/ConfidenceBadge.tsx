"use client";

import { cn } from "@/lib/cn";
import type { Confidence } from "@/lib/scoring/types";

/**
 * Per-metric data quality (§6).
 *
 * Carrying confidence is not decoration. Parking is published as a real GIS
 * layer by Tel Aviv and almost nowhere else, so without this the UI would
 * present a weak proxy with the same authority as a measurement. It says
 * "Parking: low — limited data coverage here" instead of a confident wrong
 * number.
 *
 * Colour never carries the meaning alone — the level is always spelled out.
 */

const STYLES: Record<Confidence, { label: string; className: string }> = {
  high: {
    label: "high",
    className: "text-positive border-positive/35",
  },
  medium: {
    label: "medium",
    className: "text-caution border-caution/35",
  },
  low: {
    label: "low",
    className: "text-negative border-negative/35",
  },
};

const EXPLANATION: Record<Confidence, string> = {
  high: "Derived from an official, complete dataset.",
  medium: "Derived from a partial or indirect source.",
  low: "Proxy estimate — limited data coverage in this area.",
};

export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  const style = STYLES[confidence];

  return (
    <span
      title={EXPLANATION[confidence]}
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-medium",
        style.className,
        className,
      )}
    >
      {style.label} confidence
    </span>
  );
}

export function confidenceExplanation(confidence: Confidence): string {
  return EXPLANATION[confidence];
}
