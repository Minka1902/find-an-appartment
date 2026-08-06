"use client";

import { Trash2 } from "lucide-react";

import { AddressAutocomplete } from "@/components/setup/AddressAutocomplete";
import { ModePicker, NumberField } from "@/components/setup/fields";
import type { Anchor, TravelMode } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

export function AnchorForm({ anchor }: { anchor: Anchor }) {
  const updateAnchor = useHouseholdStore((state) => state.updateAnchor);
  const removeAnchor = useHouseholdStore((state) => state.removeAnchor);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={anchor.label}
          placeholder="Who — e.g. Mum & Dad"
          aria-label="Anchor label"
          onChange={(event) =>
            updateAnchor(anchor.id, { label: event.target.value })
          }
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-sunken px-2.5 py-1.5 text-sm font-medium focus:border-accent focus:bg-surface focus:outline-none"
        />
        <button
          type="button"
          onClick={() => removeAnchor(anchor.id)}
          aria-label={`Remove ${anchor.label || "anchor"}`}
          className="touch-target flex items-center justify-center rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-negative"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      <div className="space-y-3">
        <AddressAutocomplete
          label="Where they live"
          value={anchor.locationLabel}
          onSelect={({ label, location }) =>
            updateAnchor(anchor.id, { locationLabel: label, location })
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Visits per month"
            value={anchor.visitsPerMonth}
            min={0}
            max={31}
            onChange={(visitsPerMonth) =>
              updateAnchor(anchor.id, { visitsPerMonth })
            }
            hint="Weights this anchor"
          />
          <div className="self-end">
            <ModePicker
              label="Travel"
              value={anchor.modes}
              onChange={(modes: TravelMode[]) =>
                updateAnchor(anchor.id, { modes })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
