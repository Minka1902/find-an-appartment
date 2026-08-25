/**
 * Putting a household in a URL.
 *
 * The household screen has always offered an "invite link" and then admitted,
 * on screen, that it only opened setup on your own device — because the state
 * lives in `localStorage` and there is no backend to put it in. Encoding the
 * household into the link itself makes the feature real without one: the link
 * *is* the transport.
 *
 * The point is the negotiation the app exists to host. Sending someone your
 * weights and everyone's addresses so they can argue with them is the product;
 * asking them to retype it is not.
 *
 * Received links are third-party input, so decoding always goes through the
 * same zod schema that guards `localStorage`.
 */

import { parseHousehold } from "@/store/household-schema";
import type { Household } from "@/lib/scoring/types";

/** The query parameter carrying an encoded household. */
export const SHARE_PARAM = "h";

/**
 * Practical ceiling for the encoded value.
 *
 * Browsers and mail clients start truncating links well before the theoretical
 * limits, and a silently truncated household is worse than an honest "this is
 * too big to share" — so the caller checks and falls back.
 */
export const MAX_SHARE_LENGTH = 1800;

function toBase64Url(text: string): string {
  // `btoa` only accepts Latin-1, and these labels are full of Hebrew, so the
  // string has to be UTF-8 encoded before it is base64'd.
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode a household for a URL, or null when it is too large to carry. */
export function encodeHousehold(household: Household): string | null {
  try {
    const encoded = toBase64Url(JSON.stringify(household));
    return encoded.length > MAX_SHARE_LENGTH ? null : encoded;
  } catch {
    return null;
  }
}

/**
 * Decode a household from a URL parameter.
 *
 * Returns null for anything that isn't a valid household — corrupt base64, a
 * truncated link, or a payload from an incompatible version. Never throws, and
 * never returns something half-parsed: the caller is about to replace the
 * user's entire setup with this.
 */
export function decodeHousehold(encoded: string): Household | null {
  try {
    return parseHousehold(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return null;
  }
}

/** The full share URL for a household, or null when it won't fit. */
export function buildShareUrl(
  origin: string,
  path: string,
  household: Household,
): string | null {
  const encoded = encodeHousehold(household);
  if (encoded === null) return null;
  return `${origin}${path}?${SHARE_PARAM}=${encoded}`;
}

/** Read the encoded household out of a query string, if present. */
export function readShareParam(search: string): string | null {
  return new URLSearchParams(search).get(SHARE_PARAM);
}

/**
 * A one-line summary of an incoming household, for the import prompt.
 *
 * Importing replaces everything the user has, so the prompt has to say what
 * they would be getting — "Import a household?" is not enough to decide on.
 */
export function describeHousehold(household: Household): string {
  const names = household.people
    .map((person) => person.name.trim())
    .filter((name) => name.length > 0);

  const people =
    names.length > 0
      ? names.join(", ")
      : `${household.people.length} ${household.people.length === 1 ? "person" : "people"}`;

  const anchors =
    household.anchors.length > 0
      ? `, ${household.anchors.length} anchor${household.anchors.length === 1 ? "" : "s"}`
      : "";

  return `${people}${anchors}`;
}
