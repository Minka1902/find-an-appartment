"use client";

import { Check, Copy, Share2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { CardListSkeleton, Skeleton } from "@/components/layout/states";
import { useHydrated } from "@/hooks/use-ranking";
import { commuteWeight } from "@/lib/scoring/metrics/commute";
import { buildShareUrl } from "@/lib/share-link";
import { useHouseholdStore } from "@/store/household";

/**
 * Household sharing.
 *
 * Don't make one person type everyone else's work address. Each member gets a
 * link and enters their own, which is both more accurate and makes the "whose
 * commute matters more" negotiation explicit instead of one person deciding it
 * silently. That negotiation is arguably the real product, so this screen shows
 * each person's actual pull on the ranking rather than hiding it.
 *
 * The invite link is local-only for now — there's no auth yet, so it stands in
 * for the real per-member link.
 */
export default function HouseholdPage() {
  const hydrated = useHydrated();
  const household = useHouseholdStore((state) => state.household);
  const updatePerson = useHouseholdStore((state) => state.updatePerson);

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!hydrated) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8 lg:py-8">
          <Skeleton className="h-7 w-40" />
          <div className="mt-2 mb-6">
            <Skeleton className="h-4 w-64" />
          </div>
          <CardListSkeleton count={2} />
        </div>
      </div>
    );
  }

  // Safe to read `window` here: the guard above returns during SSR, so this
  // line only ever runs on the client.
  //
  // The link carries the household itself rather than an id. There is no
  // backend to look an id up in, so the previous link opened setup on your own
  // device and did nothing else — which the screen had to admit on itself.
  const inviteUrl = buildShareUrl(
    window.location.origin,
    "/setup",
    household,
  );

  const totalPull = household.people.reduce(
    (sum, person) => sum + commuteWeight(person),
    0,
  );

  const share = async () => {
    if (!inviteUrl) return;

    // Use the native share sheet where it exists — on a phone that's the
    // expected way to hand a link to someone.
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Where To Live",
          text: "Add your work address to our household search",
          url: inviteUrl,
        });
        return;
      } catch {
        // Cancelled — fall through to copy.
      }
    }

    // The clipboard rejects in insecure contexts and whenever the permission is
    // denied. Left unguarded this threw past the caller, so the button did
    // nothing at all and never explained why — the link is right there on
    // screen, so the honest fallback is to say "select it and copy".
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8 lg:py-8">
        <h1 className="text-xl font-semibold lg:text-2xl">Household</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Everyone enters their own address and constraints.
        </p>

        {/* Compact: single column. Wide: members beside the invite panel. */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <h2 className="mb-1 text-sm font-semibold">
              Whose commute matters more
            </h2>
            <p className="mb-3 text-xs text-ink-muted">
              A person&apos;s pull is their importance multiplied by days in
              office — someone going in twice a week shouldn&apos;t drag the
              ranking as hard as someone going five.
            </p>

            <ul className="space-y-2">
              {household.people.map((person) => {
                const pull = commuteWeight(person);
                const share = totalPull > 0 ? pull / totalPull : 0;

                return (
                  <li
                    key={person.id}
                    className="rounded-xl border border-border-subtle bg-surface p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {person.name || "Unnamed"}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                        {Math.round(share * 100)}% of commute weight
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                      {person.workLabel || "No work address yet"} ·{" "}
                      {person.daysInOffice} days/week
                    </p>

                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
                      role="progressbar"
                      aria-valuenow={Math.round(share * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${person.name || "Unnamed"}, share of commute weight`}
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] font-medium text-ink-muted">
                        Importance
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.1}
                        value={person.weight}
                        onChange={(event) =>
                          updatePerson(person.id, {
                            weight: Number(event.target.value),
                          })
                        }
                        aria-label={`${person.name || "Unnamed"} importance`}
                        className="touch-target w-full accent-accent"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-xl border border-border-subtle bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <UserPlus size={16} aria-hidden className="text-accent" />
                <h2 className="text-sm font-semibold">Invite a member</h2>
              </div>

              <p className="text-xs text-ink-muted">
                Send this link and they get your whole household — everyone&apos;s
                addresses, limits and weights — to edit on their own device.
              </p>

              <div className="mt-3 truncate rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[11px] text-ink-muted">
                {inviteUrl ?? "Household too large to fit in a link"}
              </div>

              <button
                type="button"
                onClick={share}
                disabled={inviteUrl === null}
                className="touch-target mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {copied ? (
                  <>
                    <Check size={16} aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    {typeof navigator !== "undefined" && "share" in navigator ? (
                      <Share2 size={16} aria-hidden />
                    ) : (
                      <Copy size={16} aria-hidden />
                    )}
                    Share invite link
                  </>
                )}
              </button>

              {copyFailed ? (
                <p role="alert" className="mt-2 text-[11px] text-caution">
                  This browser blocked clipboard access — select the link above
                  and copy it manually.
                </p>
              ) : null}

              <p className="mt-3 border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-ink-faint">
                The link carries the household inside it — there&apos;s no
                account and no server copy. Whoever opens it is asked before
                anything on their device is replaced, and edits they make stay
                on their device until they send a link back.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
