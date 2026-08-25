import type * as maplibregl from "maplibre-gl";

/**
 * The shared raster basemap.
 *
 * Extracted so the choropleth and the location picker's mini-map cannot drift
 * apart — they must agree on tile host, attribution and the dark variant, and
 * previously only the choropleth had any of it.
 */

const CARTO_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors, <a href="https://carto.com/attributions">© CARTO</a>';

export function basemapStyle(isDark: boolean): maplibregl.StyleSpecification {
  const variant = isDark ? "dark_all" : "light_all";

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution: CARTO_ATTRIBUTION,
      },
    },
    layers: [
      // A background under the tiles, so the map still reads as a map if the
      // tile host is unreachable — which is the normal case behind a strict
      // egress policy.
      {
        id: "background",
        type: "background",
        paint: { "background-color": isDark ? "#0d0f12" : "#eef0f3" },
      },
      { id: "basemap", type: "raster", source: "basemap" },
    ],
  };
}
