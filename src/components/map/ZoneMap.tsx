"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Metro } from "@/lib/data/provider";
import type { ScoredZone, Zone } from "@/lib/scoring/types";
import { basemapStyle } from "./basemap";
import "./worker-url";
import { fillColorExpression } from "./score-color";

/**
 * The score choropleth.
 *
 * Two things make this fast enough for a live weight slider:
 *
 * 1. The GeoJSON source is built **once** from the zone geometry and never
 *    replaced. Re-ranking pushes scores through `setFeatureState`, so the
 *    recolour happens on the GPU rather than by re-serializing 2k polygons.
 * 2. Resizing listens to a `ResizeObserver` on the container, not to window
 *    resize — the sidebar and bottom sheet change the map's box without the
 *    window ever changing size.
 */



const SOURCE_ID = "zones";
const FILL_LAYER = "zones-fill";
const OUTLINE_LAYER = "zones-outline";
const SELECTED_LAYER = "zones-selected";

function toFeatureCollection(zones: Zone[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zones.map((zone) => ({
      type: "Feature",
      id: zone.h3,
      properties: { h3: zone.h3, municipality: zone.municipality },
      geometry: { type: "Polygon", coordinates: [zone.boundary] },
    })),
  };
}

export interface ZoneMapProps {
  /**
   * The metro this map covers — its centre and bounds.
   *
   * Passed in rather than imported from the Gush Dan fixture: `getMetro()` has
   * always existed on the provider and was called from nowhere, so the one
   * screen that needed metro bounds reached around the data seam to a
   * hardcoded constant. That is precisely what the seam exists to prevent.
   */
  metro: Metro;
  zones: Zone[];
  scored: ScoredZone[];
  selectedH3: string | null;
  onSelect(h3: string | null): void;
  isDark: boolean;
  /** Space reserved by overlaying chrome, so `fitBounds` doesn't hide cells. */
  padding: { top: number; right: number; bottom: number; left: number };
}

