/**
 * Isochrone targets.
 *
 * Tier B computes one isochrone set per target — that is `people + anchors`
 * routing requests, not `cells × targets`. These helpers keep the id scheme in
 * one place so the routing pipeline and the metric modules agree.
 */

import type { Anchor, Household, LatLng, Person } from "./types";

export type TargetKind = "person" | "anchor";

export interface Target {
  id: string;
  kind: TargetKind;
  label: string;
  location: LatLng;
}

export function personTargetId(personId: string): string {
  return `person:${personId}`;
}

export function anchorTargetId(anchorId: string): string {
  return `anchor:${anchorId}`;
}

export function personTarget(person: Person): Target | null {
  if (!person.work) return null;
  return {
    id: personTargetId(person.id),
    kind: "person",
    label: `${person.name} — ${person.workLabel}`,
    location: person.work,
  };
}

export function anchorTarget(anchor: Anchor): Target | null {
  if (!anchor.location) return null;
  return {
    id: anchorTargetId(anchor.id),
    kind: "anchor",
    label: anchor.label,
    location: anchor.location,
  };
}

/** Every target a household needs isochrones for. Typically 5–10. */
export function householdTargets(household: Household): Target[] {
  const targets: Target[] = [];

  for (const person of household.people) {
    const target = personTarget(person);
    if (target) targets.push(target);
  }
  for (const anchor of household.anchors) {
    const target = anchorTarget(anchor);
    if (target) targets.push(target);
  }

  return targets;
}
