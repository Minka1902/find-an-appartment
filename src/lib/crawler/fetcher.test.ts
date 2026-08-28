import { describe, expect, it } from "vitest";

import { PoliteFetcher } from "./fetcher";

/**
 * A scripted `fetch`.
 *
 * Keyed by URL so a test can say what each endpoint returns, and records the
 * order and timing of calls so politeness itself can be asserted.
 */
function stubFetch(routes: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>) {
  const calls: { url: string; at: number }[] = [];
  let clock = 0;

  const impl = (async (url: string | URL) => {
    const key = String(url);
    calls.push({ url: key, at: clock });
    const route = routes[key] ?? { status: 404, body: "" };
    return new Response(route.body ?? "", {
      status: route.status ?? 200,
      headers: route.headers,
    });
  }) as unknown as typeof fetch;

  return {
    impl,
    calls,
    sleep: async (ms: number) => {
      clock += ms;
    },
    /** What the fetcher measures elapsed time with. */
    clockFn: () => clock,
    /** What the test asserts against. */
    get now() {
      return clock;
    },
  };
}

function fetcher(stub: ReturnType<typeof stubFetch>, extra = {}) {
  return new PoliteFetcher({
    fetchImpl: stub.impl,
    sleep: stub.sleep,
    now: stub.clockFn,
    // Never touch the real filesystem from a unit test.
    cacheDir: null,
    userAgent: "where-to-live-crawler/test",
    ...extra,
  });
}

describe("PoliteFetcher", () => {
  it("reads robots.txt before the first request to a host", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://example.org/data": { body: "hello" },
    });

    const outcome = await fetcher(stub).get("https://example.org/data");

    expect(outcome.ok).toBe(true);
    expect(stub.calls.map((call) => call.url)).toEqual([
      "https://example.org/robots.txt",
      "https://example.org/data",
    ]);
  });

  it("refuses a disallowed path without requesting it", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": {
        body: "User-agent: *\nDisallow: /realestate",
      },
      "https://example.org/realestate/rent": { body: "listings" },
    });

    const outcome = await fetcher(stub).get("https://example.org/realestate/rent");

    expect(outcome).toMatchObject({ ok: false, reason: "disallowed-by-robots" });
    expect(stub.calls.map((call) => call.url)).toEqual([
      "https://example.org/robots.txt",
    ]);
  });

  it("treats a missing robots.txt as no restrictions", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": { status: 404 },
      "https://example.org/data": { body: "hello" },
    });

    expect((await fetcher(stub).get("https://example.org/data")).ok).toBe(true);
  });

  it("treats an erroring robots.txt as the whole host being off-limits", async () => {
    // RFC 9309 §2.3.1.4. "Probably fine" is not an assumption a crawler gets
    // to make on someone else's server.
    const stub = stubFetch({
      "https://example.org/robots.txt": { status: 503 },
      "https://example.org/data": { body: "hello" },
    });

    const outcome = await fetcher(stub, { maxRetries: 0 }).get(
      "https://example.org/data",
    );

    expect(outcome).toMatchObject({ ok: false, reason: "robots-unavailable" });
    expect(stub.calls.some((call) => call.url.endsWith("/data"))).toBe(false);
  });

  it("spaces requests to one host by the published crawl-delay", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": {
        body: "User-agent: *\nCrawl-delay: 3\nDisallow:",
      },
      "https://example.org/a": { body: "a" },
      "https://example.org/b": { body: "b" },
    });

    const client = fetcher(stub);
    await client.get("https://example.org/a");
    const before = stub.now;
    await client.get("https://example.org/b");

    expect(stub.now - before).toBe(3000);
  });

  it("honours Retry-After on a 429", async () => {
    let served = 0;
    const stub = stubFetch({
      "https://example.org/robots.txt": { body: "User-agent: *\nDisallow:" },
    });
    const inner = stub.impl;
    const impl = (async (url: string | URL) => {
      if (String(url).endsWith("/data")) {
        served++;
        if (served === 1) {
          return new Response("", { status: 429, headers: { "Retry-After": "7" } });
        }
        return new Response("ok", { status: 200 });
      }
      return inner(url);
    }) as unknown as typeof fetch;

    const client = fetcher({ ...stub, impl });
    const outcome = await client.get("https://example.org/data");

    expect(outcome).toMatchObject({ ok: true });
    expect(served).toBe(2);
    expect(stub.now).toBe(7000);
  });

  it("gives up with a reason rather than throwing", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://example.org/data": { status: 404 },
    });

    const outcome = await fetcher(stub, { maxRetries: 0 }).get(
      "https://example.org/data",
    );

    expect(outcome).toMatchObject({ ok: false, reason: "http-error" });
  });

  it("counts what it did, for the run report", async () => {
    const stub = stubFetch({
      "https://example.org/robots.txt": { body: "User-agent: *\nDisallow: /no" },
      "https://example.org/yes": { body: "y" },
    });

    const client = fetcher(stub);
    await client.get("https://example.org/yes");
    await client.get("https://example.org/no");

    expect(client.stats).toMatchObject({ fetched: 1, refused: 1 });
  });
});