export function ZoneMap({
  metro,
  zones,
  scored,
  selectedH3,
  onSelect,
  isDark,
  padding,
}: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /**
   * Readiness is React state, not an event subscription made at install time.
   * Listening for `load` or `styledata` from a later effect is a race: if the
   * style finished first, the event has already fired and never comes again,
   * and the choropleth silently never appears. State re-runs the install effect
   * exactly once, whichever order they happen in.
   */
  const [mapReady, setMapReady] = useState(false);
  /**
   * Whether the basemap tiles failed. Purely a disclosure flag — the cells do
   * not depend on the basemap, so this changes what we *say*, not what renders.
   */
  const [basemapFailed, setBasemapFailed] = useState(false);
  // Held in a ref so the click handler can be installed once without going
  // stale — reinstalling map listeners on every render is needless churn.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Keys change only when the geometry itself does, which is what should
  // trigger a source rebuild — not a re-score.
  const geometryKey = zones.length;

  const scoreByH3 = useMemo(() => {
    const map = new Map<string, number>();
    for (const zone of scored) map.set(zone.zone.h3, zone.score);
    return map;
  }, [scored]);

  // --- Create the map once -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(isDark),
      center: [metro.center.lng, metro.center.lat],
      zoom: 11,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    if (process.env.NODE_ENV === "development") {
      // Handy for poking at layers and feature-state from the console.
      (window as unknown as { __zoneMap?: MapLibreMap }).__zoneMap = map;
    }

    // `style.load`, not `load`: `load` also waits on the first tiles, so an
    // unreachable basemap host would leave the choropleth permanently
    // uninstalled. Adding sources and layers only needs the style parsed.
    if (map.isStyleLoaded()) setMapReady(true);
    else map.once("style.load", () => setMapReady(true));

    /**
     * MapLibre reports failures through an `error` event and throws nothing.
     * With no handler it installs a console-only default, so a blocked tile
     * host or a failed worker fetch produced an entirely silent grey rectangle
     * — indistinguishable from a map that simply hadn't loaded yet.
     *
     * A raster tile failure is not fatal: the choropleth is a separate GeoJSON
     * source and renders fine over the flat background. So this notes the
     * degradation for the UI to disclose rather than tearing anything down.
     */
    let reported = false;
    const onError = (event: { error?: { message?: string } }) => {
      // One line, not one per tile: a blocked host fails every tile in the
      // viewport, and 30-odd identical lines bury anything else in the console.
      if (!reported) {
        reported = true;
        console.error("MapLibre:", event.error?.message ?? event);
      }
      setBasemapFailed(true);
    };
    map.on("error", onError);

    return () => {
      setMapReady(false);
      map.off("error", onError);
      map.remove();
      mapRef.current = null;
    };
    // Intentionally created once; theme changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Keep the canvas sized to its container ------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Theme -> restyle, then rebuild the zone layers -----------------------
  const lastThemeRef = useRef(isDark);
  useEffect(() => {
    const map = mapRef.current;
    // The map is constructed with the right style already, so only an actual
    // theme *change* needs a restyle.
    if (!map || lastThemeRef.current === isDark) return;
    lastThemeRef.current = isDark;

    // `setStyle` drops custom sources and layers, so re-add them once the new
    // style settles.
    map.setStyle(basemapStyle(isDark));
    whenStyleReady(map, () => {
      addZoneLayers(map, zones, isDark);
      applyScores(map, scoreByH3);
      applySelection(map, selectedH3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // --- Source and layers ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || zones.length === 0) return;

    addZoneLayers(map, zones, isDark);
    applyScores(map, scoreByH3);

    // Fit to the metro the first time real geometry arrives.
    map.fitBounds(
      [
        [metro.bbox.minLng, metro.bbox.minLat],
        [metro.bbox.maxLng, metro.bbox.maxLat],
      ],
      { padding, duration: 0 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, geometryKey]);

  // --- Click to select -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: [FILL_LAYER],
      });
      onSelectRef.current(
        features.length > 0 ? (features[0].properties?.h3 as string) : null,
      );
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", onClick);
    map.on("mouseenter", FILL_LAYER, setPointer);
    map.on("mouseleave", FILL_LAYER, clearPointer);

    return () => {
      map.off("click", onClick);
      map.off("mouseenter", FILL_LAYER, setPointer);
      map.off("mouseleave", FILL_LAYER, clearPointer);
    };
  }, []);

  // --- Tier C: recolour on every re-score ----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyScores(map, scoreByH3);
  }, [scoreByH3]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applySelection(map, selectedH3);
  }, [selectedH3]);

  // --- Keep overlaying chrome out of the way -------------------------------
  useEffect(() => {
    mapRef.current?.setPadding(padding);
  }, [padding]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Disclosed rather than hidden: the cells below are still correct, and
          a user who can see the scores but no streets deserves to know which
          half is missing. */}
      {basemapFailed ? (
        <div
          role="status"
          className="pointer-events-none absolute right-3 bottom-8 left-3 z-10 mx-auto max-w-xs rounded-lg border border-caution/35 bg-surface/95 px-3 py-2 text-center text-[11px] leading-relaxed text-ink-muted shadow-sm backdrop-blur"
        >
          Street map unavailable — the ranked areas below are unaffected.
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Run `fn` once the style can accept sources and layers.
 *
 * `style.load` fires for every style transition, including the one `setStyle`
 * starts, which is what makes this safe to call right after a restyle.
 */
function whenStyleReady(map: MapLibreMap, fn: () => void) {
  if (map.isStyleLoaded()) fn();
  else map.once("style.load", fn);
}

function addZoneLayers(map: MapLibreMap, zones: Zone[], isDark: boolean) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: toFeatureCollection(zones),
      // Lets feature-state be keyed by the H3 index rather than an array index.
      promoteId: "h3",
    });
  }

  if (!map.getLayer(FILL_LAYER)) {
    map.addLayer({
      id: FILL_LAYER,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": fillColorExpression(isDark) as never,
        "fill-opacity": [
          "case",
          ["==", ["coalesce", ["feature-state", "score"], -1], -1],
          0.25,
          0.72,
        ] as never,
      },
    });
  } else {
    map.setPaintProperty(
      FILL_LAYER,
      "fill-color",
      fillColorExpression(isDark) as never,
    );
  }

  if (!map.getLayer(OUTLINE_LAYER)) {
    map.addLayer({
      id: OUTLINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": isDark ? "#0d0f12" : "#ffffff",
        "line-width": 0.4,
        "line-opacity": 0.5,
      },
    });
  }

  // Drawn above the fill so the selected cell reads clearly at any zoom.
  if (!map.getLayer(SELECTED_LAYER)) {
    map.addLayer({
      id: SELECTED_LAYER,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": isDark ? "#ffffff" : "#0b0b0b",
        "line-width": 2.5,
      },
      filter: ["==", ["get", "h3"], ""],
    });
  }
}

/**
 * Push scores into feature-state.
 *
 * This is the hot path — it runs on every slider drag. It touches only state,
 * never the source data, which is what keeps the frame budget intact.
 */
function applyScores(map: MapLibreMap, scores: Map<string, number>) {
  if (!map.getSource(SOURCE_ID)) return;

  map.removeFeatureState({ source: SOURCE_ID });
  for (const [h3, score] of scores) {
    map.setFeatureState({ source: SOURCE_ID, id: h3 }, { score });
  }
}

function applySelection(map: MapLibreMap, selectedH3: string | null) {
  if (!map.getLayer(SELECTED_LAYER)) return;
  map.setFilter(SELECTED_LAYER, ["==", ["get", "h3"], selectedH3 ?? ""]);
}
