import type { GeocodeResult } from "@unmap/geocoding";
import { categoryLabel } from "@/lib/categories";
import type { Lang } from "@/lib/url-state";

/**
 * How a search suggestion reads: one line naming the thing, one line placing it.
 *
 * The API's `name` already ends in the city ("108 PATTERSON DR SW, Calgary"), and the registry
 * geocoder's default row prints the city again under it. Here the first line is the address or
 * name alone and the second says where it is, so neither repeats the other.
 */

/** Tokens a source prints in capitals that stay in capitals: quadrants, directions, provinces, numerals. */
const KEEP_UPPER = new Set([
  "NW", "NE", "SW", "SE", "N", "S", "E", "W", "NO", "SO",
  "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII",
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT", "PEI",
  "RR", "PO", "TCH", "HWY",
]);
/** Short words that stay lower case inside a name. */
const KEEP_LOWER = new Set(["de", "du", "des", "la", "le", "les", "et", "au", "aux", "of", "the", "and", "on", "at", "sur"]);

function capitalise(part: string): string {
  if (!part) return part;
  if (/^MC[A-Z]{2,}$/.test(part)) return `Mc${part.charAt(2)}${part.slice(3).toLowerCase()}`;
  return part.charAt(0) + part.slice(1).toLowerCase();
}

function wordCase(word: string, first: boolean): string {
  if (KEEP_UPPER.has(word)) return word;
  if (/\d/.test(word)) return word.replace(/^(\d+)(ST|ND|RD|TH|E|ER|RE)$/, (_, n: string, s: string) => n + s.toLowerCase());
  const lower = word.toLowerCase();
  if (!first && KEEP_LOWER.has(lower)) return lower;
  // D'ARCY, L'ÉGLISE, ST-DENIS: each part after an apostrophe or a hyphen is its own word.
  return word.split(/(['’-])/).map((p) => (/^['’-]$/.test(p) ? p : capitalise(p))).join("");
}

/**
 * Street names some sources publish in capitals ("108 PATTERSON DR SW"), shown in title case.
 * A string with any lower-case letter is left exactly as the source wrote it.
 */
export function displayCase(text: string): string {
  if (!/\p{Lu}/u.test(text) || /\p{Ll}/u.test(text)) return text;
  return text
    .split(/(\s+)/)
    .map((w, i) => (/^\s+$/.test(w) ? w : wordCase(w, i === 0)))
    .join("");
}

/** "Calgary" off the end of "108 PATTERSON DR SW, Calgary". */
function withoutCity(name: string, city: string | undefined): string {
  if (!city) return name;
  const suffix = `, ${city}`;
  return name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) : name;
}

const PROVINCES: Record<string, { en: string; fr: string }> = {
  AB: { en: "Alberta", fr: "Alberta" },
  BC: { en: "British Columbia", fr: "Colombie-Britannique" },
  MB: { en: "Manitoba", fr: "Manitoba" },
  NB: { en: "New Brunswick", fr: "Nouveau-Brunswick" },
  NL: { en: "Newfoundland and Labrador", fr: "Terre-Neuve-et-Labrador" },
  NS: { en: "Nova Scotia", fr: "Nouvelle-Écosse" },
  NT: { en: "Northwest Territories", fr: "Territoires du Nord-Ouest" },
  NU: { en: "Nunavut", fr: "Nunavut" },
  ON: { en: "Ontario", fr: "Ontario" },
  PE: { en: "Prince Edward Island", fr: "Île-du-Prince-Édouard" },
  QC: { en: "Quebec", fr: "Québec" },
  SK: { en: "Saskatchewan", fr: "Saskatchewan" },
  YT: { en: "Yukon", fr: "Yukon" },
};

const KIND: Partial<Record<GeocodeResult["layer"], { en: string; fr: string }>> = {
  region: { en: "Province or territory", fr: "Province ou territoire" },
  legal_land: { en: "Legal land description", fr: "Description légale de terrain" },
  well: { en: "Well", fr: "Puits" },
  facility: { en: "Energy facility", fr: "Installation énergétique" },
  parcel: { en: "BC parcel", fr: "Parcelle de la C.-B." },
};

export interface ResultLines {
  primary: string;
  secondary: string | null;
}

export function resultLines(r: GeocodeResult, lang: Lang): ResultLines {
  const a = r.address ?? {};
  const city = a.city ? displayCase(a.city) : undefined;
  const place = [city, a.region].filter(Boolean).join(", ") || null;
  const street = [a.housenumber, a.street].filter(Boolean).join(" ");
  const kind = KIND[r.layer]?.[lang];
  switch (r.layer) {
    case "address":
    case "street":
      return { primary: displayCase(street || withoutCity(r.name, a.city)), secondary: place };
    case "locality":
      return { primary: displayCase(r.name), secondary: (a.region && PROVINCES[a.region]?.[lang]) ?? a.region ?? null };
    case "poi": {
      const where = [street ? displayCase(street) : null, city].filter(Boolean).join(", ");
      return { primary: r.name, secondary: [categoryLabel(r.category), where].filter(Boolean).join(", ") || null };
    }
    case "well":
      return { primary: r.uwi ?? r.name, secondary: [kind, r.operator].filter(Boolean).join(", ") };
    case "parcel":
      return { primary: r.pid ? `PID ${r.pid}` : r.name, secondary: [kind, place].filter(Boolean).join(", ") };
    default:
      return { primary: withoutCity(r.name, a.city), secondary: [kind, place].filter(Boolean).join(", ") || null };
  }
}

/** One character folded for matching: lower case, accent off, so "Montreal" matches "Montréal". */
const fold = (c: string) => c.normalize("NFD").charAt(0).toLowerCase();

/**
 * The text cut into the parts the query matched and the parts it did not: each word that starts
 * with a query word has that start marked, as a search list shows what you typed.
 */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const words = query.split(/[\s,'’-]+/).filter(Boolean).map((w) => [...w].map(fold).join(""));
  if (!words.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const m of text.matchAll(/[\p{L}\p{N}'’]+/gu)) {
    const word = m[0];
    const folded = [...word].map(fold).join("");
    const best = Math.max(0, ...words.filter((w) => folded.startsWith(w)).map((w) => w.length));
    for (let i = 0; i < best; i++) marks[m.index + i] = true;
  }
  const parts: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else parts.push({ text: text[i]!, match: marks[i]! });
  }
  return parts;
}
