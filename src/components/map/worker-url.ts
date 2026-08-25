import * as maplibregl from "maplibre-gl";

/**
 * Point MapLibre at a worker served from `public/` rather than the one its own
 * `new Worker(new URL(…))` call resolves to.
 *
 * Next's bundler leaves that URL alone, so the worker fetches the current page
 * and tries to parse HTML as JavaScript. Nothing throws — raster tiles keep
 * working — but every GeoJSON source stays unloaded forever, which reads as
 * "the choropleth just doesn't render".
 *
 * `scripts/copy-maplibre-worker.mjs` puts the files there on prebuild/predev.
 *
 * Lives in its own module so that *every* map component gets it by importing
 * one thing. A second map that forgot this line would fail in exactly the same
 * silent way, and the failure looks nothing like its cause.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export {};
