/**
 * Address autocomplete source.
 *
 * §5: do *not* use free-text geocoding. Hebrew addresses have too many
 * spellings and transliteration variants ("Rothschild" / "רוטשילד"), so the
 * app serves autocomplete from its own table and only ever stores a picked
 * entry with real coordinates. This fixture is that table, scaled down.
 */

import type { LatLng } from "@/lib/geo";

export interface AddressSuggestion {
  id: string;
  /** Latin-script label, what the UI shows by default. */
  label: string;
  /** Hebrew label, matched against too so either spelling finds the row. */
  labelHe: string;
  city: string;
  location: LatLng;
}

export const ADDRESS_BOOK: AddressSuggestion[] = [
  {
    id: "rothschild",
    label: "Rothschild Blvd, Tel Aviv",
    labelHe: "שדרות רוטשילד, תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0644, lng: 34.7742 },
  },
  {
    id: "azrieli",
    label: "Azrieli Center, Tel Aviv",
    labelHe: "מרכז עזריאלי, תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0741, lng: 34.7925 },
  },
  {
    id: "sarona",
    label: "Sarona, Tel Aviv",
    labelHe: "שרונה, תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0713, lng: 34.7869 },
  },
  {
    id: "florentin",
    label: "Florentin, Tel Aviv",
    labelHe: "פלורנטין, תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0554, lng: 34.7681 },
  },
  {
    id: "jaffa",
    label: "Jaffa Clock Tower",
    labelHe: "מגדל השעון, יפו",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0537, lng: 34.7524 },
  },
  {
    id: "herzliya-pituach",
    label: "Herzliya Pituach",
    labelHe: "הרצליה פיתוח",
    city: "Herzliya",
    location: { lat: 32.1624, lng: 34.8093 },
  },
  {
    id: "ramat-gan-diamond",
    label: "Diamond Exchange, Ramat Gan",
    labelHe: "בורסת היהלומים, רמת גן",
    city: "Ramat Gan",
    location: { lat: 32.0836, lng: 34.8045 },
  },
  {
    id: "ramat-gan-center",
    label: "Bialik St, Ramat Gan",
    labelHe: "ביאליק, רמת גן",
    city: "Ramat Gan",
    location: { lat: 32.0684, lng: 34.8248 },
  },
  {
    id: "givatayim",
    label: "Katznelson St, Givatayim",
    labelHe: "כצנלסון, גבעתיים",
    city: "Givatayim",
    location: { lat: 32.0723, lng: 34.8125 },
  },
  {
    id: "bnei-brak",
    label: "Jabotinsky St, Bnei Brak",
    labelHe: "ז'בוטינסקי, בני ברק",
    city: "Bnei Brak",
    location: { lat: 32.0807, lng: 34.8338 },
  },
  {
    id: "holon",
    label: "Sokolov St, Holon",
    labelHe: "סוקולוב, חולון",
    city: "Holon",
    location: { lat: 32.0158, lng: 34.7874 },
  },
  {
    id: "bat-yam",
    label: "Ben Gurion St, Bat Yam",
    labelHe: "בן גוריון, בת ים",
    city: "Bat Yam",
    location: { lat: 32.0171, lng: 34.7457 },
  },
  {
    id: "ramat-hasharon",
    label: "Sokolov St, Ramat HaSharon",
    labelHe: "סוקולוב, רמת השרון",
    city: "Ramat HaSharon",
    location: { lat: 32.1462, lng: 34.8394 },
  },
  {
    id: "petah-tikva",
    label: "Em HaMoshavot, Petah Tikva",
    labelHe: "אם המושבות, פתח תקווה",
    city: "Petah Tikva",
    location: { lat: 32.0878, lng: 34.8878 },
  },
  {
    id: "tau",
    label: "Tel Aviv University",
    labelHe: "אוניברסיטת תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.1133, lng: 34.8044 },
  },
  {
    id: "ichilov",
    label: "Ichilov Hospital, Tel Aviv",
    labelHe: "בית חולים איכילוב, תל אביב",
    city: "Tel Aviv-Yafo",
    location: { lat: 32.0794, lng: 34.7897 },
  },
  {
    id: "sheba",
    label: "Sheba Medical Center, Ramat Gan",
    labelHe: "תל השומר, רמת גן",
    city: "Ramat Gan",
    location: { lat: 32.0453, lng: 34.8433 },
  },
];

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/** Substring match across Latin label, Hebrew label and city. */
export function searchAddresses(
  query: string,
  limit = 8,
): AddressSuggestion[] {
  const needle = normalize(query);
  if (needle.length === 0) return ADDRESS_BOOK.slice(0, limit);

  return ADDRESS_BOOK.filter((entry) => {
    return (
      normalize(entry.label).includes(needle) ||
      entry.labelHe.includes(query.trim()) ||
      normalize(entry.city).includes(needle)
    );
  }).slice(0, limit);
}
