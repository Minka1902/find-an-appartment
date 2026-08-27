/**
 * The only thing in this app that makes an outbound request to a third party.
 *
 * Everything a crawler owes the sites it visits is here, in one place, so that
 * "we are polite" is a property of the transport rather than a habit each
 * source has to remember:
 *
 *  - robots.txt is fetched once per host and obeyed. A disallowed URL is not
 *    requested — it comes back as a refusal the caller has to handle. There is
 *    deliberately no override: a source that a site declines to be crawled by
 *    is a source this app does not have.
 *  - One request at a time per host, spaced by the published `Crawl-delay` or
 *    a conservative default.
 *  - A user agent that names the application and its purpose, so an operator
 *    seeing it in a log can identify and block it.
 *  - Responses are cached on disk, because the alternative to a cache is
 *    re-fetching someone else's data every time a developer re-runs a command.
 *
 * Node-only: it touches the filesystem. Nothing in the browser bundle imports
 * it — the app reads the crawler's *output*, never runs it.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  crawlDelayMs,
  EMPTY_ROBOTS,
  isAllowed,
  parseRobots,
  type RobotsTxt,
} from "./robots";

/** Identifies the crawler and points an operator at what it is for. */
export const DEFAULT_USER_AGENT =
  "where-to-live-crawler/0.1 (+https://github.com/Minka1902/find-an-appartment; open-data collection)";

/** Used when a host publishes no `Crawl-delay`. Deliberately unhurried. */
export const DEFAULT_CRAWL_DELAY_MS = 1000;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 3;

export type FetchFailure =
  | "disallowed-by-robots"
  | "robots-unavailable"
  | "http-error"
  | "network-error"
  | "timeout";

export type FetchOutcome =
  | { ok: true; body: string; fromCache: boolean; url: string }
  | { ok: false; reason: FetchFailure; detail: string; url: string };

export interface PoliteFetcherOptions {
  userAgent?: string;
  cacheDir?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected in tests; defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so a crawl-delay does not cost real seconds. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The clock, injected alongside `sleep`.
   *
   * Both or neither: spacing requests is measured as "now minus the last
   * request", so a fake sleep against the real `Date.now` leaves the delay
   * short by however long the test itself took — a genuinely flaky assertion
   * about the one property this class exists to guarantee.
   */
  now?: () => number;
  log?: (message: string) => void;
}

