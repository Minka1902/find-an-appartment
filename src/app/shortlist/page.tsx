"use client";

import Link from "next/link";
import { AlertTriangle, Car, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { provider } from "@/lib/data/provider";
import type { Listing } from "@/lib/fixtures/listings";
import { useHydrated, useRanking } from "@/hooks/use-ranking";
import { cn } from "@/lib/cn";

/**
 * Stage 2 — the shortlist.
 *
 * Only the top cells get address-level treatment, with exact door-to-door
 * routing per listing (§2). Everything above this screen is deliberately
 * cell-level, because the underlying metrics have no address-level resolution.
 *
 * Compact: cards, one listing each. Wide: a table with a commute column per
 * person, which is the comparison people actually want and which cannot fit on
 * a phone without horizontal scrolling.
 */

const TOP_CELLS = 8;

export default function ShortlistPage() {
  const hydrated = useHydrated();
  const { result, isLoading } = useRanking();
  const [listings, setListings] = useState<Listing[]>([]);

  const topZones = useMemo(
    () => result?.scored.slice(0, TOP_CELLS) ?? [],
    [result],
  );

  useEffect(() => {
    let cancelled = false;
    // Always goes through the provider, including for an empty top set, so the
    // state update stays asynchronous.
    provider.getListings(topZones).then((next) => {
      if (!cancelled) setListings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [topZones]);

  const people = result?.scored[0]?.commutes ?? [];

  if (!hydrated || isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Building your shortlist…
      </div>
    );
  }

  if (topZones.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-ink-muted">
          No areas passed your limits yet, so there is nothing to shortlist.
        </p>
        <Link
          href="/setup"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Adjust your constraints
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-8">
        <h1 className="text-xl font-semibold lg:text-2xl">Shortlist</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Addresses in your {topZones.length} best-scoring areas, with exact
          door-to-door commutes.
        </p>

        <IllustrativeNotice />

        {/* Compact: cards. */}
        <ul className="mt-5 space-y-3 lg:hidden">
          {listings.map((listing) => (
            <li key={listing.id}>
              <ListingCard listing={listing} />
            </li>
          ))}
        </ul>

        {/* Wide: a real table, with a column per person. */}
        <div className="mt-5 hidden lg:block">
          <div className="overflow-x-auto rounded-xl border border-border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised text-left">
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Address
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Size
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Monthly
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Features
                  </th>
                  {people.map((person) => (
                    <th
                      key={person.personId}
                      scope="col"
                      className="px-4 py-2.5 font-medium whitespace-nowrap"
                    >
                      {person.name || "Person"}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {listings.map((listing) => (
                  <tr
                    key={listing.id}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{listing.address}</div>
                      <div className="text-[11px] text-ink-faint">
                        Floor {listing.floor} · cell {listing.h3.slice(-6)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {listing.rooms} rm · {listing.sizeSqm} m²
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      ₪{listing.monthlyPrice.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <FeatureChips listing={listing} />
                    </td>
                    {listing.commutes.map((commute) => (
                      <td
                        key={commute.personId}
                        className="px-4 py-2.5 tabular-nums whitespace-nowrap"
                      >
                        {commute.minutes === null
                          ? "—"
                          : `${commute.minutes} min`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Yad2 and Madlan both block automated access, and there may be no legal path
 * to real address-level listings at all. Until that's resolved these rows are
 * generated examples, and saying so plainly is the only honest option — the
 * commute figures are the part that holds regardless.
 */
function IllustrativeNotice() {
  return (
    <div className="mt-4 flex gap-2.5 rounded-lg border border-caution/35 bg-caution/8 p-3">
      <AlertTriangle
        size={16}
        aria-hidden
        className="mt-px shrink-0 text-caution"
      />
      <p className="text-[11px] leading-relaxed text-ink-muted">
        <strong className="font-medium text-ink">
          Example listings, not real ones.
        </strong>{" "}
        Automated access to Israeli listing sites is blocked, so these addresses
        are generated to show the shape of the comparison. The commute times are
        computed the same way they would be for a real address, and the areas
        themselves are ranked on real criteria.
      </p>
    </div>
  );
}

function FeatureChips({ listing }: { listing: Listing }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Chip active={listing.hasSafeRoom} icon={ShieldCheck} label="ממ״ד" />
      <Chip active={listing.hasParking} icon={Car} label="Parking" />
    </div>
  );
}

function Chip({
  active,
  icon: Icon,
  label,
}: {
  active: boolean;
  icon: typeof Car;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        active
          ? "border-positive/35 text-positive"
          : "border-border-subtle text-ink-faint line-through",
      )}
    >
      <Icon size={11} aria-hidden />
      {label}
    </span>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{listing.address}</h2>
          <p className="text-[11px] text-ink-faint">
            {listing.rooms} rooms · {listing.sizeSqm} m² · floor {listing.floor}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            ₪{listing.monthlyPrice.toLocaleString()}
          </div>
          <div className="text-[10px] text-ink-faint">per month</div>
        </div>
      </div>

      <div className="mt-2">
        <FeatureChips listing={listing} />
      </div>

      {/* Commutes as chips rather than a table — a phone-width table of these
          would either scroll sideways or truncate the names. */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
        {listing.commutes.map((commute) => (
          <span
            key={commute.personId}
            className="inline-flex items-baseline gap-1 rounded-md bg-surface-sunken px-2 py-1 text-[11px]"
          >
            <span className="text-ink-muted">
              {commute.name || "Person"}
            </span>
            <span className="font-semibold tabular-nums">
              {commute.minutes === null ? "—" : `${commute.minutes} min`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
