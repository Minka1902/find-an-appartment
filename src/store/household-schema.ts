import { z } from "zod";

import { demoHousehold } from "@/lib/fixtures/household";
import type { Household } from "@/lib/scoring/types";

/**
 * Runtime validation for household state that came from outside the program.
 *
 * `localStorage` is user-writable and survives across deploys, so a persisted
 * household is *untrusted input*, not internal state. Before this, a hand-edited
 * or half-migrated entry was handed straight to the engine, where a missing
 * `people` array or a string where a number belongs surfaces as a crash inside
 * `scoreZones` with no hint of where the bad data came from.
 *
 * The same schema validates households arriving in a share URL (§ share link),
 * which is genuinely third-party input.
 *
 * Bounds are deliberately generous — this rejects data that is *malformed*, not
 * data that is unusual. Clamping a strange-but-valid value is the UI's job.
 */

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const travelModeSchema = z.enum(["transit", "drive", "walk", "bike"]);

const personSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  work: latLngSchema.nullable(),
  workLabel: z.string(),
  // Never allow an empty mode list: `collectCommutes` would have no way to
  // reach this person and every zone would silently read as unreachable.
  modes: z.array(travelModeSchema).min(1),
  daysInOffice: z.number().min(0).max(7),
  maxCommuteMinutes: z.number().positive(),
  weight: z.number().min(0).max(1),
});

const anchorSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  location: latLngSchema.nullable(),
  locationLabel: z.string(),
  visitsPerMonth: z.number().min(0),
  modes: z.array(travelModeSchema).min(1),
});

export const householdSchema = z.object({
  id: z.string().min(1),
  metro: z.string().min(1),
  // At least one person, matching the store's own invariant that `removePerson`
  // never empties the list.
  people: z.array(personSchema).min(1),
  anchors: z.array(anchorSchema),
  carCount: z.number().min(0),
  requiresStreetParking: z.boolean(),
  maxCost: z.number().positive().nullable(),
  weights: z.record(z.string(), z.number().min(0).max(1)),
  commuteAggregation: z.enum(["mean", "max", "balanced"]),
  // Added after v1 shipped, so old persisted state has no value for it.
  // Defaulting here *is* the migration: anything without the field reads as the
  // engine's historical behaviour.
  unreachablePolicy: z.enum(["reject", "penalty"]).default("reject"),
});

export type ParsedHousehold = z.infer<typeof householdSchema>;

/**
 * Parse an unknown value into a Household, or return null.
 *
 * Returning null rather than throwing keeps the caller in control of the
 * fallback — the store falls back to the demo household, while the share-link
 * importer shows an error instead of silently replacing what the user has.
 */
export function parseHousehold(value: unknown): Household | null {
  const result = householdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Coerce persisted state into something the engine can run on.
 *
 * A corrupt entry costs the user their setup, which is bad — but an unbootable
 * app costs them the same setup *and* leaves no way back in, which is worse.
 */
export function parseHouseholdOrDemo(value: unknown): Household {
  return parseHousehold(value) ?? demoHousehold();
}
