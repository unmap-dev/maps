/**
 * The 15-minute check: which everyday essentials sit inside a walk (or ride) of a point.
 *
 * One isochrone with 5, 10 and 15 minute bands, one `places.nearby` per essential, one
 * `transit.nearbyStops`, all in parallel. Every candidate is put in the smallest band that
 * contains it, and each essential keeps its quickest candidate (straight-line distance breaks a
 * tie inside a band). Pure functions only: the panel owns the calls.
 */
import { haversine } from "@/lib/format";
import { contains } from "@/lib/geo";
import type { LngLat, ReachMode } from "@/lib/url-state";

export type ScoreMode = Extract<ReachMode, "pedestrian" | "bicycle">;
export const SCORE_MODES: readonly ScoreMode[] = ["pedestrian", "bicycle"];
export const SCORE_MINUTES = [5, 10, 15];

export interface Essential {
  id: string;
  label: string;
  /** Taxonomy ids (pipeline/geocoding/taxonomy.json) asked for in one `places.nearby`. Empty for transit. */
  categories: string[];
}

export const ESSENTIALS: readonly Essential[] = [
  { id: "groceries", label: "Groceries", categories: ["shop.supermarket"] },
  { id: "pharmacy", label: "Pharmacy", categories: ["health.pharmacy"] },
  { id: "health", label: "Health care", categories: ["health.clinic", "health.hospital"] },
  { id: "school", label: "School", categories: ["education.school", "education.kindergarten"] },
  { id: "park", label: "Park", categories: ["recreation.park", "recreation.playground"] },
  { id: "library", label: "Library", categories: ["culture.library"] },
  { id: "food", label: "Café or restaurant", categories: ["food.cafe", "food.restaurant"] },
  { id: "bank", label: "Bank or ATM", categories: ["finance.bank", "finance.atm"] },
  { id: "transit", label: "Transit stop", categories: [] },
];

/**
 * How far to search, in metres: further than a 15-minute trip can reach in a straight line at the
 * mode's routing speed (about 5 km/h on foot, under 20 km/h by bike), so the place calls need not
 * wait for the isochrone. The transit API takes at most 10 km.
 */
export const SEARCH_RADIUS: Record<ScoreMode, number> = { pedestrian: 1600, bicycle: 6000 };

type Geometry = { type: string; coordinates: unknown };
export interface Band {
  minutes: number;
  geometry: Geometry;
}
export interface Candidate {
  kind: "place" | "stop";
  id: string;
  name: string;
  coordinates: LngLat;
}
export interface Reached extends Candidate {
  /** The smallest band that contains it. */
  minutes: number;
  /** Straight-line metres from the origin. */
  distance: number;
}
export type EssentialResult =
  | { essential: Essential; status: "met"; best: Reached }
  | { essential: Essential; status: "missing" }
  | { essential: Essential; status: "error" };

/** The smallest band containing a point, or null outside every band. */
export function bandOf(bands: Band[], at: LngLat): number | null {
  for (const b of [...bands].sort((x, y) => x.minutes - y.minutes)) if (contains(b.geometry, at)) return b.minutes;
  return null;
}

/** The quickest candidate inside the bands: smallest band first, then the nearest. */
export function quickest(bands: Band[], origin: LngLat, candidates: Candidate[]): Reached | null {
  let best: Reached | null = null;
  for (const c of candidates) {
    const minutes = bandOf(bands, c.coordinates);
    if (minutes == null) continue;
    const distance = haversine(origin, c.coordinates);
    if (!best || minutes < best.minutes || (minutes === best.minutes && distance < best.distance)) best = { ...c, minutes, distance };
  }
  return best;
}

/** One result per essential, in ESSENTIALS order. A candidate list of null means its call failed. */
export function checkEssentials(bands: Band[], origin: LngLat, candidates: Record<string, Candidate[] | null>): EssentialResult[] {
  return ESSENTIALS.map((essential) => {
    const list = candidates[essential.id];
    if (list == null) return { essential, status: "error" };
    const best = quickest(bands, origin, list);
    return best ? { essential, status: "met", best } : { essential, status: "missing" };
  });
}

/** Met out of the essentials that could be checked: a failed call is not counted as missing. */
export function scoreOf(results: EssentialResult[]): { met: number; total: number } {
  return { met: results.filter((r) => r.status === "met").length, total: results.filter((r) => r.status !== "error").length };
}
