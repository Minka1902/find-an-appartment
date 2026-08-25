"use client";

import { Star } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/cn";
import type { ScoredZone } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

/**
 * The ranked results beside the map.
 *
 * Also the accessible reading of the choropleth: the scale's lighter steps sit
 * below 3:1 against the surface, so this list is the required relief — every
 * value is legible as a number and reachable by keyboard, not only as a colour
 * on a map.
 */
export function RankedList({
  zones,
  selectedH3,
  onSelect,
  limit = 40,
  emptyMessage = "No areas passed your limits. Try raising a commute cap or your budget.",
}: {
  zones: ScoredZone[];
  selectedH3: string | null;
  onSelect(h3: string): void;
  limit?: number;
  emptyMessage?: string;
}) {
  const pinned = useHouseholdStore((state) => state.pinned);
  const togglePin = useHouseholdStore((state) => state.togglePin);
  const listRef = useRef<HTMLOListElement>(null);

  /**
   * Arrow keys move between areas.
   *
   * This list is the accessible reading of the choropleth, so "reachable by
   * keyboard" has to mean more than forty consecutive tab stops to get to the
   * bottom of it. Home/End jump to the ends, matching every other listbox.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLOListElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-zone-row]",
      ) ?? [],
    );
    if (buttons.length === 0) return;

    const current = buttons.findIndex(
      (button) => button === document.activeElement,
    );

    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = current < 0 ? 0 : Math.min(current + 1, buttons.length - 1);
        break;
      case "ArrowUp":
        next = current < 0 ? 0 : Math.max(current - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      default:
        next = buttons.length - 1;
    }

    event.preventDefault();
    buttons[next].focus();
    // Moving the focus also moves the map, so arrowing down the list flies
    // across the metro — the list and the choropleth stay one view.
    onSelect(buttons[next].dataset.zoneRow as string);
  };

  if (zones.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-ink-muted">
        {emptyMessage}
      </p>
    );
  }

  const hidden = zones.length - Math.min(zones.length, limit);

  return (
    <>
    <ol ref={listRef} onKeyDown={onKeyDown} className="space-y-1">
      {zones.slice(0, limit).map((zone) => {
        const active = zone.zone.h3 === selectedH3;
        const topReason = zone.breakdown[0];
        const isPinned = pinned.includes(zone.zone.h3);

        return (
          <li key={zone.zone.h3}>
            {/* The pin is a sibling button, not nested inside the row button:
                a button inside a button is invalid HTML and browsers resolve
                it by dropping one of them. */}
            <div
              className={cn(
                "flex items-center gap-1 rounded-lg pr-1 transition-colors",
                active ? "bg-accent-soft" : "hover:bg-surface-sunken",
              )}
            >
              <button
                type="button"
                data-zone-row={zone.zone.h3}
                onClick={() => onSelect(zone.zone.h3)}
                aria-current={active ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left"
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-ink-faint">
                  {zone.rank}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {zone.zone.municipality}
                  </span>
                  {topReason ? (
                    <span className="block truncate text-[11px] text-ink-faint">
                      Best on {topReason.label.toLowerCase()} ·{" "}
                      {topReason.formatted}
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {Math.round(zone.score)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => togglePin(zone.zone.h3)}
                aria-pressed={isPinned}
                aria-label={`${isPinned ? "Unpin" : "Pin"} ${zone.zone.municipality}, rank ${zone.rank}`}
                className={cn(
                  "touch-target flex shrink-0 items-center justify-center rounded-md p-1.5",
                  isPinned
                    ? "text-accent"
                    : "text-ink-faint hover:text-ink",
                )}
              >
                <Star
                  size={15}
                  aria-hidden
                  fill={isPinned ? "currentColor" : "none"}
                />
              </button>
            </div>
          </li>
        );
      })}
    </ol>

    {/* The list has always stopped at `limit`, silently. With a filter above
        it that reads as "only 40 areas matched", which is a different and
        wrong claim. */}
    {hidden > 0 ? (
      <p className="px-2.5 pt-2 text-[11px] text-ink-faint">
        Showing the top {limit}. {hidden.toLocaleString()} more match — narrow
        the filter or tighten your limits to see them.
      </p>
    ) : null}
    </>
  );
}
