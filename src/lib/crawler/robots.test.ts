import { describe, expect, it } from "vitest";

import { crawlDelayMs, isAllowed, parseRobots } from "./robots";

const UA = "where-to-live-crawler";

describe("parseRobots", () => {
  it("groups rules under the consecutive user-agent lines above them", () => {
    const robots = parseRobots(`
      User-agent: alpha
      User-agent: beta
      Disallow: /private

      User-agent: *
      Disallow: /
    `);

    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[0].agents).toEqual(["alpha", "beta"]);
    expect(robots.groups[1].agents).toEqual(["*"]);
  });

  it("collects sitemaps, which are not tied to a group", () => {
    const robots = parseRobots(
      "Sitemap: https://example.org/sitemap.xml\nUser-agent: *\nDisallow:",
    );
    expect(robots.sitemaps).toEqual(["https://example.org/sitemap.xml"]);
  });

  it("ignores comments and unknown directives", () => {
    const robots = parseRobots(
      "# hello\nUser-agent: * # everyone\nDisallow: /x\nHost: example.org",
    );
    expect(robots.groups[0].rules).toEqual([{ allow: false, pattern: "/x" }]);
  });
});

describe("isAllowed", () => {
  it("allows everything when there is no matching group", () => {
    const robots = parseRobots("User-agent: googlebot\nDisallow: /");
    expect(isAllowed(robots, UA, "/anything")).toBe(true);
  });

  it("obeys the wildcard group when the agent is not named", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /realestate");
    expect(isAllowed(robots, UA, "/realestate/rent")).toBe(false);
    expect(isAllowed(robots, UA, "/about")).toBe(true);
  });

  it("prefers a group naming the agent over the wildcard, and does not merge them", () => {
    const robots = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: where-to-live\nDisallow: /admin",
    );
    // The wildcard's blanket Disallow must not leak into the specific group.
    expect(isAllowed(robots, UA, "/data")).toBe(true);
    expect(isAllowed(robots, UA, "/admin")).toBe(false);
  });

  it("takes the longest matching pattern, not the first", () => {
    const robots = parseRobots(
      "User-agent: *\nDisallow: /data\nAllow: /data/public",
    );
    expect(isAllowed(robots, UA, "/data/private")).toBe(false);
    expect(isAllowed(robots, UA, "/data/public/deals.json")).toBe(true);
  });

  it("lets Allow win an exact-length tie", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /x\nAllow: /x");
    expect(isAllowed(robots, UA, "/x")).toBe(true);
  });

  it("reads an empty Disallow as allowing everything", () => {
    // The trap: treating "" as a prefix would match every path and ban the site.
    const robots = parseRobots("User-agent: *\nDisallow:");
    expect(isAllowed(robots, UA, "/anything")).toBe(true);
  });

  it("honours * and $ in patterns", () => {
    const robots = parseRobots(
      "User-agent: *\nDisallow: /*.pdf$\nDisallow: /a/*/secret",
    );
    expect(isAllowed(robots, UA, "/reports/q1.pdf")).toBe(false);
    expect(isAllowed(robots, UA, "/reports/q1.pdf?download=1")).toBe(true);
    expect(isAllowed(robots, UA, "/a/b/secret")).toBe(false);
    expect(isAllowed(robots, UA, "/a/b/public")).toBe(true);
  });

  it("does not let a regex metacharacter in a pattern escape", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /a.b");
    expect(isAllowed(robots, UA, "/axb")).toBe(true);
    expect(isAllowed(robots, UA, "/a.b")).toBe(false);
  });
});

describe("crawlDelayMs", () => {
  it("reads the delay from the group that applies", () => {
    const robots = parseRobots(
      "User-agent: *\nCrawl-delay: 10\n\nUser-agent: where-to-live\nCrawl-delay: 2",
    );
    expect(crawlDelayMs(robots, UA)).toBe(2000);
    expect(crawlDelayMs(robots, "some-other-bot")).toBe(10000);
  });

  it("is null when none is published", () => {
    expect(crawlDelayMs(parseRobots("User-agent: *\nDisallow:"), UA)).toBeNull();
  });
});
