"use client";

import Link from "next/link";
import { AlertTriangle, Car, ShieldCheck } from "lucide-react";
import { useCallback, useMemo } from "react";

import {
  CardListSkeleton,
  ErrorState,
  Skeleton,
} from "@/components/layout/states";
import { useAsync } from "@/hooks/use-async";
import type { Transaction } from "@/lib/data/measured";
import { provider } from "@/lib/data/provider";
import type { Listing } from "@/lib/fixtures/listings";
import { CompareZones } from "@/components/zone/CompareZones";
import { useHydrated, useRanking } from "@/hooks/use-ranking";
import { cn } from "@/lib/cn";
import { useHouseholdStore } from "@/store/household";

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
  const { result, isLoading, error, retry } = useRanking();
  const pinned = useHouseholdStore((state) => state.pinned);
  const clearPins = useHouseholdStore((state) => state.clearPins);

  /**
   * The areas actually being shortlisted.
   *
   * Pinned ones when the household has chosen any, the top few otherwise. A
   * screen called "Shortlist" that ignored what you shortlisted was the odd
   * part; falling back keeps it useful before anyone has pinned anything.
   */
  const pinnedZones = useMemo(
    () =>
      pinned
        .map((h3) => result?.scored.find((zone) => zone.zone.h3 === h3))
        .filter((zone): zone is NonNullable<typeof zone> => zone !== undefined),
    [pinned, result],
  );

  const usingPins = pinnedZones.length > 0;

  const topZones = useMemo(
    () => (usingPins ? pinnedZones : (result?.scored.slice(0, TOP_CELLS) ?? [])),
    [usingPins, pinnedZones, result],
  );

  // Keyed on the cell set rather than the array identity, so a re-rank that
  // leaves the top cells unchanged doesn't rebuild the listings.
  const listingsKey = topZones.map((zone) => zone.zone.h3).join(",");
  const loadListings = useCallback(
    () => provider.getListings(topZones),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingsKey],
  );
  const listings = useAsync<Listing[]>(loadListings, listingsKey);

  /**
   * Real transactions in the shortlisted cells, when a crawl has produced any.
   *
   * Loaded beside the illustrative rows rather than instead of them: they answer
   * different questions. A recorded sale says what this street actually costs;
   * the generated rows show the shape of the comparison for a rental, which is
   * what someone is usually looking for and which no legal source provides.
   */
  const loadTransactions = useCallback(
    () => provider.getTransactions(topZones),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingsKey],
  );
  const transactions = useAsync<Transaction[]>(loadTransactions, listingsKey);
  const recordedSales = transactions.data ?? [];

  const people = result?.scored[0]?.commutes ?? [];

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <ErrorState
          title="Couldn't build your shortlist"
          message={`The area ranking failed to load. ${error.message}`}
          onRetry={retry}
        />
      </div>
    );
  }

  if (!hydrated || isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-8">
          <Skeleton className="h-6 w-40" />
          <div className="mt-2 mb-5">
            <Skeleton className="h-4 w-72" />
          </div>
          <CardListSkeleton count={4} />
        </div>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold lg:text-2xl">Shortlist</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {usingPins
                ? `The ${topZones.length} area${topZones.length === 1 ? "" : "s"} you shortlisted, with exact door-to-door commutes.`
                : `Your ${topZones.length} best-scoring areas. Star areas on the map to choose your own.`}
            </p>
          </div>

          {usingPins ? (
            <button
              type="button"
              onClick={clearPins}
              className="touch-target shrink-0 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium hover:bg-surface-sunken"
            >
              Clear shortlist
            </button>
          ) : null}
        </div>

        {/* The comparison comes before the listings: the areas are the
            decision, and the addresses are only examples of what is in them. */}
        {topZones.length > 1 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              Side by side
            </h2>
            <div className="rounded-xl border border-border-subtle">
              <CompareZones zones={topZones} />
            </div>
          </section>
        ) : null}

        {recordedSales.length > 0 ? (
          <RecordedSales transactions={recordedSales} />
        ) : null}

        <IllustrativeNotice hasRecordedSales={recordedSales.length > 0} />

        {/* Compact: cards. */}
        <ul className="mt-5 space-y-3 lg:hidden">
          {(listings.data ?? []).map((listing) => (
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
                {(listings.data ?? []).map((listing) => (
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
 * Real transactions, in the areas being shortlisted.
 *
 * The one part of this screen that is measured rather than generated. It is
 * kept visually and textually distinct from the rows below because a recorded
 * sale is not a home for rent: the sale-to-rent ratio varies systematically
 * between central and peripheral areas, so quoting one as the other would be a
 * confidently wrong number rather than a missing one.
 *
 * Only appears once `npm run crawl` has produced a transactions file — see
 * `src/lib/data/measured.ts`.
 */
function RecordedSales({ transactions }: { transactions: Transaction[] }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Recorded sales here
        </h2>
        <span className="text-[11px] text-ink-faint">
          {transactions.length.toLocaleString()} from the national open-data
          portal
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Property sales recorded in the shortlisted areas. These are past sale
            transactions, not homes currently available to rent.
          </caption>
          <thead className="bg-surface-raised text-left">
            <tr className="border-b border-border-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Address
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Size
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Sold for
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Per m²
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                When
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((sale) => (
              <tr
                key={sale.id}
                className="border-b border-border-subtle last:border-0"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium">{sale.address}</div>
                  <div className="text-[11px] text-ink-faint">
                    {sale.municipality} · cell {sale.h3.slice(-6)}
                  </div>
                </td>
                <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                  {sale.sizeSqm} m²
                </td>
                <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                  ₪{sale.price.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                  ₪{sale.pricePerSqm.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                  {sale.date || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Past sale transactions at real addresses, not homes for rent. They are
        what the price level for these areas is computed from.
      </p>
    </section>
  );
}

/**
 * Yad2 and Madlan both block automated access, and there may be no legal path
 * to real address-level listings at all. Until that's resolved these rows are
 * generated examples, and saying so plainly is the only honest option — the
 * commute figures are the part that holds regardless.
 */
function IllustrativeNotice({
  hasRecordedSales,
}: {
  hasRecordedSales: boolean;
}) {
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
        {hasRecordedSales
          ? " The recorded sales above are the real ones — but they are sales, not rentals."
          : null}
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
