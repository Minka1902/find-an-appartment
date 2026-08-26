"use client";

import { Users, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import {
  decodeHousehold,
  describeHousehold,
  readShareParam,
  SHARE_PARAM,
} from "@/lib/share-link";
import type { Household } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * "Someone shared a household with you — import it?"
 *
 * Asked, never assumed. Following a link would otherwise silently overwrite
 * everything the recipient had set up, and a link can arrive from anywhere:
 * a chat, an old bookmark, a browser restoring yesterday's tabs.
 *
 * The prompt names who is in the incoming household, because "import a
 * household?" is not enough information to answer.
 */
/**
 * Back/forward changes the query string without a reload, so the prompt has to
 * hear about it. `replaceState` from `dismiss` fires nothing, but that path
 * sets state itself, which re-renders and re-reads the snapshot anyway.
 */
function subscribeToNavigation(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

export function HouseholdImportPrompt() {
  const setHousehold = useHouseholdStore((state) => state.setHousehold);
  const clearPins = useHouseholdStore((state) => state.clearPins);

  /*
   * The query string, read as the external store it is.
   *
   * Not `useSearchParams`: every screen here is statically prerendered, and
   * that hook would opt the whole tree into dynamic rendering (or demand a
   * Suspense boundary) for a prompt that is client-only anyway.
   *
   * Not an effect either — writing state from an effect body costs an extra
   * render pass and is what the React Compiler rules flag. `useSyncExternalStore`
   * gives the first client render the right answer directly, with the server
   * snapshot standing in during SSR where there is no `window`.
   */
  const search = useSyncExternalStore(
    subscribeToNavigation,
    () => window.location.search,
    () => "",
  );

  const [dismissed, setDismissed] = useState(false);

  const param = useMemo(() => readShareParam(search), [search]);
  const decoded = useMemo(
    () => (param === null ? null : decodeHousehold(param)),
    [param],
  );

  const incoming: Household | null = dismissed ? null : decoded;
  const invalid = !dismissed && param !== null && decoded === null;

  const dismiss = () => {
    // Take the parameter out of the URL so a refresh doesn't re-prompt, and
    // so the household isn't left sitting in the address bar afterwards.
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState({}, "", url.toString());
    setDismissed(true);
  };

  const accept = () => {
    if (!incoming) return;
    setHousehold(incoming);
    // The old pins point at cells ranked for a different household; keeping
    // them would silently carry one household's shortlist into another.
    clearPins();
    dismiss();
  };

  if (!incoming && !invalid) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:bottom-3 lg:left-1/2 lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:p-0">
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Shared household"
        className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <Users size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />

          <div className="min-w-0 flex-1">
            {invalid ? (
              <>
                <p className="text-sm font-semibold">
                  That shared link didn&apos;t work
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                  It may have been cut short by the app that sent it. Ask for it
                  again, and keep the whole link intact.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  Someone shared a household with you
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                  {describeHousehold(incoming as Household)}. Importing replaces
                  the household on this device.
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="touch-target -m-1 shrink-0 rounded-lg p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {!invalid ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="touch-target rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium hover:bg-surface-sunken"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={accept}
              className="touch-target flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Import it
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
