"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, Sparkles } from "lucide-react";
import { useState } from "react";

import { AnchorForm } from "@/components/setup/AnchorForm";
import { PersonForm } from "@/components/setup/PersonForm";
import { NumberField, Toggle } from "@/components/setup/fields";
import { useIsWide } from "@/hooks/use-media-query";
import { useHydrated } from "@/hooks/use-ranking";
import { cn } from "@/lib/cn";
import { useHouseholdStore } from "@/store/household";

/**
 * Household setup.
 *
 * Wide: everything on one page in two columns — you can see the whole shape of
 * the household while editing it.
 * Compact: the same three sections as a wizard. A phone can show roughly one
 * card at a time, and a single scrolling page of a dozen fields reads as a form
 * to abandon rather than a few questions to answer.
 */

const STEPS = [
  { id: "people", title: "Who's moving", blurb: "Everyone whose commute counts." },
  { id: "anchors", title: "Who you visit", blurb: "Family and regular places." },
  { id: "home", title: "Cars & budget", blurb: "Constraints on the home itself." },
] as const;

export default function SetupPage() {
  const hydrated = useHydrated();
  const isWide = useIsWide();
  const [step, setStep] = useState(0);

  const household = useHouseholdStore((state) => state.household);
  const addPerson = useHouseholdStore((state) => state.addPerson);
  const addAnchor = useHouseholdStore((state) => state.addAnchor);
  const loadDemo = useHouseholdStore((state) => state.loadDemo);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  const peopleSection = (
    <Section
      title="Who's moving"
      blurb="Everyone whose commute should count. Days in office scales how hard each person pulls the ranking."
    >
      <div className="space-y-3">
        {household.people.map((person) => (
          <PersonForm
            key={person.id}
            person={person}
            canRemove={household.people.length > 1}
          />
        ))}
        <AddButton onClick={addPerson} label="Add a person" />
      </div>
    </Section>
  );

  const anchorsSection = (
    <Section
      title="Who you visit"
      blurb="Parents, siblings, anyone you see regularly. Visit frequency weights how much proximity matters."
    >
      <div className="space-y-3">
        {household.anchors.map((anchor) => (
          <AnchorForm key={anchor.id} anchor={anchor} />
        ))}
        <AddButton onClick={addAnchor} label="Add an anchor" />
        {household.anchors.length === 0 ? (
          <p className="text-xs text-ink-faint">
            Optional — skip if proximity to family isn&apos;t a factor.
          </p>
        ) : null}
      </div>
    </Section>
  );

  const homeSection = <HomeSection />;

  if (isWide) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Header onLoadDemo={loadDemo} />

          {/* Two columns: people is the long one, so it gets its own. */}
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <div>{peopleSection}</div>
            <div className="space-y-8">
              {anchorsSection}
              {homeSection}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              See the map
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sections = [peopleSection, anchorsSection, homeSection];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={loadDemo}
            className="touch-target flex items-center gap-1 rounded-md px-2 text-xs text-accent"
          >
            <Sparkles size={13} aria-hidden />
            Load demo
          </button>
        </div>

        {/* Progress as discrete segments — clearer than a bar at this width. */}
        <div className="flex gap-1" role="presentation">
          {STEPS.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                index <= step
                  ? "bg-accent"
                  : "bg-surface-sunken",
              )}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {sections[step]}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => current - 1)}
          className="touch-target flex items-center gap-1.5 rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>

        {isLast ? (
          <Link
            href="/map"
            className="touch-target flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            See the map
            <ArrowRight size={16} aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep((current) => current + 1)}
            className="touch-target flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white"
          >
            Next
            <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ onLoadDemo }: { onLoadDemo(): void }) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Set up your household</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The ranking updates as soon as you change anything.
        </p>
      </div>
      <button
        type="button"
        onClick={onLoadDemo}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium hover:bg-surface-sunken"
      >
        <Sparkles size={14} aria-hidden />
        Load demo household
      </button>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 mb-3 text-xs text-ink-muted">{blurb}</p>
      {children}
    </section>
  );
}

function AddButton({ onClick, label }: { onClick(): void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="touch-target flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-subtle py-3 text-sm font-medium text-ink-muted hover:border-accent hover:text-accent"
    >
      <Plus size={16} aria-hidden />
      {label}
    </button>
  );
}

function HomeSection() {
  const household = useHouseholdStore((state) => state.household);
  const setCarCount = useHouseholdStore((state) => state.setCarCount);
  const setRequiresStreetParking = useHouseholdStore(
    (state) => state.setRequiresStreetParking,
  );
  const setMaxCost = useHouseholdStore((state) => state.setMaxCost);

  return (
    <Section
      title="Cars & budget"
      blurb="Constraints on the home itself rather than on any one person."
    >
      <div className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Cars owned"
            value={household.carCount}
            min={0}
            max={4}
            onChange={setCarCount}
            hint="0 drops parking entirely"
          />
          <NumberField
            label="Max price level"
            value={household.maxCost ?? 0}
            min={0}
            max={90000}
            step={1000}
            suffix="₪/m²"
            onChange={(value) => setMaxCost(value === 0 ? null : value)}
            hint="0 = no limit"
          />
        </div>

        <Toggle
          label="Must have street parking"
          hint="Excludes areas where parking a car overnight isn't realistic."
          checked={household.requiresStreetParking}
          disabled={household.carCount === 0}
          onChange={setRequiresStreetParking}
        />

        <p className="border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-ink-faint">
          <strong className="font-medium text-ink-muted">
            Price level
          </strong>{" "}
          is aggregated ₪/m² from recorded sale transactions, not rent. The
          sale-to-rent ratio varies systematically between central and
          peripheral areas, so treat it as a relative signal only.
        </p>
      </div>
    </Section>
  );
}
