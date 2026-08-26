"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import { basemapStyle } from "@/components/map/basemap";
import "@/components/map/worker-url";
import type { LatLng } from "@/lib/geo";

/**
 * A small map with one draggable pin.
 *
 * Two jobs, both essential to "set any address":
 *
 * 1. **Confirmation.** §5 objects to free-text geocoding because a guessed
 *    transliteration is indistinguishable from a correct one once it is stored
 *    as coordinates. Showing the guess on a map before committing removes that
 *    objection — the user sees Rothschild, not "a Rothschild".
 * 2. **Direct entry.** Dragging the pin sets any point on earth with no
 *    geocoder at all, which is the only path guaranteed to work behind a strict
 *    egress policy.
 *
 * Deliberately no basemap-failure notice: the pin, the crosshair and the
 * readout are all still accurate over the flat background, and the caller shows
 * the coordinates as text next to it.
 */

export interface LocationPreviewMapProps {
  value: LatLng;
  onChange(next: LatLng): void;
  isDark: boolean;
  /** Set false to render a read-only preview. */
  interactive?: boolean;
}

export function LocationPreviewMap({
  value,
  onChange,
  isDark,
  interactive = true,
}: LocationPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Refs so the map's listeners can be installed once without going stale.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // --- Create once ---------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(isDark),
      center: [value.lng, value.lat],
      zoom: 14,
      attributionControl: { compact: true },
      interactive,
    });

    const marker = new maplibregl.Marker({ draggable: interactive, color: "#2563eb" })
      .setLngLat([value.lng, value.lat])
      .addTo(map);

    if (interactive) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        onChangeRef.current({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        });
      });

      // Tapping is far easier than dragging on a phone, so both work.
      map.on("click", (event) => {
        const { lat, lng } = event.lngLat;
        onChangeRef.current({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        });
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
    }

    // Tiles failing is not fatal here — the pin position is what matters, and
    // it is exact regardless. Logged, not surfaced.
    map.on("error", (event) => {
      console.error("MapLibre (location picker):", event.error?.message ?? event);
    });

    mapRef.current = map;
    markerRef.current = marker;
    setReady(true);

    return () => {
      setReady(false);
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Created once; value and theme changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Follow an externally-changed value ----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !ready) return;

    const current = marker.getLngLat();
    // Guard against the feedback loop: a drag calls `onChange`, the parent
    // re-renders with the new value, and moving the marker back to where it
    // already is would fight the user's next drag.
    if (
      Math.abs(current.lat - value.lat) < 1e-7 &&
      Math.abs(current.lng - value.lng) < 1e-7
    ) {
      return;
    }

    marker.setLngLat([value.lng, value.lat]);
    map.easeTo({ center: [value.lng, value.lat], duration: 350 });
  }, [value, ready]);

  // --- Theme ---------------------------------------------------------------
  const lastThemeRef = useRef(isDark);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lastThemeRef.current === isDark) return;
    lastThemeRef.current = isDark;
    map.setStyle(basemapStyle(isDark));
  }, [isDark]);

  // --- Keep the canvas sized to its container ------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      // The map is a visual confirmation of a value that is also stated as
      // text next to it, so it adds nothing for a screen reader.
      aria-hidden
    />
  );
}
