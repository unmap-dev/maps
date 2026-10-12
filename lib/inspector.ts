/**
 * The API inspector's data: every request the page makes to the gateway, recorded as it happens,
 * and the SDK call that would make it.
 *
 * It records at the `fetch` level, not inside the app's own SDK instance, because half the calls
 * come from registry items (the geocoder, the elevation profile) that build their own clients.
 * What the inspector shows is therefore what really went over the wire: the real path, status and
 * latency, and the real response body. Only the SDK snippet is derived.
 *
 * Tile, glyph and sprite bytes are left out: there are hundreds of them, they never touch compute,
 * and they are the map's business rather than the app's.
 */

export interface ApiCall {
  id: number;
  method: string;
  /** Gateway path, e.g. `/geocode/autocomplete`. */
  path: string;
  /** Query parameters in order, with the API key removed. */
  params: [string, string][];
  /** Parsed JSON request body, for POSTs. */
  body?: unknown;
  /** `performance.now()` when the request started. */
  startedAt: number;
  status: number | null;
  ms: number | null;
  /** Parsed JSON response, when it was JSON. */
  result?: unknown;
  error?: string;
}

const SKIPPED = /^\/(tiles|glyphs|sprite|terrain|contours)\/|^\/(layers|byod)\/[^/]+\/\d+\/|^\/styles\/[^/]+\/sprite/;

/** True for requests the inspector lists: gateway calls that are not tile-like bytes. */
export function isRecorded(url: URL, gateway: URL): boolean {
  return url.origin === gateway.origin && !SKIPPED.test(url.pathname);
}

/** The query as listed: in order, `key` removed (it is shown as a header instead). */
export function visibleParams(url: URL): [string, string][] {
  return [...url.searchParams.entries()].filter(([k]) => k !== "key");
}

type Listener = (calls: readonly ApiCall[]) => void;
const MAX_CALLS = 80;
let calls: ApiCall[] = [];
let seq = 0;
const listeners = new Set<Listener>();
let installed: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener(calls);
}

function update(id: number, patch: Partial<ApiCall>) {
  calls = calls.map((c) => (c.id === id ? { ...c, ...patch } : c));
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(calls);
  return () => listeners.delete(listener);
}

export function clearCalls() {
  calls = [];
  emit();
}

/** Wrap `window.fetch` once. Returns an uninstall function (used by tests). */
export function installRecorder(gatewayUrl: string): () => void {
  if (installed || typeof window === "undefined") return installed ?? (() => {});
  const gateway = new URL(gatewayUrl);
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    } catch {
      return original(input, init);
    }
    if (!isRecorded(url, gateway)) return original(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }
    const call: ApiCall = { id: ++seq, method, path: url.pathname, params: visibleParams(url), body, startedAt: performance.now(), status: null, ms: null };
    calls = [call, ...calls].slice(0, MAX_CALLS);
    emit();
    try {
      const res = await original(input, init);
      const ms = Math.round(performance.now() - call.startedAt);
      update(call.id, { status: res.status, ms });
      if ((res.headers.get("content-type") ?? "").includes("json")) {
        res
          .clone()
          .json()
          .then((result: unknown) => update(call.id, { result }))
          .catch(() => {});
      }
      return res;
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      update(call.id, { ms: Math.round(performance.now() - call.startedAt), error: aborted ? "Cancelled" : String(error) });
      throw error;
    }
  };
  installed = () => {
    window.fetch = original;
    installed = null;
  };
  return installed;
}

/** Calls started within this window of each other are shown as one parallel group. */
const GROUP_WINDOW_MS = 80;

export interface CallGroup {
  calls: ApiCall[];
  /** Wall time: the slowest call, since they ran together. */
  ms: number | null;
}

