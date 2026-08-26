"use client";

import dynamic from "next/dynamic";
import {
  Check,
  Crosshair,
  Globe,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useIsWide, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import {
  formatCoordinates,
  isShortenedMapLink,
  parseCoordinates,
} from "@/lib/coords";
import { provider, type LocationSuggestion } from "@/lib/data/provider";
import { GUSH_DAN_BBOX, GUSH_DAN_CENTER } from "@/lib/fixtures/geography";
import { bboxContains, type LatLng } from "@/lib/geo";

/**
 * Set a location — any location.
 *
 * The original picker served only a 17-row curated table, which meant you
 * could not enter your actual workplace unless it happened to be one of
 * seventeen landmarks. Three routes replace it, in order of how much they can
 * be trusted:
 *
 * 1. **The address book** — curated, exact, instant, offline. Shown first.
 * 2. **A pasted coordinate or map link** — exact, offline, and unambiguous.
 * 3. **Free-text geocoding** — convenient but a guess, and optional: it is off
 *    unless a `GEOCODER_URL` is configured and reachable.
 *
 * §5 banned free-text geocoding because Hebrew addresses transliterate a dozen
 * ways and a wrong guess is indistinguishable from a right one once stored as
 * coordinates. That concern is answered rather than ignored: anything from
 * route 2 or 3 must be confirmed on a map before it is committed, so the user
 * sees *which* Rothschild they picked. Route 1 commits directly — those rows
 * are curated data, not a guess, and adding a confirmation step to them would
 * be friction bought with nothing.
 */

// MapLibre touches `window` at module scope, so it must not be server-rendered.
const LocationPreviewMap = dynamic(
  () =>
    import("./LocationPreviewMap").then((mod) => mod.LocationPreviewMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-surface-sunken" />,
  },
);

const GEOCODE_DEBOUNCE_MS = 350;

export interface LocationPickerProps {
  label: string;
  /** Current label, shown when the field is idle. */
  value: string;
  /** Current point, so "pick on the map" starts where the user left it. */
  location?: LatLng | null;
  onSelect(selection: { label: string; location: LatLng }): void;
  placeholder?: string;
}

/** A keyboard-navigable row. Notes and headers live outside this list. */
type Row =
  | { kind: "coords"; id: string; location: LatLng }
  | { kind: "suggestion"; id: string; suggestion: LocationSuggestion }
  | { kind: "map"; id: string };

export function LocationPicker({
  label,
  value,
  location,
  onSelect,
  placeholder = "Search, or paste a map link",
}: LocationPickerProps) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const isWide = useIsWide();
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");
  // Below this a dropdown leaves roughly two rows visible above the keyboard.
  const hasRoomForDropdown = useMediaQuery("(min-width: 640px)");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const [bookResults, setBookResults] = useState<LocationSuggestion[]>([]);
  /**
   * The last geocode response, tagged with the query it answers.
   *
   * Tagging rather than clearing on every keystroke keeps this out of the
   * effect body: "which results are current" is derived by comparing the tag,
   * so nothing has to be written synchronously when the query changes. It also
   * makes a slow response for an old query harmless.
   */
  const [geocode, setGeocode] = useState<{
    query: string;
    available: boolean;
    reason?: string;
    results: LocationSuggestion[];
  }>({ query: "", available: true, results: [] });

  /** Non-null while a pick is awaiting confirmation on the map. */
  const [pending, setPending] = useState<{
    label: string;
    location: LatLng;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  const parsedCoords = useMemo(() => parseCoordinates(query), [query]);

  // --- The built-in table: instant, always available -----------------------
  useEffect(() => {
    let cancelled = false;
    provider
      .searchAddresses(query)
      .then((next) => {
        if (cancelled) return;
        setBookResults(
          next.map((entry) => ({
            id: `book:${entry.id}`,
            label: entry.label,
            labelHe: entry.labelHe,
            city: entry.city,
            location: entry.location,
            source: "book" as const,
          })),
        );
      })
      .catch(() => {
        // The book is a local array; a failure here means something much
        // stranger is wrong, and the other two routes still work.
        if (!cancelled) setBookResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // --- The geocoder: debounced, optional, never fatal ----------------------
  const trimmedQuery = query.trim();
  // A pasted coordinate is already exact — geocoding it would be a wasted
  // round-trip that could only produce a worse answer.
  const geocodeWanted = trimmedQuery.length >= 3 && parsedCoords === null;

  useEffect(() => {
    if (!geocodeWanted) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      provider
        .geocode(trimmedQuery)
        .then((outcome) => {
          if (cancelled) return;
          setGeocode({
            query: trimmedQuery,
            available: outcome.available,
            reason: outcome.reason,
            results: outcome.results,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setGeocode({
            query: trimmedQuery,
            available: false,
            reason: "Address search is offline.",
            results: [],
          });
        });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [geocodeWanted, trimmedQuery]);

  const geocodeSettled = geocode.query === trimmedQuery;
  const geocodeLoading = geocodeWanted && !geocodeSettled;
  // Memoised so the empty case keeps a stable identity — otherwise a fresh []
  // on every render would re-run the `rows` memo continuously.
  const geocodeResults = useMemo(
    () => (geocodeWanted && geocodeSettled ? geocode.results : []),
    [geocodeWanted, geocodeSettled, geocode.results],
  );

  // --- Close when focus leaves the widget ----------------------------------
  useEffect(() => {
    if (!open || pending) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, pending]);

  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    if (parsedCoords) {
      next.push({ kind: "coords", id: "coords", location: parsedCoords });
    }
    for (const suggestion of bookResults) {
      next.push({ kind: "suggestion", id: suggestion.id, suggestion });
    }
    for (const suggestion of geocodeResults) {
      next.push({ kind: "suggestion", id: suggestion.id, suggestion });
    }
    next.push({ kind: "map", id: "pick-on-map" });
    return next;
  }, [parsedCoords, bookResults, geocodeResults]);

  // Clamped on read rather than corrected in an effect: results stream in
  // asynchronously, and writing state to chase them costs an extra render pass
  // every time a response lands.
  const activeIndex = Math.min(
    rawActiveIndex,
    Math.max(rows.length - 1, 0),
  );

  const commit = useCallback(
    (selection: { label: string; location: LatLng }) => {
      onSelect(selection);
      setQuery("");
      setOpen(false);
      setPending(null);
    },
    [onSelect],
  );

  const openConfirm = useCallback((next: { label: string; location: LatLng }) => {
    setPending(next);
  }, []);

  const activateRow = useCallback(
    (row: Row) => {
      if (row.kind === "coords") {
        openConfirm({
          label: formatCoordinates(row.location),
          location: row.location,
        });
        return;
      }

      if (row.kind === "map") {
        openConfirm({
          label: value || "",
          location: location ?? GUSH_DAN_CENTER,
        });
        return;
      }

      const { suggestion } = row;
      // Curated rows are exact; geocoded ones are a guess and get confirmed.
      if (suggestion.source === "book") {
        commit({ label: suggestion.label, location: suggestion.location });
      } else {
        openConfirm({
          label: suggestion.label,
          location: suggestion.location,
        });
      }
    },
    [commit, openConfirm, value, location],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && rows[activeIndex]) {
      event.preventDefault();
      activateRow(rows[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const rowId = (index: number) => `${listId}-row-${index}`;

  const list = (
    <div>
      {isShortenedMapLink(query) ? (
        <p className="border-b border-border-subtle px-3 py-2.5 text-[11px] leading-relaxed text-caution">
          Shortened map links don&apos;t contain coordinates. Open it in your
          map app first, then copy the full link or the coordinates.
        </p>
      ) : null}

      <ul id={listId} role="listbox" aria-label={label} className="py-1">
        {rows.map((row, index) => {
          const active = index === activeIndex;
          const common = cn(
            "touch-target flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
            active ? "bg-accent-soft" : "hover:bg-surface-sunken",
          );

          if (row.kind === "coords") {
            return (
              <li key={row.id} id={rowId(index)} role="option" aria-selected={active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => activateRow(row)}
                  className={common}
                >
                  <Crosshair size={15} aria-hidden className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      Use {formatCoordinates(row.location)}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      From what you pasted — confirm it on the map
                    </span>
                  </span>
                </button>
              </li>
            );
          }

          if (row.kind === "map") {
            return (
              <li key={row.id} id={rowId(index)} role="option" aria-selected={active}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => activateRow(row)}
                  className={cn(common, "border-t border-border-subtle")}
                >
                  <Navigation size={15} aria-hidden className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      Drop a pin on the map
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      Works for any address, anywhere
                    </span>
                  </span>
                </button>
              </li>
            );
          }

          const { suggestion } = row;
          return (
            <li key={row.id} id={rowId(index)} role="option" aria-selected={active}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => activateRow(row)}
                className={common}
              >
                {suggestion.source === "book" ? (
                  <MapPin size={15} aria-hidden className="shrink-0 text-ink-faint" />
                ) : (
                  <Globe size={15} aria-hidden className="shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {suggestion.label}
                  </span>
                  {suggestion.labelHe ? (
                    <span
                      lang="he"
                      dir="rtl"
                      className="block truncate text-[11px] text-ink-faint"
                    >
                      {suggestion.labelHe}
                    </span>
                  ) : suggestion.city ? (
                    <span className="block truncate text-[11px] text-ink-faint">
                      {suggestion.city}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Status for the optional route, kept out of the listbox so it can't be
          "selected". Silence here would read as "no such address exists". */}
      {query.trim().length >= 3 && !parsedCoords ? (
        <p
          role="status"
          className="border-t border-border-subtle px-3 py-2 text-[11px] leading-relaxed text-ink-faint"
        >
          {geocodeLoading
            ? "Searching…"
            : geocode.available
              ? geocodeResults.length > 0
                ? "Worldwide results — confirm on the map before saving."
                : "No worldwide match. Try a pin or coordinates."
              : `${geocode.reason ?? "Address search is unavailable."} You can still drop a pin or paste coordinates.`}
        </p>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-1 block text-xs font-medium text-ink-muted"
      >
        {label}
      </label>

      <div className="relative">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          // Without this a screen reader announces nothing as the arrow keys
          // move the highlight — the list appears frozen.
          aria-activedescendant={
            open && rows[activeIndex] ? rowId(activeIndex) : undefined
          }
          autoComplete="off"
          value={open ? query : value}
          placeholder={value || placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full rounded-lg border border-border-subtle bg-surface",
            "py-2 pr-8 pl-8 text-sm",
            "focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
          )}
        />
        {value && !open ? (
          <Check
            size={15}
            aria-label="Address set"
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-positive"
          />
        ) : null}
      </div>

      {/*
        One variant at a time, chosen in JS rather than with `hidden sm:block`
        pairs. Rendering both and hiding one with CSS put two elements carrying
        the same `id` in the document, which breaks `aria-controls` and
        `aria-activedescendant` outright — they resolve to whichever comes
        first, which on a wide screen is the hidden copy.

        Branching in JS is safe here specifically because this list only exists
        after a focus event, so there is no pre-hydration frame to get wrong.
      */}
      {open && !pending ? (
        hasRoomForDropdown ? (
          <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border-subtle bg-surface shadow-lg">
            {list}
          </div>
        ) : (
          /* Full screen, so the phone keyboard doesn't bury the results. */
          <div className="fixed inset-0 z-50 flex flex-col bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <input
                type="text"
                autoFocus
                value={query}
                placeholder={placeholder}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                aria-label={label}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target rounded-md px-2 text-sm text-accent"
              >
                Cancel
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
          </div>
        )
      ) : null}

      {pending ? (
        <ConfirmLocation
          title={label}
          pending={pending}
          isDark={isDark}
          isWide={isWide}
          onChange={setPending}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            commit({
              label: pending.label.trim() || formatCoordinates(pending.location),
              location: pending.location,
            })
          }
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The confirmation step.
 *
 * A modal on every width. On a phone there is no room for anything else, and on
 * a desktop a dropdown-sized map is too small to tell two streets apart —
 * which would defeat the entire point of confirming.
 */
function ConfirmLocation({
  title,
  pending,
  isDark,
  isWide,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  pending: { label: string; location: LatLng };
  isDark: boolean;
  isWide: boolean;
  onChange(next: { label: string; location: LatLng }): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const headingId = useId();
  const outsideMetro = !bboxContains(GUSH_DAN_BBOX, pending.location);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cn(
          "flex w-full flex-col overflow-hidden bg-surface",
          "max-h-[92dvh] rounded-t-2xl sm:max-w-lg sm:rounded-2xl",
          "border border-border-subtle shadow-xl",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-sm font-semibold">
              Confirm {title.toLowerCase()}
            </h2>
            <p className="text-[11px] text-ink-muted">
              Drag the pin or tap the map to adjust.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="touch-target -m-1 rounded-lg p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={cn("w-full shrink-0", isWide ? "h-72" : "h-56")}>
          <LocationPreviewMap
            value={pending.location}
            onChange={(next) => onChange({ ...pending, location: next })}
            isDark={isDark}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Label
            </span>
            <input
              type="text"
              value={pending.label}
              onChange={(event) =>
                onChange({ ...pending, label: event.target.value })
              }
              placeholder={formatCoordinates(pending.location)}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            />
          </label>

          <p className="mt-2 font-mono text-[11px] text-ink-faint">
            {formatCoordinates(pending.location)}
          </p>

          {/* An address outside the metro produces a board where every cell is
              unreachable. Saying so here beats an empty map with no cause. */}
          {outsideMetro ? (
            <p className="mt-3 rounded-lg border border-caution/35 bg-caution/8 p-2.5 text-[11px] leading-relaxed text-ink-muted">
              <strong className="font-medium text-ink">
                Outside the Gush Dan metro.
              </strong>{" "}
              Only areas inside the metro are ranked, and travel times are
              measured within it — a target this far out will read as
              unreachable from most cells.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border-subtle px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium hover:bg-surface-sunken"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="touch-target flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Check size={16} aria-hidden />
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
