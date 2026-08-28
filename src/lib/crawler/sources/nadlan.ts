/**
 * Real property transactions from data.gov.il.
 *
 * This is the one number in the app that can stop being generated today. The
 * spec's own data table (§4) names nadlan.gov.il Tax Authority transactions as
 * the cost proxy, and the government publishes them through the national CKAN
 * portal under an open licence with a documented API and no anti-bot measures —
 * which is exactly the difference between this and the listings sites §12 risk
 * 1 rules out.
 *
 * It stays a **price level in ₪/m² from sale transactions**, never rent. The
 * sale-to-rent ratio varies systematically between central and peripheral
 * areas, so relabelling it would be actively wrong, and the UI says so.
 *
 * Resources are discovered rather than hardcoded: portal resource ids change
 * when a dataset is republished, and a crawler pinned to a dead id fails in the
 * least informative way possible. Pass `--resource` to pin one deliberately.
 */

import { z } from "zod";

import { bboxContains, type LatLng } from "@/lib/geo";
import { isPlausibleItm, itmToWgs84 } from "../itm";
import type { CrawlContext, Observation, Source, SourceResult } from "../types";

const PORTAL = process.env.DATA_GOV_IL_URL ?? "https://data.gov.il";

/** Overridable so a known-good resource can be pinned without a code change. */
const PINNED_RESOURCE = process.env.NADLAN_RESOURCE_ID ?? null;

const SEARCH_TERMS = ["עסקאות נדל\"ן", "real estate transactions"];

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

// --- CKAN envelopes, validated rather than trusted --------------------------

const resource = z.object({
  id: z.string(),
  name: z.string().optional(),
  datastore_active: z.boolean().optional(),
});

const packageSearch = z.object({
  success: z.boolean(),
  result: z
    .object({
      results: z
        .array(z.object({ title: z.string().optional(), resources: z.array(resource) }))
        .default([]),
    })
    .optional(),
});

const datastoreSearch = z.object({
  success: z.boolean(),
  result: z
    .object({
      records: z.array(z.record(z.string(), z.unknown())).default([]),
      total: z.number().optional(),
    })
    .optional(),
});

// --- Field mapping ----------------------------------------------------------

/**
 * Portal columns are named inconsistently, in two scripts, across republishes.
 * Matching a list of candidates against normalized keys survives that; assuming
 * one spelling does not.
 */
function pick(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(key.trim().toLowerCase().replace(/[\s_-]/g, ""), value);
  }
  for (const candidate of candidates) {
    const hit = normalized.get(candidate.toLowerCase().replace(/[\s_-]/g, ""));
    if (hit !== undefined && hit !== null && hit !== "") return hit;
  }
  return undefined;
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[,\s₪]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const PRICE_FIELDS = ["dealamount", "מחיר", "סכום", "price", "amount", "mchir"];
const AREA_FIELDS = ["dealnature", "שטח", "area", "sqm", "assetarea", "בנוישטח"];
const LAT_FIELDS = ["lat", "latitude", "ywgs84", "קורוחב"];
const LNG_FIELDS = ["lon", "lng", "longitude", "xwgs84", "קואורך"];
const ITM_X_FIELDS = ["x", "itmx", "nz", "מזרח", "coordx"];
const ITM_Y_FIELDS = ["y", "itmy", "צפון", "coordy"];
const DATE_FIELDS = ["dealdate", "תאריך", "date", "dealdatetime"];
const ADDRESS_FIELDS = ["fulladress", "fulladdress", "כתובת", "address", "street"];

/** Coordinates, from whichever pair the resource actually carries. */
function locationOf(row: Record<string, unknown>): LatLng | null {
  const lat = num(pick(row, LAT_FIELDS));
  const lng = num(pick(row, LNG_FIELDS));
  if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { lat, lng };
  }

  const x = num(pick(row, ITM_X_FIELDS));
  const y = num(pick(row, ITM_Y_FIELDS));
  if (x !== null && y !== null && isPlausibleItm(x, y)) {
    return itmToWgs84(x, y);
  }

  return null;
}

