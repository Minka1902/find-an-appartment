/**
 * The crawler's command line.
 *
 *   npm run crawl -- --source nadlan --metro gush-dan
 *   npm run crawl -- --source overpass --out public/data/gush-dan.metrics.json
 *   npm run crawl -- --list
 *
 * Writes one file, `public/data/<metro>.metrics.json`, which the app picks up
 * through `src/lib/data/measured.ts`. `public/` rather than an import, so a
 * missing file is a 404 the provider falls back from at runtime instead of a
 * build error — until that file exists the app runs on fixtures,
 * so a failed or partial crawl degrades to exactly the behaviour that shipped
 * rather than to a broken screen.
 *
 * It is deliberately noisy about what it did *not* get: a source refused by
 * robots.txt, a resource with no coordinates and an empty Overpass answer all
 * print, because a crawler that quietly writes less than you think it did is
 * how fixture data ends up presented as measurement.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { aggregate } from "@/lib/crawler/aggregate";
import { PoliteFetcher } from "@/lib/crawler/fetcher";
import { getSource, SOURCES } from "@/lib/crawler/registry";
import type { Observation, Source } from "@/lib/crawler/types";
import { fixtureProvider } from "@/lib/data/provider";

interface Args {
  sources: string[];
  metro: string;
  out: string | null;
  limit: number;
  list: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sources: [],
    metro: "gush-dan",
    out: null,
    limit: 0,
    list: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--source":
      case "-s":
        if (value) args.sources.push(...value.split(",").map((s) => s.trim()));
        i++;
        break;
      case "--metro":
        if (value) args.metro = value;
        i++;
        break;
      case "--out":
      case "-o":
        if (value) args.out = value;
        i++;
        break;
      case "--limit":
        if (value) args.limit = Number(value) || 0;
        i++;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        break;
    }
  }

  return args;
}

function usage(): void {
  console.log(`
Fetch real open data and aggregate it onto the ranked cell grid.

  npm run crawl -- --source <id[,id]> [options]

Options
  -s, --source <ids>   Sources to run (default: all). Comma-separated.
      --metro <id>     Metro to crawl (default: gush-dan).
  -o, --out <path>     Output file (default: public/data/<metro>.metrics.json).
      --limit <n>      Stop after n upstream records per source. 0 = no limit.
      --list           List the available sources and exit.
  -h, --help           This.

Environment
  DATA_GOV_IL_URL      Open-data portal base (default: https://data.gov.il)
  NADLAN_RESOURCE_ID   Pin a CKAN resource instead of discovering one
  OVERPASS_URL         Overpass endpoint (default: overpass-api.de)
  CRAWLER_USER_AGENT   Override the identifying user agent
`);
}

function listSources(): void {
  console.log("\nAvailable sources\n");
  for (const source of SOURCES) {
    console.log(`  ${source.id.padEnd(10)} ${source.describe}`);
    console.log(`  ${" ".repeat(10)} ${source.homepage}`);
    console.log(`  ${" ".repeat(10)} ${source.licence}`);
    console.log(
      `  ${" ".repeat(10)} metrics: ${source.metrics
        .map((m) => `${m.metric} (${m.coverage}, ${m.confidence} confidence)`)
        .join(", ")}\n`,
    );
  }
  console.log(
    "Yad2 and Madlan have no adapter on purpose: both block automated access\n" +
      "and forbid scraping in their terms. See src/lib/crawler/registry.ts.\n",
  );
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return 0;
  }
  if (args.list) {
    listSources();
    return 0;
  }

  const selected: Source[] = args.sources.length
    ? args.sources.map((id) => {
        const source = getSource(id);
        if (!source) {
          throw new Error(
            `Unknown source "${id}". Run with --list to see what there is.`,
          );
        }
        return source;
      })
    : SOURCES;

  const metro = await fixtureProvider.getMetro();
  if (metro.id !== args.metro) {
    console.error(
      `Only "${metro.id}" is built today; asked for "${args.metro}".`,
    );
    return 1;
  }

  // The live grid, so measured values land on cells the app actually ranks.
  const { zones } = await fixtureProvider.getZoneDataset();

  const fetcher = new PoliteFetcher({
    userAgent: process.env.CRAWLER_USER_AGENT,
    log: (message) => console.log(`  ${message}`),
  });

  console.log(`\nCrawling ${metro.name} (${zones.length} cells)\n`);

  const collected: {
    id: string;
    describe: string;
    metrics: Source["metrics"];
    observations: Observation[];
  }[] = [];
  const allNotes: string[] = [];

  for (const source of selected) {
    console.log(`- ${source.id}: ${source.describe}`);
    const result = await source.collect({
      bbox: metro.bbox,
      fetcher,
      log: (message) => console.log(`  ${message}`),
      limit: args.limit,
    });

    collected.push({
      id: source.id,
      describe: source.describe,
      metrics: source.metrics,
      observations: result.observations,
    });
    for (const note of result.notes) allNotes.push(`${source.id}: ${note}`);
    console.log(`  ${result.observations.length} observation(s)\n`);
  }

  const total = collected.reduce((sum, s) => sum + s.observations.length, 0);

  console.log("Requests: " + JSON.stringify(fetcher.stats));
  if (allNotes.length > 0) {
    console.log("\nNot collected:");
    for (const note of allNotes) console.log(`  ! ${note}`);
  }

  if (total === 0) {
    console.error(
      "\nNothing was collected, so nothing was written — the app keeps running\n" +
        "on fixtures. If every source reports a network or robots failure, check\n" +
        "that this machine has outbound HTTPS to the hosts listed by --list.\n",
    );
    return 1;
  }

  const dataset = aggregate({ metro: metro.id, zones, sources: collected });
  const measuredCells = Object.keys(dataset.cells).length;

  const out = args.out ?? path.join("public", "data", `${metro.id}.metrics.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  console.log(
    `\nWrote ${out}` +
      `\n  ${total.toLocaleString()} observations -> ${measuredCells.toLocaleString()} of ${zones.length.toLocaleString()} cells`,
  );

  // Per-metric summary: which numbers actually stop being generated.
  const byMetric = new Map<string, { cells: number; high: number; medium: number }>();
  for (const cell of Object.values(dataset.cells)) {
    for (const [metric, value] of Object.entries(cell)) {
      const entry = byMetric.get(metric) ?? { cells: 0, high: 0, medium: 0 };
      entry.cells++;
      if (value.confidence === "high") entry.high++;
      if (value.confidence === "medium") entry.medium++;
      byMetric.set(metric, entry);
    }
  }
  for (const [metric, entry] of byMetric) {
    console.log(
      `  ${metric.padEnd(10)} ${entry.cells.toLocaleString()} cells ` +
        `(${entry.high.toLocaleString()} high, ${entry.medium.toLocaleString()} medium confidence)`,
    );
  }
  console.log(
    "\nOnly medium- and high-confidence values replace a fixture value; the rest\n" +
      "are recorded as supporting evidence. See src/lib/data/measured.ts.\n",
  );

  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  },
);
