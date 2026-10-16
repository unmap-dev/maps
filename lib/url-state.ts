/**
 * The app's whole state lives in the URL, in the shape Google Maps taught people:
 *
 *   /@51.0443,-114.0631,13z                         the map at a camera
 *   /place/um:place:123/@…                          a place card
 *   /here/-114.07,51.05/@…                          "what's here" at a point
 *   /dir/um:place:1/-114.07,51.05?mode=bicycle      directions; either end may be `_` (not set)
 *   /nearby/food.cafe/@…                            a category near the map centre
 *   /reach/-114.06,51.04?minutes=5,10,15&mode=pedestrian
 *   /score/-114.06,51.04?mode=bicycle               the 15-minute check; walking unless `mode` says
 *   …?of=um:place:123   …?of=pin                    a nearby, reach or score screen opened as a tab
 *                                                   of a place card, or of a dropped pin at its origin
 *   /stop/<id>/@…   /event/<id>/@…                  a transit stop, a road event
 *
 * and the display preferences ride as query parameters: `map=<style>-<light|dark>` (or a bare
 * style, which follows the page), `layers=`, `lang=fr`, `inspect=0|1`.
 *
 * Pure functions only: parse and format round-trip, and the app owns history.
 */
import { STYLE_NAMES } from "@unmap/maps";

export type LngLat = [number, number];
export type TravelMode = "auto" | "transit" | "bicycle" | "pedestrian" | "truck";
export type ReachMode = "auto" | "bicycle" | "pedestrian";
export type MapMode = "auto" | "light" | "dark";
export type Lang = "en" | "fr";

export const TRAVEL_MODES: readonly TravelMode[] = ["auto", "transit", "bicycle", "pedestrian", "truck"];
export const REACH_MODES: readonly ReachMode[] = ["pedestrian", "bicycle", "auto"];

/** One end of a route: a place by id, or a bare point. */
export type Waypoint = { place: string } | { at: LngLat };

/**
 * What a nearby, reach or score screen was opened from, when it was opened as a tab of a card:
 * a place id, or `"pin"` for a dropped pin at the screen's own origin. Absent for a screen opened
 * on its own (a category chip, a transit stop's travel area).
 */
export type Of = string;

export type View =
  | { name: "map" }
  | { name: "place"; id: string }
  | { name: "here"; at: LngLat }
  | { name: "dir"; from: Waypoint | null; to: Waypoint | null; mode: TravelMode; hills?: number; avoid?: string[] }
  | { name: "nearby"; category: string; near?: LngLat; of?: Of }
  | { name: "reach"; origin: LngLat; minutes: number[]; mode: ReachMode; of?: Of }
  | { name: "score"; origin: LngLat; mode: "pedestrian" | "bicycle"; of?: Of }
  | { name: "stop"; id: string }
  | { name: "event"; id: string };

export interface Camera {
  lng: number;
  lat: number;
  zoom: number;
}

export interface Prefs {
  style: string;
  mapMode: MapMode;
  /** App layers (`transit`, `roads`) and catalog overlay ids (`treaties`, `survey.dls`, …). */
  layers: string[];
  lang: Lang;
  /** Inspector open or closed; null follows the screen size. */
  inspect: boolean | null;
}

export interface AppState {
  view: View;
  camera: Camera | null;
  prefs: Prefs;
}

export const DEFAULT_PREFS: Prefs = { style: "base", mapMode: "auto", layers: [], lang: "en", inspect: null };
export const DEFAULT_MINUTES = [5, 10, 15];
/** The isochrone API takes at most four bands, each 120 minutes or less. */
export const MAX_BANDS = 4;