/** Newest first, as `calls` is. */
export function groupCalls(list: readonly ApiCall[]): CallGroup[] {
  const groups: CallGroup[] = [];
  for (const call of list) {
    const group = groups[groups.length - 1];
    const anchor = group?.calls[group.calls.length - 1];
    if (group && anchor && Math.abs(anchor.startedAt - call.startedAt) <= GROUP_WINDOW_MS) group.calls.push(call);
    else groups.push({ calls: [call], ms: null });
  }
  for (const group of groups) {
    group.calls.reverse();
    const done = group.calls.map((c) => c.ms).filter((m): m is number => m != null);
    group.ms = done.length === group.calls.length ? Math.max(...done) : null;
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Describing a call: the SDK line, the curl line, the registry item behind it.
// ---------------------------------------------------------------------------------------------

export interface CallDescription {
  /** Human name for the call, e.g. "Autocomplete". */
  title: string;
  /** The `@unmap/sdk` call that makes this request. */
  sdk: string;
  /** The registry item that makes or draws it, when one does. */
  item?: string;
  /** A fact worth knowing about this call. */
  note?: string;
}

const str = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const pair = (s: string | undefined) => {
  const nums = (s ?? "").split(",").map(Number);
  // Six decimals is ~10 cm; anything past it is floating-point noise, not information.
  return nums.length === 2 && nums.every(Number.isFinite) ? `[${Number(nums[0]!.toFixed(6))}, ${Number(nums[1]!.toFixed(6))}]` : "[lng, lat]";
};

/** `{ a: 1, b: 'x' }` from the entries that are set, or null when none are. */
function objectLiteral(entries: [string, string | undefined][]): string | null {
  const set = entries.filter(([, v]) => v != null && v !== "");
  return set.length ? `{ ${set.map(([k, v]) => `${k}: ${v}`).join(", ")} }` : null;
}

/** A trailing options argument: `, { … }`, broken over lines when long; `''` when empty. */
function opts(entries: [string, string | undefined][]): string {
  const set = entries.filter(([, v]) => v != null && v !== "");
  const literal = objectLiteral(set);
  if (!literal) return "";
  return literal.length > 56 ? `, {\n  ${set.map(([k, v]) => `${k}: ${v}`).join(",\n  ")},\n}` : `, ${literal}`;
}

const ROAD_METHODS: Record<string, [string, string]> = {
  "/incidents": ["incidents", "Road incidents"],
  "/closures": ["closures", "Road closures"],
  "/road-conditions": ["conditions", "Road conditions"],
};

export function describeCall(call: Pick<ApiCall, "method" | "path" | "params" | "body">): CallDescription {
  const p = new Map(call.params);
  const get = (k: string) => p.get(k);
  const q = (k: string) => (get(k) != null ? str(get(k)!) : undefined);
  const n = (k: string) => get(k);
  const path = call.path;
  let m: RegExpExecArray | null;

  if (path === "/geocode/autocomplete" || path === "/geocode/search") {
    const fn = path.endsWith("search") ? "search" : "autocomplete";
    return {
      title: fn === "search" ? "Search" : "Autocomplete",
      sdk: `await unmap.geocoder.${fn}(${q("q") ?? "''"}${opts([["focus", get("focus") ? pair(get("focus")) : undefined], ["limit", n("limit")], ["lang", q("lang")]])})`,
      item: "geocoder",
      note: "Every language in a place's names is indexed, so a French or Inuktitut name finds the same record.",
    };
  }
  if (path === "/geocode/reverse") {
    const [lng, lat] = (get("near") ?? "lng,lat").split(",");
    const include = get("include")?.split(",").map(str).join(", ");
    return {
      title: "Reverse geocode",
      sdk: `await unmap.geocoder.reverse(${lng}, ${lat}${opts([["lang", q("lang")], ["limit", n("limit")], ["include", include ? `[${include}]` : undefined]])})`,
      note: include ? "include: ['treaties'] adds treaty context to the result, from CIRNAC's published treaty data." : undefined,
    };
  }
  if (path === "/identify") {
    const layers = get("layers")?.split(",").map(str).join(", ");
    return {
      title: "Identify",
      sdk: `await unmap.identify({\n  at: ${pair(get("at"))},${layers ? `\n  layers: [${layers}],` : ""}\n})`,
      note: get("layers")?.includes("survey.") ? "Survey layers need the legal-land add-on: a key without it gets 403 for the whole request, so ask for them separately." : undefined,
    };
  }
  if (path === "/places/nearby") {
    return {
      title: "Nearby places",
      // Several categories ride the wire comma-joined; the SDK takes them as an array.
      sdk: `await unmap.places.nearby(${get("category")?.includes(",") ? `[${get("category")!.split(",").map(str).join(", ")}]` : (q("category") ?? "''")}${opts([["near", get("near") ? pair(get("near")) : undefined], ["radius", n("radius")], ["limit", n("limit")], ["lang", q("lang")]])})`,
    };
  }
  if ((m = /^\/places\/([^/]+)\/feedback$/.exec(path)))
    return { title: "Feedback", sdk: `await unmap.feedback.aboutPlace(${str(decodeURIComponent(m[1]!))}, { category })`, note: "Feedback is never metered." };
  if ((m = /^\/places\/([^/]+)$/.exec(path)) && m[1] !== "search" && m[1] !== "nearby")
    return {
      title: "Place",
      sdk: `await unmap.places.get(${str(decodeURIComponent(m[1]!))}${opts([["lang", q("lang")]])})`,
      item: "marker-popup",
      note: "Hours, phone numbers and photos are absent from the response, not null: unmap does not carry them.",
    };
  if (path === "/elevation") {
    const points = (get("points") ?? "").split("|");
    return points.length > 1
      ? { title: "Elevation profile", sdk: `await unmap.elevation.get(line) // ${points.length} points`, item: "elevation-profile" }
      : { title: "Elevation", sdk: `await unmap.elevation.get(${pair(points[0])})` };
  }
  if (path === "/timezone")
    return { title: "Time zone", sdk: `await unmap.timezone.lookup([${get("lon") ?? "lng"}, ${get("lat") ?? "lat"}])` };
  if (path === "/route") {
    const body = (call.body ?? {}) as Record<string, unknown>;
    const val = (k: string) => get(k) ?? (body[k] != null ? String(body[k]) : undefined);
    const mode = val("mode");
    const avoid = val("avoid")?.split(",").map(str).join(", ");
    const truck = ["height", "weight"].map((k) => [k, val(k)] as [string, string | undefined]).filter(([, v]) => v);
    const options = objectLiteral([
      ["mode", mode ? str(mode) : undefined],
      ["departAt", val("depart_at") ? "new Date()" : undefined],
      ["useHills", val("use_hills")],
      ["avoid", avoid ? `[${avoid}]` : undefined],
      ["truck", truck.length ? `{ ${truck.map(([k, v]) => `${k}: ${v}`).join(", ")} }` : undefined],
      ["steps", val("steps")],
      ["lang", val("lang") ? str(val("lang")!) : undefined],
    ]);
    return {
      title: "Route",
      sdk: `await unmap.router.route(\n  ${pair(val("from"))},\n  ${pair(val("to"))},${options ? `\n  ${options},` : ""}\n)`,
      item: val("steps") === "true" ? "route-steps" : "route-line",
      note:
        mode === "auto" || mode === "truck"
          ? "use_hills is refused on driving modes: Valhalla's auto and truck costing have no grade term."
          : mode === "transit"
            ? "Transit routing covers feeds marked routing-ready. unmap.coverage lists them."
            : "Grades come from unmap's national elevation model, baked into the routing graph.",
    };
  }
  if (path === "/isochrone") {
    return {
      title: "Isochrone",
      sdk: `await unmap.router.isochrone(${pair(get("near"))}, {\n  mode: ${q("mode") ?? "'auto'"},\n  minutes: [${(get("minutes") ?? "").split(",").join(", ")}],\n})`,
      item: "geojson-layer",
    };
  }
  if (path === "/transit/stops")
    return { title: "Transit stops", sdk: `await unmap.transit.nearbyStops(${pair(get("near"))}${opts([["radius", n("radius")], ["limit", n("limit")]])})` };
  if ((m = /^\/transit\/stops\/([^/]+)\/departures$/.exec(path)))
    return {
      title: "Departures",
      sdk: `await unmap.transit.departures(${str(decodeURIComponent(m[1]!))}${opts([["limit", n("limit")]])})`,
      note: "Scheduled times from the agency's GTFS feed, not realtime predictions.",
    };
  if ((m = /^\/transit\/stops\/([^/]+)$/.exec(path)))
    return { title: "Transit stop", sdk: `await unmap.transit.getStop(${str(decodeURIComponent(m[1]!))})` };
  const road = ROAD_METHODS[path];
  if (road) {
    const bbox = get("bbox")?.split(",").map(Number).join(", ");
    return {
      title: road[1],
      sdk: `await unmap.roads.${road[0]}(${bbox ? `{ bbox: [${bbox}] }` : ""})`,
      note: "Road events cover the provinces whose feeds unmap polls. unmap.coverage says which.",
    };
  }
  if ((m = /^\/styles\/([^/]+?)(\.json)?$/.exec(path))) {
    const style = m[1]!;
    const mode = get("mode");
    return {
      title: "Map style",
      sdk: `<Map apiKey={key} style=${JSON.stringify(style)}${mode ? ` mode=${JSON.stringify(mode)}` : ""}${get("lang") ? ` lang=${JSON.stringify(get("lang"))}` : ""}${get("overlays") ? ` overlays={${JSON.stringify(get("overlays")!.split(","))}}` : ""} />`,
      item: "map",
      note: "Changing style, mode or language swaps the style in place: the camera, markers and your own layers stay.",
    };
  }
  return { title: path, sdk: `await fetch(\`\${gateway}${path}\`)` };
}

/** The same request as curl, with the key as a header so it is never pasted into a shell history. */
export function curlOf(call: Pick<ApiCall, "method" | "path" | "params" | "body">, gateway: string): string {
  const query = new URLSearchParams(call.params).toString().replace(/%2C/g, ",").replace(/%7C/g, "|");
  const url = `${gateway}${call.path}${query ? `?${query}` : ""}`;
  const lines = [`curl ${call.method !== "GET" ? `-X ${call.method} ` : ""}"${url}"`, `  -H "Authorization: Bearer $UNMAP_API_KEY"`];
  if (call.body !== undefined) lines.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(call.body)}'`);
  return lines.join(" \\\n");
}

/** A response trimmed for display: long arrays cut to their first items, with a count. */
export function abridge(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const head = value.slice(0, depth === 0 ? 3 : 2).map((v) => abridge(v, depth + 1));
    return value.length > head.length ? [...head, `… ${value.length - head.length} more`] : head;
  }
  if (value && typeof value === "object") {
    if (depth > 4) return "{…}";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "coordinates" && Array.isArray(v) && v.length > 4 ? `[… ${v.length} positions]` : abridge(v, depth + 1)]));
  }
  return value;
}
