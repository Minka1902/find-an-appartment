"use client";

import { Check, Copy, Share2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { useHydrated } from "@/hooks/use-ranking";
import { commuteWeight } from "@/lib/scoring/metrics/commute";
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

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  // Safe to read `window` here: the guard above returns during SSR, so this
  // line only ever runs on the client.
  const inviteUrl = `${window.location.origin}/setup?household=${household.id}`;

  const totalPull = household.people.reduce(
    (sum, person) => sum + commuteWeight(person),
    0,
  );

  const share = async () => {
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
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
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
                      role="img"
                      aria-label={`${person.name || "Unnamed"}: ${Math.round(share * 100)} percent of commute weight`}
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
                Send this link and they add their own workplace and limits.
              </p>

              <div className="mt-3 truncate rounded-lg bg-surface-sunken px-3 py-2 font-mono text-[11px] text-ink-muted">
                {inviteUrl || "…"}
              </div>

              <button
                type="button"
                onClick={share}
                className="touch-target mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
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

              <p className="mt-3 border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-ink-faint">
                Sharing isn&apos;t wired to a backend yet — the household lives
                in this browser, so the link currently only opens setup on your
                own device.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