const num = (s: string | undefined) => (s != null && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

/** `lng,lat` → point, or null when it is not two finite numbers in range. */
export function parseLngLat(s: string | undefined): LngLat | null {
  if (!s) return null;
  const [a, b, ...rest] = s.split(",");
  const lng = num(a), lat = num(b);
  if (rest.length || lng == null || lat == null || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/** A point at 6 decimals (about 10 cm): what a click or a map centre is worth sending to the API. */
export const roundLngLat = ([lng, lat]: LngLat): LngLat => [round(lng >= -180 && lng <= 180 ? lng : ((lng + 180) % 360 + 360) % 360 - 180, 6), round(lat, 6)];
export const formatLngLat = ([lng, lat]: LngLat) => `${round(lng, 5)},${round(lat, 5)}`;

/** `@lat,lng,zoomz` → camera. */
export function parseCamera(segment: string): Camera | null {
  const m = /^@(-?[\d.]+),(-?[\d.]+),([\d.]+)z$/.exec(segment);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]), zoom = Number(m[3]);
  if (![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 0 || zoom > 24) return null;
  return { lng, lat, zoom };
}

export const formatCamera = (c: Camera) => `@${round(c.lat, 5)},${round(c.lng, 5)},${round(c.zoom, 2)}z`;

function parseWaypoint(s: string | undefined): Waypoint | null {
  if (!s || s === "_") return null;
  const at = parseLngLat(s);
  return at ? { at } : { place: s };
}

/** `of=` → a place id or `pin`; anything else is dropped rather than trusted. */
function parseOf(s: string | null): { of?: Of } {
  return s && /^[\w:.-]{1,200}$/.test(s) ? { of: s } : {};
}

const formatWaypoint = (w: Waypoint | null) => (!w ? "_" : "at" in w ? formatLngLat(w.at) : encodeURIComponent(w.place));

function parseMinutes(s: string | null): number[] {
  if (!s) return DEFAULT_MINUTES;
  const list = [...new Set(s.split(",").map(Number).filter((m) => Number.isInteger(m) && m > 0 && m <= 120))].sort((a, b) => a - b);
  return list.length ? list.slice(0, MAX_BANDS) : DEFAULT_MINUTES;
}

function parsePrefs(q: URLSearchParams): Prefs {
  const prefs: Prefs = { ...DEFAULT_PREFS, layers: [] };
  const map = q.get("map");
  if (map) {
    const m = /^([a-z]+)(?:-(light|dark))?$/.exec(map);
    if (m && (STYLE_NAMES as readonly string[]).includes(m[1]!)) {
      prefs.style = m[1]!;
      prefs.mapMode = (m[2] as MapMode | undefined) ?? "auto";
    }
  }
  const layers = q.get("layers");
  if (layers) prefs.layers = [...new Set(layers.split(",").filter((l) => /^[a-z][a-z0-9._-]*$/.test(l)))];
  if (q.get("lang") === "fr") prefs.lang = "fr";
  const inspect = q.get("inspect");
  if (inspect === "1" || inspect === "0") prefs.inspect = inspect === "1";
  return prefs;
}

export function parseUrl(pathname: string, search: string): AppState {
  const q = new URLSearchParams(search);
  const parts = pathname.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  let camera: Camera | null = null;
  const last = parts[parts.length - 1];
  if (last?.startsWith("@")) {
    camera = parseCamera(last);
    parts.pop();
  }
  const prefs = parsePrefs(q);
  const [head, a, b] = parts;
  let view: View = { name: "map" };
  switch (head) {
    case "place":
      if (a) view = { name: "place", id: a };
      break;
    case "here": {
      const at = parseLngLat(a);
      if (at) view = { name: "here", at };
      break;
    }
    case "dir": {
      const mode = q.get("mode") as TravelMode | null;
      const hills = num(q.get("hills") ?? undefined);
      const avoid = q.get("avoid")?.split(",").filter((x) => x === "tolls" || x === "highways");
      view = {
        name: "dir",
        from: parseWaypoint(a),
        to: parseWaypoint(b),
        mode: mode && TRAVEL_MODES.includes(mode) ? mode : "auto",
        ...(hills != null && hills >= 0 && hills <= 1 ? { hills } : {}),
        ...(avoid?.length ? { avoid } : {}),
      };
      break;
    }
    case "nearby":
      if (a && /^[a-z_]+(\.[a-z_]+)?$/.test(a)) {
        const near = parseLngLat(q.get("near") ?? undefined);
        view = { name: "nearby", category: a, ...(near ? { near } : {}), ...parseOf(q.get("of")) };
      }
      break;
    case "reach": {
      const origin = parseLngLat(a);
      const mode = q.get("mode") as ReachMode | null;
      if (origin)
        view = { name: "reach", origin, minutes: parseMinutes(q.get("minutes")), mode: mode && REACH_MODES.includes(mode) ? mode : "pedestrian", ...parseOf(q.get("of")) };
      break;
    }
    case "score": {
      const origin = parseLngLat(a);
      if (origin) view = { name: "score", origin, mode: q.get("mode") === "bicycle" ? "bicycle" : "pedestrian", ...parseOf(q.get("of")) };
      break;
    }
    case "stop":
      if (a) view = { name: "stop", id: a };
      break;
    case "event":
      if (a) view = { name: "event", id: a };
      break;
  }
  return { view, camera, prefs };
}

export function formatUrl({ view, camera, prefs }: AppState): string {
  const q = new URLSearchParams();
  let path = "";
  switch (view.name) {
    case "place":
      path = `/place/${encodeURIComponent(view.id)}`;
      break;
    case "here":
      path = `/here/${formatLngLat(view.at)}`;
      break;
    case "dir":
      path = `/dir/${formatWaypoint(view.from)}/${formatWaypoint(view.to)}`;
      q.set("mode", view.mode);
      if (view.hills != null) q.set("hills", String(view.hills));
      if (view.avoid?.length) q.set("avoid", view.avoid.join(","));
      break;
    case "nearby":
      path = `/nearby/${view.category}`;
      if (view.near) q.set("near", formatLngLat(view.near));
      if (view.of) q.set("of", view.of);
      break;
    case "reach":
      path = `/reach/${formatLngLat(view.origin)}`;
      q.set("minutes", view.minutes.join(","));
      q.set("mode", view.mode);
      if (view.of) q.set("of", view.of);
      break;
    case "score":
      path = `/score/${formatLngLat(view.origin)}`;
      if (view.mode !== "pedestrian") q.set("mode", view.mode);
      if (view.of) q.set("of", view.of);
      break;
    case "stop":
      path = `/stop/${encodeURIComponent(view.id)}`;
      break;
    case "event":
      path = `/event/${encodeURIComponent(view.id)}`;
      break;
  }
  if (camera) path += `/${formatCamera(camera)}`;
  if (prefs.style !== DEFAULT_PREFS.style || prefs.mapMode !== "auto")
    q.set("map", prefs.mapMode === "auto" ? prefs.style : `${prefs.style}-${prefs.mapMode}`);
  if (prefs.layers.length) q.set("layers", prefs.layers.join(","));
  if (prefs.lang !== "en") q.set("lang", prefs.lang);
  if (prefs.inspect != null) q.set("inspect", prefs.inspect ? "1" : "0");
  const query = q.toString().replace(/%2C/g, ",");
  return (path || "/") + (query ? `?${query}` : "");
}

/**
 * The app's own path inside the base path it is served under: `/maps/place/x` → `/place/x` when
 * apps.unmap.dev builds it with `BASE_PATH=/maps`. With no base path (`pnpm dev`, your own deploy)
 * the path is unchanged.
 */
export function stripBase(pathname: string, base: string): string {
  if (!base) return pathname;
  if (pathname === base) return "/";
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/** A `formatUrl` result under the base path; the root keeps its slash (`/maps/`), as the export serves it. */
export function withBase(url: string, base: string): string {
  return base ? `${base}${url}` : url;
}

/** Whether two views are the same screen, so moving between them replaces history rather than pushing. */
export function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
