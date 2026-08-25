"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { BottomSheet } from "@/components/layout/BottomSheet";
import { ResponsiveDetailPanel } from "@/components/layout/ResponsiveDetailPanel";
import { ErrorState, RankingSkeleton } from "@/components/layout/states";
import { ExclusionSummary } from "@/components/map/ExclusionSummary";
import { MapLegend } from "@/components/map/MapLegend";
import { RankedList } from "@/components/map/RankedList";
import { WeightSliders } from "@/components/weights/WeightSliders";
import { ExcludedZoneDetail } from "@/components/zone/ExcludedZoneDetail";
import { ZoneDetail } from "@/components/zone/ZoneDetail";
import { useIsWide, useMediaQuery } from "@/hooks/use-media-query";
import {
  useHydrated,
  useMetro,
  useRanking,
  useZoneDataset,
} from "@/hooks/use-ranking";
import { bboxContains } from "@/lib/geo";
import { useHouseholdStore } from "@/store/household";

// MapLibre touches `window` at module scope, so it must not be server-rendered.
const ZoneMap = dynamic(
  () => import("@/components/map/ZoneMap").then((mod) => mod.ZoneMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-surface-sunken" />,
  },
);

const SHEET_SNAPS = [0.16, 0.52, 0.94];
const PEEK = 0;
const HALF = 1;

