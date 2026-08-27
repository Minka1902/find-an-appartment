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

/**
 * CARTO's keyless basemap endpoints, the default.
 *
 * These have been moving behind API keys: when the account or region requires
 * one, CARTO does not fail the request — it serves a tile stamped
 * `API KEY REQUIRED` diagonally across the map, which no `error` handler can
 * detect because it is a perfectly successful 200. The override below is the
 * way out, and the only way out, since nothing in the app can tell a
 * watermarked tile from a real one.
 */
const CARTO_HOSTS = ["a", "b", "c"] as const;

/**
 * Optional tile-source override, e.g. a keyed CARTO template or a self-hosted
 * one. `{variant}` is substituted with the light/dark style name; `{z}/{x}/{y}`
 * are left for MapLibre.
 *
 * Read at module scope rather than per-call: `NEXT_PUBLIC_*` vars are inlined
 * at build time, so there is nothing dynamic to re-read.
 */
const TILE_URL_OVERRIDE = process.env.NEXT_PUBLIC_BASEMAP_URL;
const ATTRIBUTION_OVERRIDE = process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION;

function tileUrls(variant: string): string[] {
  if (TILE_URL_OVERRIDE) {
    return [TILE_URL_OVERRIDE.replaceAll("{variant}", variant)];
  }
  return CARTO_HOSTS.map(
    (host) => `https://${host}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
  );
}

export function basemapStyle(isDark: boolean): maplibregl.StyleSpecification {
  const variant = isDark ? "dark_all" : "light_all";

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: tileUrls(variant),
        tileSize: 256,
        attribution: ATTRIBUTION_OVERRIDE ?? CARTO_ATTRIBUTION,
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
