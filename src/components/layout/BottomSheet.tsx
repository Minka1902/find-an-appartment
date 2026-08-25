"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A draggable bottom sheet with discrete snap points.
 *
 * This is the compact-layout answer to the map screen's core problem: a map and
 * a stack of weight sliders both want the whole viewport. The sheet lets the
 * user hand space back and forth — peek at the top result while panning, or
 * pull up to tune weights — instead of permanently splitting the screen and
 * making both halves too small to use.
 *
 * Snap points are fractions of the container height that remain *visible*.
 */

export interface BottomSheetProps {
  /** Visible fractions, ascending. Defaults to peek / half / full. */
  snapPoints?: number[];
  snapIndex: number;
  onSnapIndexChange(index: number): void;
  /** Always-visible header; doubles as a drag handle. */
  header: React.ReactNode;
  children: React.ReactNode;
  /** Visible height in px, reported on every change so the map can re-pad. */
  onVisibleHeightChange?(height: number): void;
  className?: string;
}

const DEFAULT_SNAP_POINTS = [0.16, 0.52, 0.94];

export function BottomSheet({
  snapPoints = DEFAULT_SNAP_POINTS,
  snapIndex,
  onSnapIndexChange,
  header,
  children,
  onVisibleHeightChange,
  className,
}: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; translate: number } | null>(null);

  // Measure the sheet's own container, not the window: the shell's chrome
  // changes the available height without the window ever resizing.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    setHeight(node.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  const clampedIndex = Math.min(
    Math.max(snapIndex, 0),
    snapPoints.length - 1,
  );
  const restingTranslate = height * (1 - snapPoints[clampedIndex]);
  const translate = dragOffset ?? restingTranslate;
  const visibleHeight = Math.max(height - translate, 0);

  useEffect(() => {
    onVisibleHeightChange?.(visibleHeight);
  }, [visibleHeight, onVisibleHeightChange]);

  const snapNearest = useCallback(
    (currentTranslate: number) => {
      let bestIndex = 0;
      let bestDistance = Infinity;

      snapPoints.forEach((point, index) => {
        const distance = Math.abs(height * (1 - point) - currentTranslate);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      onSnapIndexChange(bestIndex);
    },
    [height, snapPoints, onSnapIndexChange],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    // Ignore secondary buttons so a right-click doesn't start a drag.
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { y: event.clientY, translate: restingTranslate };
    setDragOffset(restingTranslate);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;

    const maxTranslate = height * (1 - snapPoints[0]);
    const minTranslate = height * (1 - snapPoints[snapPoints.length - 1]);
    const next = start.translate + (event.clientY - start.y);

    setDragOffset(Math.min(maxTranslate, Math.max(minTranslate, next)));
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragStart.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (dragOffset !== null) snapNearest(dragOffset);
    dragStart.current = null;
    setDragOffset(null);
  };

  // Keyboard equivalent to dragging — the sheet is a primary control, so it
  // cannot be pointer-only.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSnapIndexChange(Math.min(clampedIndex + 1, snapPoints.length - 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onSnapIndexChange(Math.max(clampedIndex - 1, 0));
    }
  };

  const isDragging = dragOffset !== null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <div
        className={cn(
          "pointer-events-auto absolute inset-x-0 top-0 flex h-full flex-col",
          "rounded-t-2xl border-t border-border-subtle bg-surface",
          "shadow-[0_-8px_28px_rgba(0,0,0,0.16)]",
          !isDragging && "transition-transform duration-200 ease-out",
          className,
        )}
        style={{ transform: `translateY(${translate}px)` }}
      >
        <div
          role="slider"
      aria-orientation="vertical"
          tabIndex={0}
          aria-label="Panel height"
          aria-valuemin={1}
          aria-valuemax={snapPoints.length}
          aria-valuenow={clampedIndex + 1}
          aria-valuetext={["Peek", "Half open", "Fully open"][clampedIndex]}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="shrink-0 cursor-grab touch-none select-none px-4 pt-2 pb-1 active:cursor-grabbing"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-subtle" />
          {header}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