async function discoverResources(ctx: CrawlContext): Promise<string[]> {
  if (PINNED_RESOURCE) return [PINNED_RESOURCE];

  const found: string[] = [];
  for (const term of SEARCH_TERMS) {
    const url = `${PORTAL}/api/3/action/package_search?q=${encodeURIComponent(term)}&rows=20`;
    const outcome = await ctx.fetcher.getJson<unknown>(url);

    if (!outcome.ok) {
      ctx.log(`package_search "${term}" failed: ${outcome.reason} — ${outcome.detail}`);
      continue;
    }

    const parsed = packageSearch.safeParse(outcome.data);
    if (!parsed.success || !parsed.data.result) {
      ctx.log(`package_search "${term}" returned an unexpected shape`);
      continue;
    }

    for (const pkg of parsed.data.result.results) {
      for (const item of pkg.resources) {
        // Only a datastore-backed resource can be queried row by row; the rest
        // are file downloads with no filtering.
        if (item.datastore_active && !found.includes(item.id)) found.push(item.id);
      }
    }
  }
  return found;
}

export const nadlanSource: Source = {
  id: "nadlan",
  describe: "Property sale transactions (₪/m²) from the national open-data portal",
  homepage: "https://data.gov.il",
  licence:
    "Israeli government open data, published for reuse through a documented CKAN API",
  metrics: [
    // Sparse: a cell with no recorded sales has an unknown price level, not a
    // price level of zero, and must keep whatever the fixture said.
    // Same units as the fixture — ₪/m² on both sides — so a measured cell can
    // sit beside a generated one without breaking the normalization.
    {
      metric: "cost",
      coverage: "sparse",
      confidence: "high",
      sameUnitsAsFixture: true,
    },
  ],

  async collect(ctx: CrawlContext): Promise<SourceResult> {
    const observations: Observation[] = [];
    const notes: string[] = [];

    const resources = await discoverResources(ctx);
    if (resources.length === 0) {
      notes.push(
        `No datastore-backed transaction resource found on ${PORTAL}. Pin one with --resource <id> if you know it.`,
      );
      return { observations, notes };
    }

    ctx.log(`${resources.length} candidate resource(s)`);

    for (const resourceId of resources) {
      let offset = 0;
      let usable = 0;
      let seen = 0;

      for (let page = 0; page < MAX_PAGES; page++) {
        const limit = ctx.limit > 0 ? Math.min(PAGE_SIZE, ctx.limit - seen) : PAGE_SIZE;
        if (limit <= 0) break;

        const url =
          `${PORTAL}/api/3/action/datastore_search` +
          `?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}&offset=${offset}`;
        const outcome = await ctx.fetcher.getJson<unknown>(url);

        if (!outcome.ok) {
          notes.push(`${resourceId}: ${outcome.reason} — ${outcome.detail}`);
          break;
        }

        const parsed = datastoreSearch.safeParse(outcome.data);
        if (!parsed.success || !parsed.data.result) {
          notes.push(`${resourceId}: unexpected datastore_search response`);
          break;
        }

        const records = parsed.data.result.records;
        if (records.length === 0) break;
        seen += records.length;

        for (const row of records) {
          const location = locationOf(row);
          if (!location || !bboxContains(ctx.bbox, location)) continue;

          const price = num(pick(row, PRICE_FIELDS));
          const area = num(pick(row, AREA_FIELDS));
          // A deal with no area cannot become a ₪/m², and the bounds throw out
          // parking spaces, plots and obvious data entry errors.
          if (price === null || area === null || area < 20 || area > 600) continue;
          if (price < 100_000 || price > 100_000_000) continue;

          const date = String(pick(row, DATE_FIELDS) ?? "").slice(0, 10);
          const address = String(pick(row, ADDRESS_FIELDS) ?? "").trim();

          observations.push({
            metric: "cost",
            location,
            value: price / area,
            note: [address, date].filter(Boolean).join(" · ") || undefined,
            // Kept whole, not just as a number: a transaction happened at a
            // real address on a real date, and that is the only address-level
            // material this app has any legitimate access to.
            record: address ? { address, date, sizeSqm: area, price } : undefined,
          });
          usable++;
        }

        offset += records.length;
        if (records.length < limit) break;
        if (ctx.limit > 0 && seen >= ctx.limit) break;
      }

      ctx.log(`${resourceId}: ${usable} usable transaction(s) inside the metro`);
      if (seen > 0 && usable === 0) {
        notes.push(
          `${resourceId} returned ${seen} rows but none carried usable coordinates and a price per m². It is probably a different dataset, or address-only.`,
        );
      }
    }

    return { observations, notes };
  },
};
