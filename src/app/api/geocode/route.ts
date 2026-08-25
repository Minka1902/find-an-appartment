import { z } from "zod";

import { GUSH_DAN_BBOX } from "@/lib/fixtures/geography";

/**
 * Free-text geocoding, proxied.
 *
 * Server-side so the upstream's usage policy is honoured in one place: a real
 * User-Agent, a bounded result count, a timeout, and a cache. Nominatim in
 * particular blocks browser-origin traffic and rate-limits by UA, so calling it
 * from the client would fail in a way that looks like the feature is broken.
 *
 * **Optional by design.** The spec (§5) banned free-text geocoding because
 * Hebrew addresses transliterate a dozen ways and a guessed coordinate is worse
 * than no coordinate. This route does not overturn that: it is off unless
 * `GEOCODER_URL` is set, the client always shows the built-in address book
 * first, and every geocoded result must be confirmed on a map before it is
 * stored. Where no geocoder is configured or reachable, the pin-drop and
 * paste-coordinates paths still cover any location on earth.
 */

/** Nominatim-compatible base, e.g. https://nominatim.openstreetmap.org */
const GEOCODER_URL = process.env.GEOCODER_URL;

/**
 * Nominatim's policy requires a UA identifying the application. Override it
 * with a contact address before pointing this at the public instance.
 */
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ?? "where-to-live/0.1 (self-hosted)";

const REQUEST_TIMEOUT_MS = 6000;
const MAX_RESULTS = 6;
const CACHE_LIMIT = 200;

/**
 * Upstream shape, validated rather than trusted.
 *
 * `lat`/`lon` arrive as strings, and passing those through unparsed would put
 * a string where the engine expects a number — the exact class of bug the
 * household schema exists to prevent.
 */
const nominatimResult = z.object({
  place_id: z.union([z.number(), z.string()]).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  display_name: z.string().min(1),
  name: z.string().optional(),
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
    })
    .optional(),
});

const nominatimResponse = z.array(nominatimResult);

export interface GeocodeHit {
  id: string;
  label: string;
  city: string;
  location: { lat: number; lng: number };
}

/**
 * A tiny LRU over the process.
 *
 * Autocomplete re-queries on every keystroke, and the same prefixes recur
 * constantly. Without this a single search burns a dozen upstream requests and
 * runs straight into a rate limit. Per-process and lost on restart, which is
 * the right trade for something this cheap to rebuild.
 */
const cache = new Map<string, GeocodeHit[]>();

function cacheGet(key: string): GeocodeHit[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Re-insert to mark as most recently used.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: GeocodeHit[]): void {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
}

function toHit(
  result: z.infer<typeof nominatimResult>,
  index: number,
): GeocodeHit {
  const address = result.address ?? {};
  return {
    id: String(result.place_id ?? `${result.lat},${result.lon}#${index}`),
    label: result.display_name,
    city:
      address.city ?? address.town ?? address.village ?? address.municipality ?? "",
    location: { lat: result.lat, lng: result.lon },
  };
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!GEOCODER_URL) {
    // 503 rather than 404: the endpoint exists, it just has no upstream. The
    // client uses this to switch to "pick it on the map instead" rather than
    // showing an error.
    return Response.json(
      {
        available: false,
        reason:
          "No geocoder configured. Set GEOCODER_URL to enable address search.",
        results: [],
      },
      { status: 503 },
    );
  }

  // Two characters matches nothing useful and still costs an upstream call.
  if (query.length < 3) {
    return Response.json({ available: true, results: [] });
  }

  const cached = cacheGet(query.toLowerCase());
  if (cached) {
    return Response.json({ available: true, results: cached, cached: true });
  }

  const upstream = new URL("/search", GEOCODER_URL);
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("addressdetails", "1");
  upstream.searchParams.set("limit", String(MAX_RESULTS));
  // Bias toward the metro without excluding everything else: someone may work
  // outside the ranked area, and the UI warns about that rather than hiding it.
  upstream.searchParams.set(
    "viewbox",
    [
      GUSH_DAN_BBOX.minLng,
      GUSH_DAN_BBOX.maxLat,
      GUSH_DAN_BBOX.maxLng,
      GUSH_DAN_BBOX.minLat,
    ].join(","),
  );
  upstream.searchParams.set("bounded", "0");
  upstream.searchParams.set("accept-language", "he,en");

  try {
    const response = await fetch(upstream, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return Response.json(
        {
          available: false,
          reason: `Geocoder returned ${response.status}.`,
          results: [],
        },
        { status: 502 },
      );
    }

    const parsed = nominatimResponse.safeParse(await response.json());
    if (!parsed.success) {
      return Response.json(
        {
          available: false,
          reason: "Geocoder returned an unexpected response.",
          results: [],
        },
        { status: 502 },
      );
    }

    const results = parsed.data.map(toHit);
    cacheSet(query.toLowerCase(), results);

    return Response.json({ available: true, results });
  } catch (thrown) {
    // Timeouts and DNS/network failures land here. Blocked egress is the
    // common case in a sandboxed deploy, and it must not read as "no results".
    const isTimeout = thrown instanceof Error && thrown.name === "TimeoutError";
    return Response.json(
      {
        available: false,
        reason: isTimeout
          ? "The geocoder timed out."
          : "The geocoder is unreachable.",
        results: [],
      },
      { status: 504 },
    );
  }
}
