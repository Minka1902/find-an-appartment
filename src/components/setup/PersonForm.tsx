"use client";

import { Trash2 } from "lucide-react";

import { AddressAutocomplete } from "@/components/setup/AddressAutocomplete";
import { NumberField, ModePicker } from "@/components/setup/fields";
import type { Person, TravelMode } from "@/lib/scoring/types";
import { useHouseholdStore } from "@/store/household";

export function PersonForm({
  person,
  canRemove,
}: {
  person: Person;
  canRemove: boolean;
}) {
  const updatePerson = useHouseholdStore((state) => state.updatePerson);
  const removePerson = useHouseholdStore((state) => state.removePerson);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={person.name}
          placeholder="Name"
          aria-label="Person's name"
          onChange={(event) =>
            updatePerson(person.id, { name: event.target.value })
          }
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-surface-sunken px-2.5 py-1.5 text-sm font-medium focus:border-accent focus:bg-surface focus:outline-none"
        />
        {canRemove ? (
          <button
            type="button"
            onClick={() => removePerson(person.id)}
            aria-label={`Remove ${person.name || "person"}`}
            className="touch-target flex items-center justify-center rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-negative"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <AddressAutocomplete
          label="Workplace"
          value={person.workLabel}
          onSelect={({ label, location }) =>
            updatePerson(person.id, { workLabel: label, work: location })
          }
        />

        <ModePicker
          label="How they travel"
          value={person.modes}
          onChange={(modes: TravelMode[]) => updatePerson(person.id, { modes })}
        />

        {/* Two-up from the smallest breakpoint: these are short numeric fields
            and stacking them wastes a lot of vertical space on a phone. */}
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Days in office"
            value={person.daysInOffice}
            min={0}
            max={7}
            onChange={(daysInOffice) =>
              updatePerson(person.id, { daysInOffice })
            }
            hint="Scales their pull on the ranking"
          />
          <NumberField
            label="Max commute"
            value={person.maxCommuteMinutes}
            min={5}
            max={120}
            step={5}
            suffix="min"
            onChange={(maxCommuteMinutes) =>
              updatePerson(person.id, { maxCommuteMinutes })
            }
            hint="Areas past this are excluded"
          />
        </div>
      </div>
    </div>
  );
}
