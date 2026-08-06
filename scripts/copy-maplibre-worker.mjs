/**
 * Copy MapLibre's worker bundle into `public/maplibre/`.
 *
 * maplibre-gl 6 spawns its worker with `new Worker(new URL(...), {type:"module"})`.
 * Next's bundler doesn't rewrite that URL, so the worker ends up requesting the
 * *page* instead of the worker script, parses HTML as JavaScript, and dies. The
 * visible symptom is subtle and easy to misread: raster tiles still render, but
 * every GeoJSON source stays permanently unloaded, so the choropleth never
 * appears and no error is logged.
 *
 * Serving the real worker from a stable public URL and calling
 * `setWorkerUrl()` sidesteps the bundler entirely. This script runs on
 * `prebuild`/`predev` so the copy can never drift from the installed version.
 */

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

// The worker imports the shared chunk by relative path, so both must sit
// together in the destination directory.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(to, { recursive: true });

for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
}

const { version } = JSON.parse(
  await readFile(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"),
);

console.log(`Copied maplibre-gl ${version} worker to public/maplibre/`);
