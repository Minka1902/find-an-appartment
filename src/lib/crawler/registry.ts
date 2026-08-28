/**
 * The source registry.
 *
 * Same shape as the metric registry in `src/lib/scoring/registry.ts`: adding a
 * source is a new module plus one entry here.
 *
 * What is deliberately *not* here is as important as what is. Yad2 and Madlan
 * are the two listings sites the spec names (§12 risk 1); both block automated
 * access and forbid scraping in their terms, so there is no adapter for either
 * and no switch to add one. The crawler's transport refuses a disallowed path
 * outright (`fetcher.ts`), which means a source that a site declines to be
 * crawled by cannot be made to work by writing it — the refusal is the answer.
 */

import { nadlanSource } from "./sources/nadlan";
import { overpassSource } from "./sources/overpass";
import type { Source } from "./types";

export const SOURCES: Source[] = [nadlanSource, overpassSource];

export function getSource(id: string): Source | undefined {
  return SOURCES.find((source) => source.id === id);
}