interface HostState {
  robots: RobotsTxt | null;
  /** Set when robots.txt itself could not be read and the host is off-limits. */
  blocked: string | null;
  delayMs: number;
  /** Resolves when the last in-flight request to this host has settled. */
  queue: Promise<void>;
  /** Null until the first request. Not 0 — that is a valid reading. */
  lastRequestAt: number | null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PoliteFetcher {
  private readonly userAgent: string;
  private readonly cacheDir: string | null;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  private readonly hosts = new Map<string, HostState>();

  /** Counters for the CLI's end-of-run report. */
  readonly stats = { fetched: 0, cached: 0, refused: 0, failed: 0 };

  constructor(options: PoliteFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.cacheDir = options.cacheDir === undefined ? ".cache/crawler" : options.cacheDir;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
  }

  /**
   * Fetch a URL, or explain why not.
   *
   * Never throws for an ordinary failure: a crawl that walks several sources
   * has to be able to report "this one declined" and carry on with the rest.
   */
  async get(url: string, init?: { headers?: Record<string, string> }): Promise<FetchOutcome> {
    const target = new URL(url);

    const cached = await this.readCache(url);
    if (cached !== null) {
      this.stats.cached++;
      return { ok: true, body: cached, fromCache: true, url };
    }

    const state = await this.hostState(target);
    if (state.blocked) {
      this.stats.refused++;
      return {
        ok: false,
        reason: "robots-unavailable",
        detail: state.blocked,
        url,
      };
    }

    const requestPath = `${target.pathname}${target.search}`;
    if (state.robots && !isAllowed(state.robots, this.userAgent, requestPath)) {
      this.stats.refused++;
      this.log(`refused ${url} — robots.txt disallows ${requestPath}`);
      return {
        ok: false,
        reason: "disallowed-by-robots",
        detail: `${target.host}/robots.txt disallows ${requestPath} for ${this.userAgent}`,
        url,
      };
    }

    const outcome = await this.enqueue(state, () => this.request(url, init));
    if (outcome.ok) {
      this.stats.fetched++;
      await this.writeCache(url, outcome.body);
    } else {
      this.stats.failed++;
    }
    return outcome;
  }

  /** Fetch and parse JSON, or explain why not. */
  async getJson<T>(
    url: string,
    init?: { headers?: Record<string, string> },
  ): Promise<{ ok: true; data: T } | { ok: false; reason: FetchFailure; detail: string }> {
    const outcome = await this.get(url, init);
    if (!outcome.ok) return outcome;

    try {
      return { ok: true, data: JSON.parse(outcome.body) as T };
    } catch (thrown) {
      return {
        ok: false,
        reason: "http-error",
        detail: `${url} did not return JSON: ${(thrown as Error).message}`,
      };
    }
  }

  // -- robots ---------------------------------------------------------------

  private async hostState(target: URL): Promise<HostState> {
    const key = target.origin;
    const existing = this.hosts.get(key);
    if (existing) return existing;

    const state: HostState = {
      robots: null,
      blocked: null,
      delayMs: DEFAULT_CRAWL_DELAY_MS,
      queue: Promise.resolve(),
      lastRequestAt: null,
    };
    this.hosts.set(key, state);

    const outcome = await this.request(`${target.origin}/robots.txt`, undefined, {
      allowNotFound: true,
    });

    if (outcome.ok) {
      state.robots = parseRobots(outcome.body);
      state.delayMs = crawlDelayMs(state.robots, this.userAgent) ?? DEFAULT_CRAWL_DELAY_MS;
    } else if (outcome.reason === "http-error" && /\b4\d\d\b/.test(outcome.detail)) {
      // RFC 9309 §2.3.1.3: no robots.txt means no restrictions.
      state.robots = EMPTY_ROBOTS;
    } else {
      // §2.3.1.4: an unreachable or server-erroring robots.txt means the whole
      // host is off-limits. Guessing "probably fine" is exactly the assumption
      // a crawler is not entitled to make.
      state.blocked = `could not read ${target.origin}/robots.txt (${outcome.detail})`;
    }

    return state;
  }

  // -- scheduling -----------------------------------------------------------

  /** Serialise per host and space requests by the crawl delay. */
  private enqueue(
    state: HostState,
    task: () => Promise<FetchOutcome>,
  ): Promise<FetchOutcome> {
    const run = state.queue.then(async () => {
      if (state.lastRequestAt !== null) {
        const since = this.now() - state.lastRequestAt;
        if (since < state.delayMs) await this.sleep(state.delayMs - since);
      }
      state.lastRequestAt = this.now();
      return task();
    });

    // The queue tracks completion only; a failure must not poison the chain.
    state.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // -- transport ------------------------------------------------------------

  private async request(
    url: string,
    init?: { headers?: Record<string, string> },
    options?: { allowNotFound?: boolean },
  ): Promise<FetchOutcome> {
    let lastDetail = "";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json, text/plain, */*",
            ...init?.headers,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return { ok: true, body: await response.text(), fromCache: false, url };
        }

        lastDetail = `HTTP ${response.status}`;

        // 404 on robots.txt is an answer, not a failure to retry.
        if (options?.allowNotFound && response.status >= 400 && response.status < 500) {
          return { ok: false, reason: "http-error", detail: lastDetail, url };
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === this.maxRetries) {
          return { ok: false, reason: "http-error", detail: lastDetail, url };
        }

        await this.sleep(this.backoffMs(attempt, response.headers.get("Retry-After")));
        continue;
      } catch (thrown) {
        const error = thrown as Error;
        const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
        lastDetail = error.message || error.name;

        if (attempt === this.maxRetries) {
          return {
            ok: false,
            reason: timedOut ? "timeout" : "network-error",
            detail: lastDetail,
            url,
          };
        }
        await this.sleep(this.backoffMs(attempt, null));
      }
    }

    return { ok: false, reason: "network-error", detail: lastDetail, url };
  }

  /** `Retry-After` when the server sent one, exponential backoff otherwise. */
  private backoffMs(attempt: number, retryAfter: string | null): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 120) * 1000;

      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) {
        return Math.min(Math.max(date - this.now(), 0), 120_000);
      }
    }
    return DEFAULT_CRAWL_DELAY_MS * 2 ** attempt;
  }

  // -- cache ----------------------------------------------------------------

  private cachePath(url: string): string | null {
    if (!this.cacheDir) return null;
    const digest = createHash("sha256").update(url).digest("hex").slice(0, 32);
    return path.join(this.cacheDir, `${digest}.txt`);
  }

  private async readCache(url: string): Promise<string | null> {
    const file = this.cachePath(url);
    if (!file) return null;
    try {
      return await readFile(file, "utf8");
    } catch {
      return null;
    }
  }

  private async writeCache(url: string, body: string): Promise<void> {
    const file = this.cachePath(url);
    if (!file) return;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, "utf8");
    } catch (thrown) {
      // A cache that cannot be written is a performance problem, not a crawl
      // failure — the data is already in hand.
      this.log(`cache write failed for ${url}: ${(thrown as Error).message}`);
    }
  }
}
