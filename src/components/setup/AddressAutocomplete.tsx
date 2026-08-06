"use client";

import { Check, MapPin, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { provider } from "@/lib/data/provider";
import type { AddressSuggestion } from "@/lib/fixtures/addresses";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/cn";

/**
 * Address picker backed by an address table, not free-text geocoding.
 *
 * §5: Hebrew addresses have too many spellings and transliteration variants —
 * "Rothschild", "רוטשילד", and a dozen near-misses all mean the same street.
 * Geocoding free text guesses; picking a row from the registry doesn't. The
 * component therefore never yields coordinates the user didn't explicitly
 * select.
 *
 * Compact layout: the list opens as a full-screen overlay, because a dropdown
 * over a phone keyboard leaves about two visible rows.
 */

export interface AddressAutocompleteProps {
  label: string;
  value: string;
  onSelect(selection: { label: string; location: LatLng }): void;
  placeholder?: string;
}

export function AddressAutocomplete({
  label,
  value,
  onSelect,
  placeholder = "Search a street, office or landmark",
}: AddressAutocompleteProps) {
  const inputId = useId();
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    provider.searchAddresses(query).then((next) => {
      if (cancelled) return;
      setResults(next);
      setActiveIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Close when focus or a click leaves the widget entirely.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (suggestion: AddressSuggestion) => {
    onSelect({ label: suggestion.label, location: suggestion.location });
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const list = useMemo(
    () => (
      <ul id={listId} role="listbox" aria-label={label} className="py-1">
        {results.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-muted">
            No match. Try a street or a city name.
          </li>
        ) : (
          results.map((suggestion, index) => (
            <li key={suggestion.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => choose(suggestion)}
                className={cn(
                  "touch-target flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
                  index === activeIndex
                    ? "bg-accent-soft"
                    : "hover:bg-surface-sunken",
                )}
              >
                <MapPin
                  size={15}
                  aria-hidden
                  className="shrink-0 text-ink-faint"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {suggestion.label}
                  </span>
                  <span
                    lang="he"
                    dir="rtl"
                    className="block truncate text-[11px] text-ink-faint"
                  >
                    {suggestion.labelHe}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    ),
    // `choose` is stable enough for this list; results/activeIndex drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, activeIndex, label, listId],
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

      {open ? (
        <>
          {/* Wide: a dropdown. */}
          <div className="absolute top-full right-0 left-0 z-30 mt-1 hidden max-h-72 overflow-y-auto rounded-lg border border-border-subtle bg-surface shadow-lg sm:block">
            {list}
          </div>

          {/* Compact: full screen, so the keyboard doesn't bury the results. */}
          <div className="fixed inset-0 z-50 flex flex-col bg-surface sm:hidden">
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
        </>
      ) : null}
    </div>
  );
}