export default function MapPage() {
  const isWide = useIsWide();
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");
  const hydrated = useHydrated();

  const household = useHouseholdStore((state) => state.household);
  const selectedZone = useHouseholdStore((state) => state.selectedZone);
  const selectZone = useHouseholdStore((state) => state.selectZone);
  const pinned = useHouseholdStore((state) => state.pinned);

  const dataset = useZoneDataset();
  const metro = useMetro();
  const { result, isLoading, error, retry, rejectionsByH3 } = useRanking();

  /**
   * People and anchors whose location falls outside the ranked metro.
   *
   * Now that any coordinate can be entered, this is the difference between "no
   * area suits you" and "we can't measure travel to Haifa" — and an empty board
   * with no explanation reads as the former.
   */
  const outsideMetro = useMemo(() => {
    const bbox = metro.data?.bbox;
    if (!bbox) return [];
    return [
      ...household.people
        .filter((person) => person.work && !bboxContains(bbox, person.work))
        .map((person) => person.name || "Someone"),
      ...household.anchors
        .filter((anchor) => anchor.location && !bboxContains(bbox, anchor.location))
        .map((anchor) => anchor.label || "An anchor"),
    ];
  }, [metro.data, household.people, household.anchors]);

  const [snapIndex, setSnapIndex] = useState(HALF);
  const [sheetHeight, setSheetHeight] = useState(0);

  const selected = useMemo(
    () => result?.scored.find((zone) => zone.zone.h3 === selectedZone) ?? null,
    [result, selectedZone],
  );

  /**
   * A selected cell that was filtered out rather than ranked.
   *
   * Excluded cells sit in the same fill layer and have always been clickable,
   * but they carry no score, so selecting one used to open an empty panel —
   * the least useful possible answer to "why not this one?".
   */
  const selectedRejection = useMemo(
    () =>
      selected === null && selectedZone
        ? (rejectionsByH3.get(selectedZone) ?? null)
        : null,
    [selected, selectedZone, rejectionsByH3],
  );

  const selectedZoneGeometry = useMemo(
    () =>
      selectedRejection
        ? (dataset.data?.zones.find((zone) => zone.h3 === selectedRejection.h3) ??
          null)
        : null,
    [selectedRejection, dataset.data],
  );

  // Opening the detail panel on a phone gets the weights sheet out of the way,
  // rather than stacking two sheets on top of each other. Done here in the
  // event rather than in an effect on `selectedZone`, so it stays a single
  // render pass.
  const handleSelect = useCallback(
    (h3: string | null) => {
      selectZone(h3);
      if (h3 && !isWide) setSnapIndex(PEEK);
    },
    [selectZone, isWide],
  );

  // Stable identity: BottomSheet reports height in an effect, so a new function
  // every render would loop.
  const onVisibleHeightChange = useCallback((height: number) => {
    setSheetHeight(height);
  }, []);

  const padding = useMemo(
    () =>
      isWide
        ? { top: 24, right: 24, bottom: 24, left: 24 }
        : { top: 16, right: 16, bottom: Math.round(sheetHeight) + 16, left: 16 },
    [isWide, sheetHeight],
  );

  const controls = error ? (
    <ErrorState
      title="Couldn't rank areas"
      message={`The area data failed to load. ${error.message}`}
      onRetry={retry}
    />
  ) : isLoading ? (
    <RankingSkeleton />
  ) : (
    <div className="space-y-6 pb-4">
      {result ? (
        <ExclusionSummary result={result} household={household} />
      ) : null}

      <WeightSliders
        household={household}
        droppedMetrics={result?.droppedMetrics}
      />
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Best areas
        </h3>
        <RankedList
          zones={result?.scored ?? []}
          selectedH3={selectedZone}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );

  const summary = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-semibold">
        {error
          ? "Ranking unavailable"
          : isLoading
            ? "Ranking areas…"
            : `${(result?.scored.length ?? 0).toLocaleString()} areas match`}
      </span>
      {result && result.rejections.length > 0 ? (
        <span className="text-[11px] text-ink-faint">
          {result.rejections.length.toLocaleString()} excluded
        </span>
      ) : null}
    </div>
  );

  if (!hydrated) {
    return (
      <div className="flex h-full min-h-0">
        <aside className="hidden w-[380px] shrink-0 flex-col border-r border-border-subtle px-5 pt-4 lg:flex">
          <RankingSkeleton />
        </aside>
        <div className="min-h-0 flex-1 bg-surface-sunken" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Wide: persistent controls sidebar. Compact: the bottom sheet below. */}
      {isWide ? (
        <aside className="flex w-[380px] shrink-0 flex-col border-r border-border-subtle bg-surface">
          <div className="border-b border-border-subtle px-5 py-3">
            {summary}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">
            {controls}
          </div>
        </aside>
      ) : null}

      <div className="relative min-h-0 min-w-0 flex-1">
        {metro.data ? (
          <ZoneMap
            metro={metro.data}
            zones={dataset.data?.zones ?? []}
            scored={result?.scored ?? []}
            selectedH3={selectedZone}
            pinnedH3={pinned}
            onSelect={handleSelect}
            isDark={isDark}
            padding={padding}
          />
        ) : (
          <div className="h-full w-full bg-surface-sunken" />
        )}

        <MapLegend
          isDark={isDark}
          excludedCount={result?.rejections.length ?? 0}
          className="absolute top-3 left-3 z-10"
        />

        {/* An out-of-metro workplace makes every cell unreachable. Without
            this the board just empties, which reads as "nowhere suits you". */}
        {outsideMetro.length > 0 ? (
          <div
            role="status"
            className="absolute inset-x-3 top-3 z-10 mx-auto max-w-sm rounded-lg border border-caution/35 bg-surface/95 px-3 py-2 text-[11px] leading-relaxed text-ink-muted shadow-sm backdrop-blur lg:left-auto lg:right-3 lg:mx-0"
          >
            <strong className="font-medium text-ink">
              {outsideMetro.join(", ")}{" "}
              {outsideMetro.length === 1 ? "is" : "are"} outside{" "}
              {metro.data?.name ?? "the metro"}.
            </strong>{" "}
            Travel times are only measured inside it, so those targets read as
            unreachable from most areas.
          </div>
        ) : null}

        {!isWide ? (
          <BottomSheet
            snapPoints={SHEET_SNAPS}
            snapIndex={snapIndex}
            onSnapIndexChange={setSnapIndex}
            onVisibleHeightChange={onVisibleHeightChange}
            header={summary}
          >
            {controls}
          </BottomSheet>
        ) : null}
      </div>

      <ResponsiveDetailPanel
        open={selected !== null || selectedRejection !== null}
        onClose={() => selectZone(null)}
        title={
          selected
            ? `#${selected.rank} · ${selected.zone.municipality}`
            : selectedRejection
              ? (selectedZoneGeometry?.municipality ?? "Excluded area")
              : ""
        }
        subtitle={
          selected
            ? `Cell ${selected.zone.h3}`
            : selectedRejection
              ? "Excluded — not ranked"
              : undefined
        }
      >
        {selected ? (
          <ZoneDetail zone={selected} />
        ) : selectedRejection ? (
          <ExcludedZoneDetail
            zone={selectedZoneGeometry}
            rejection={selectedRejection}
          />
        ) : null}
      </ResponsiveDetailPanel>
    </div>
  );
}
