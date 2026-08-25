"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One async call, with the three guards every provider call needs.
 *
 * Previously each caller hand-rolled a `cancelled` flag and dropped the
 * `.catch()`, so a failing provider left the screen on its loading state
 * forever with nothing but an unhandled rejection in the console. Loading and
 * permanently-failed looked identical, which is the worst of both.
 *
 * The guards:
 *
 * 1. **Cancellation** — a result arriving after unmount is discarded.
 * 2. **Supersession** — the settled result carries the token it was started
 *    for, so a slow response for an earlier key can never overwrite a newer
 *    one. Keyed on a string rather than the promise, because the caller's `run`
 *    closure has a new identity on every render.
 * 3. **Rejection** — captured into `error` so callers can render a real state.
 *
 * Loading is *derived* from "what has settled ≠ what was asked for" rather than
 * being written at the top of the effect. That keeps the effect free of
 * synchronous state writes (which the React Compiler rules reject, rightly:
 * they cause an extra render pass every time the key changes).
 */

export interface AsyncState<T> {
  /**
   * The last value that resolved, kept across key changes so a refetch shows
   * stale-but-real data instead of flashing an empty screen.
   */
  data: T | null;
  /** Set only when the *current* key failed. */
  error: Error | null;
  /** True while the current key has not settled yet. */
  isLoading: boolean;
  /** Re-runs the current key. */
  retry(): void;
}

interface Settled<T> {
  token: string;
  data: T | null;
  error: Error | null;
}

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

export function useAsync<T>(run: () => Promise<T>, key: string): AsyncState<T> {
  const [attempt, setAttempt] = useState(0);
  // Retrying must re-run an unchanged key, so the attempt count is part of the
  // identity rather than a separate effect dependency.
  const token = `${attempt}::${key}`;

  const [settled, setSettled] = useState<Settled<T>>({
    token: "",
    data: null,
    error: null,
  });

  // Held in a ref so a new closure identity on every render doesn't re-run the
  // effect — `token` is the sole trigger, which is what the tier split needs.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    let cancelled = false;

    runRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ token, data, error: null });
      },
      (thrown: unknown) => {
        if (cancelled) return;
        // Keep the previous data alongside the error: a failed refetch should
        // not blank out a screen that already had something worth showing.
        setSettled((previous) => ({
          token,
          data: previous.data,
          error: toError(thrown),
        }));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [token]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const isCurrent = settled.token === token;

  return {
    data: settled.data,
    error: isCurrent ? settled.error : null,
    isLoading: !isCurrent,
    retry,
  };
}
