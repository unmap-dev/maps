"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoadEvent, TransitStop } from "@unmap/sdk";
import { GeoJSONLayer } from "@/components/ui/geojson-layer";
import { tokenColor } from "@/lib/map-layers";
import { useMap } from "@/lib/map-context";
import { unmap } from "@/lib/api";

/** Re-runs `load` when the map settles, with the view it settled on. Debounced, cancelled when superseded. */
function useSettledView<T>(enabled: boolean, minZoom: number, load: (view: { center: [number, number]; bbox: [number, number, number, number] }, signal: AbortSignal) => Promise<T>): T | null {
  const map = useMap();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!map || !enabled) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastKey = "";
    const run = () => {
      if (map.getZoom() < minZoom) {
        setData(null);
        lastKey = "";
        return;
      }
      const b = map.getBounds(), c = map.getCenter();
      // Rounded so a nudge of the map does not refetch.
      const key = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(2)).join(",");
      if (key === lastKey) return;
      lastKey = key;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      load({ center: [c.lng, c.lat], bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] }, signal).then(
        (d) => !signal.aborted && setData(d),
        () => {},
      );
    };
    const onMove = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 400);
    };
    timer = setTimeout(run, 0);
    map.on("moveend", onMove);
    return () => {
      map.off("moveend", onMove);
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
    // `load` is stable in intent; the layer toggles and zoom floor are what restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, minZoom]);
  return enabled ? data : null;
}

/** Stops seen so far, so the stop panel can show a name before its own call returns. */
export const stopCache = new Map<string, TransitStop>();

/** Transit stops around the map centre, from `transit.nearbyStops`, at street zooms. */
export function TransitStopsLayer({ enabled, onPick, dark }: { enabled: boolean; onPick: (stop: TransitStop) => void; dark: boolean }) {
  const map = useMap();
  const stops = useSettledView(enabled, 13.5, async ({ center }, signal) => (await unmap.transit.nearbyStops(center, { radius: 1500, limit: 200, signal })).data);
  const data = useMemo(() => {
    stops?.forEach((s) => stopCache.set(s.id, s));
    return {
      type: "FeatureCollection",
      features: (stops ?? []).map((s) => ({ type: "Feature", properties: { id: s.id, name: s.name }, geometry: { type: "Point", coordinates: s.coordinates } })),
    };
  }, [stops]);
  if (!enabled || !stops) return null;
  const fg = tokenColor(map, "--foreground") ?? "#111";
  const bg = tokenColor(map, "--background") ?? "#fff";
  return (
    <GeoJSONLayer
      key={dark ? "dark" : "light"}
      id="app-transit"
      data={data}
      promoteId="id"
      fillPaint={false}
      linePaint={false}
      circlePaint={{ "circle-radius": 4.5, "circle-color": bg, "circle-stroke-color": fg, "circle-stroke-width": 2 }}
      onClick={(e) => {
        const stop = stopCache.get(String(e.feature.properties.id));
        if (stop) onPick(stop);
      }}
      beforeId={null}
    />
  );
}

/** Road events seen so far, by id, for the event panel. */
export const eventCache = new Map<string, RoadEvent>();

/** Incidents, closures and road conditions in view: three calls in parallel, at regional zooms. */
export function RoadEventsLayer({ enabled, onPick, dark }: { enabled: boolean; onPick: (event: RoadEvent) => void; dark: boolean }) {
  const map = useMap();
  const events = useSettledView(enabled, 8, async ({ bbox }, signal) => {
    void signal;
    const all = await Promise.allSettled([unmap.roads.incidents({ bbox }), unmap.roads.closures({ bbox }), unmap.roads.conditions({ bbox })]);
    const seen = new Map<string, RoadEvent>();
    for (const r of all) if (r.status === "fulfilled") for (const e of r.value.data) seen.set(e.id, e);
    return [...seen.values()];
  });
  const data = useMemo(() => {
    events?.forEach((e) => eventCache.set(e.id, e));
    return {
      type: "FeatureCollection",
      features: (events ?? [])
        .filter((e) => e.geometry)
        .map((e) => ({ type: "Feature", properties: { id: e.id, kind: e.type === "closure" || e.roads.some((r) => r.closed) ? "closure" : e.type === "construction" ? "construction" : "other" }, geometry: e.geometry })),
    };
  }, [events]);
  if (!enabled || !events) return null;
  const closure = tokenColor(map, "--destructive") ?? "#dc2626";
  const work = tokenColor(map, "--chart-4") ?? "#f59e0b";
  const other = tokenColor(map, "--chart-2") ?? "#0ea5e9";
  const color = ["match", ["get", "kind"], "closure", closure, "construction", work, other];
  return (
    <GeoJSONLayer
      key={dark ? "dark" : "light"}
      id="app-roads"
      data={data}
      promoteId="id"
      fillPaint={{ "fill-color": color, "fill-opacity": 0.2 }}
      linePaint={{ "line-color": color, "line-width": 4, "line-opacity": 0.9 }}
      circlePaint={{ "circle-radius": 6, "circle-color": color, "circle-stroke-color": tokenColor(map, "--background") ?? "#fff", "circle-stroke-width": 1.5 }}
      onClick={(e) => {
        const event = eventCache.get(String(e.feature.properties.id));
        if (event) onPick(event);
      }}
      beforeId={null}
    />
  );
}
