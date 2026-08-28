/**
 * A robots.txt parser, per RFC 9309.
 *
 * This is the part of the crawler that decides whether a request may be made at
 * all, so it is pure and has no I/O: `fetcher.ts` does the network, and passes
 * the text here. That split is what makes "we obeyed robots.txt" a testable
 * claim rather than a comment.
 *
 * The rules that matter and are easy to get wrong:
 *
 *  - Groups are formed by *consecutive* `User-agent` lines; a rule belongs to
 *    every agent named immediately above it.
 *  - The most specific matching group wins — an exact agent match beats `*` —
 *    and the groups for other agents are then ignored entirely, not merged.
 *  - Within a group the longest matching pattern wins, and `Allow` beats
 *    `Disallow` on an exact tie.
 *  - An empty `Disallow:` means "allow everything", which is the opposite of
 *    what a naive prefix check does with the empty string.
 */

export interface RobotsRule {
  allow: boolean;
  /** The raw path pattern, `*` and `$` included. */
  pattern: string;
}

export interface RobotsGroup {
  /** Lower-cased user-agent tokens this group applies to. */
  agents: string[];
  rules: RobotsRule[];
  /** Seconds, as published. Non-standard but widely honoured. */
  crawlDelay: number | null;
}

export interface RobotsTxt {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export const EMPTY_ROBOTS: RobotsTxt = { groups: [], sitemaps: [] };

/**
 * Parse robots.txt.
 *
 * Unknown directives are ignored rather than rejected: robots.txt is a file
 * anyone can put anything in, and refusing to parse one because of a stray line
 * would fail closed on a site that is perfectly happy to be crawled.
 */
export function parseRobots(text: string): RobotsTxt {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let current: RobotsGroup | null = null;
  // A run of `User-agent` lines with no rules between them names one group.
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    switch (field) {
      case "user-agent": {
        if (!current || !acceptingAgents) {
          current = { agents: [], rules: [], crawlDelay: null };
          groups.push(current);
          acceptingAgents = true;
        }
        current.agents.push(value.toLowerCase());
        break;
      }
      case "allow":
      case "disallow": {
        if (!current) break;
        acceptingAgents = false;
        // `Disallow:` with nothing after it allows everything, so it is not a
        // rule at all. `Allow:` empty is meaningless either way.
        if (value === "") {
          if (field === "disallow") current.rules.push({ allow: true, pattern: "/" });
          break;
        }
        current.rules.push({ allow: field === "allow", pattern: value });
        break;
      }
      case "crawl-delay": {
        if (!current) break;
        acceptingAgents = false;
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
        break;
      }
      case "sitemap": {
        if (value) sitemaps.push(value);
        break;
      }
      default:
        break;
    }
  }

  return { groups, sitemaps };
}

/**
 * The group that applies to `userAgent`.
 *
 * Longest matching agent token wins, so `where-to-live-crawler` picks a group
 * naming `where-to-live` over one naming `*`. Returns null when neither the
 * agent nor `*` appears, which per RFC 9309 means there is nothing to obey.
 */
function groupFor(robots: RobotsTxt, userAgent: string): RobotsGroup | null {
  const agent = userAgent.toLowerCase();

  let best: RobotsGroup | null = null;
  let bestLength = -1;
  let wildcard: RobotsGroup | null = null;

  for (const group of robots.groups) {
    for (const candidate of group.agents) {
      if (candidate === "*") {
        wildcard ??= group;
        continue;
      }
      if (agent.includes(candidate) && candidate.length > bestLength) {
        best = group;
        bestLength = candidate.length;
      }
    }
  }

  return best ?? wildcard;
}

/**
 * Does `pattern` match `path`, and if so how specific was it?
 *
 * Returns the pattern's length so the caller can take the longest match, or
 * null for no match. `*` matches any run of characters and a trailing `$`
 * anchors the end, which is the de-facto standard both major crawlers use.
 */
function matchLength(pattern: string, path: string): number | null {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  const regex = new RegExp(`^${source}${anchored ? "$" : ""}`);
  return regex.test(path) ? pattern.length : null;
}

/**
 * May `userAgent` fetch `path`?
 *
 * `path` is the path plus query string, as it appears in the request line.
 */
export function isAllowed(
  robots: RobotsTxt,
  userAgent: string,
  path: string,
): boolean {
  const group = groupFor(robots, userAgent);
  if (!group) return true;

  let verdict = true;
  let best = -1;

  for (const rule of group.rules) {
    const length = matchLength(rule.pattern, path);
    if (length === null || length < best) continue;
    // On an exact tie the permissive rule wins, so `Allow` must be able to
    // replace a `Disallow` of the same length — hence `<` above, not `<=`.
    if (length === best && !rule.allow) continue;
    best = length;
    verdict = rule.allow;
  }

  return verdict;
}

/** Published crawl-delay for this agent, in milliseconds. */
export function crawlDelayMs(
  robots: RobotsTxt,
  userAgent: string,
): number | null {
  const group = groupFor(robots, userAgent);
  if (!group || group.crawlDelay === null) return null;
  return Math.round(group.crawlDelay * 1000);
}
