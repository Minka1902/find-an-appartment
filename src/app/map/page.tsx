"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { BottomSheet } from "@/components/layout/BottomSheet";
import { ResponsiveDetailPanel } from "@/components/layout/ResponsiveDetailPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { RankedList } from "@/components/map/RankedList";
import { WeightSliders } from "@/components/weights/WeightSliders";
import { ZoneDetail } from "@/components/zone/ZoneDetail";
import { useIsWide, useMediaQuery } from "@/hooks/use-media-query";
import { useHydrated, useRanking, useZoneDataset } from "@/hooks/use-ranking";
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

  const dataset = useZoneDataset();
  const { result, isLoading } = useRanking();

  const [snapIndex, setSnapIndex] = useState(HALF);
  const [sheetHeight, setSheetHeight] = useState(0);

  const selected = useMemo(
    () => result?.scored.find((zone) => zone.zone.h3 === selectedZone) ?? null,
    [result, selectedZone],
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

  const controls = (
    <div className="space-y-6 pb-4">
      <WeightSliders household={household} />
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
        {isLoading
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
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading your household…
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
        <ZoneMap
          zones={dataset?.zones ?? []}
          scored={result?.scored ?? []}
          selectedH3={selectedZone}
          onSelect={handleSelect}
          isDark={isDark}
          padding={padding}
        />

        <MapLegend
          isDark={isDark}
          excludedCount={result?.rejections.length ?? 0}
          className="absolute top-3 left-3 z-10"
        />

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
        open={selected !== null}
        onClose={() => selectZone(null)}
        title={selected ? `#${selected.rank} · ${selected.zone.municipality}` : ""}
        subtitle={selected ? `Cell ${selected.zone.h3}` : undefined}
      >
        {selected ? <ZoneDetail zone={selected} /> : null}
      </ResponsiveDetailPanel>
    </div>
  );
}
