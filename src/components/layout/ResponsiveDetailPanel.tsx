"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";

import { useIsWide } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";

/**
 * One panel, two shapes.
 *
 * Wide: a right-hand column beside the map, which stays interactive — you can
 * keep panning while comparing cells.
 * Compact: a full-height panel over the map, dismissible by swiping down or
 * pressing Escape, because there is no room to show both at once.
 */

export interface ResponsiveDetailPanelProps {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const SWIPE_DISMISS_PX = 90;

export function ResponsiveDetailPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
}: ResponsiveDetailPanelProps) {
  const isWide = useIsWide();

  if (isWide) {
    if (!open) return null;

    return (
      <aside
        aria-label={title}
        className={cn(
          "flex w-[420px] shrink-0 flex-col border-l border-border-subtle",
          "bg-surface",
        )}
      >
        <PanelHeader title={title} subtitle={subtitle} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {children}
        </div>
      </aside>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col",
            "rounded-t-2xl border-t border-border-subtle bg-surface",
            "shadow-[0_-8px_28px_rgba(0,0,0,0.24)] focus:outline-none",
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <SwipeToDismiss onDismiss={onClose}>
            <PanelHeader title={title} subtitle={subtitle} onClose={onClose} />
          </SwipeToDismiss>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose(): void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3 lg:pt-5">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="truncate text-xs text-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        className="touch-target -m-1 flex items-center justify-center rounded-lg p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}

/** Drag the header down far enough and the panel closes. */
function SwipeToDismiss({
  onDismiss,
  children,
}: {
  onDismiss(): void;
  children: React.ReactNode;
}) {
  // `startY` is state, not a ref, because the render reads it to decide whether
  // to animate — snapping back should ease, following a finger should not.
  const [startY, setStartY] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  return (
    <div
      className="shrink-0 touch-none select-none"
      style={{
        transform: `translateY(${offset}px)`,
        transition: startY === null ? "transform 150ms ease-out" : undefined,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setStartY(event.clientY);
      }}
      onPointerMove={(event) => {
        if (startY === null) return;
        setOffset(Math.max(0, event.clientY - startY));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (offset > SWIPE_DISMISS_PX) onDismiss();
        setStartY(null);
        setOffset(0);
      }}
    >
      <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-border-subtle" />
      {children}
    </div>
  );
}
