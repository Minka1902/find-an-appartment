"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/layout/states";

/**
 * Route-level error boundary.
 *
 * Wraps every screen inside the root layout, so the nav chrome survives and the
 * user can move to another screen rather than facing a dead tab.
 *
 * Next 16 passes `retry`, not the `reset` of earlier versions: `retry()`
 * re-fetches *and* re-renders the segment inside a Transition, which is what
 * actually recovers from a failed data load. `reset` only clears the error
 * state, so a Server Component failure would immediately throw again.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center">
      <ErrorState
        title="This screen failed to load"
        message={
          // Server Component errors arrive with a generic message and a digest;
          // showing the digest is the only way a user can quote it usefully.
          error.digest
            ? `Something broke while building this page. Reference: ${error.digest}`
            : error.message ||
              "Something broke while building this page. Your household is saved."
        }
        onRetry={retry}
      />
    </div>
  );
}
