"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The shared "not the happy path" surfaces.
 *
 * The rule these exist to enforce: **loading and failed must never look the
 * same**. Before this, every screen rendered one grey line of text for both, so
 * a provider that threw was indistinguishable from one that was merely slow —
 * the user waits forever on a screen that will never change.
 */

/** A shimmering placeholder block. Shape it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      // Decorative: the surrounding region announces its own busy state.
      aria-hidden
    />
  );
}

/**
 * A retryable failure.
 *
 * `role="alert"` so it is announced when it replaces a loading state, which is
 * the moment a screen-reader user would otherwise be left waiting silently.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?(): void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertCircle size={22} aria-hidden className="text-negative" />

      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
          {message}
        </p>
      </div>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="touch-target flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-sunken"
        >
          <RotateCcw size={14} aria-hidden />
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** The map screen's loading shape: a sidebar of sliders over a grey map. */
export function RankingSkeleton() {
  return (
    <div
      className="space-y-5 py-1"
      role="status"
      aria-label="Ranking areas, please wait"
    >
      <div className="space-y-3.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="mb-1.5 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-3 w-4" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A stack of card placeholders, for the shortlist and setup screens. */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border-subtle p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
