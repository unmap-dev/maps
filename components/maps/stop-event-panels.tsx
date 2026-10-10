"use client";

import { AccessibilityIcon, ClockIcon, FileTextIcon, InfoIcon, NavigationIcon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import type { RoadEvent } from "@unmap/sdk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Marker } from "@/components/ui/marker-popup";
import { Row } from "@/components/maps/place-panel";
import { BuiltFrom, PanelHeader, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { eventCache, stopCache } from "@/components/maps/live-layers";
import { unmap } from "@/lib/api";
import { errorMessage, useAsync } from "@/lib/use-async";
import type { LngLat } from "@/lib/url-state";

const clock = (iso: string) => iso.slice(11, 16);
function minutesUntil(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.round((t - Date.now()) / 60000) : null;
}

/** A transit stop: `transit.getStop` and the next scheduled departures, in parallel. */
export function StopPanel({
  id,
  sheet,
  onSheet,
  onClose,
  onDirections,
  onReach,
}: {
  id: string;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onDirections: (at: LngLat, label: string) => void;
  onReach: (at: LngLat, label: string) => void;
}) {
  const state = useAsync(id, async (signal) => {
    const [stop, deps] = await Promise.all([unmap.transit.getStop(id, signal), unmap.transit.departures(id, { limit: 8, signal })]);
    return { stop: stop.data, departures: deps.data };
  });
  const cached = stopCache.get(id);
  const stop = state.status === "done" ? state.data.stop : cached;
  return (
    <SidePanel
      label={stop?.name ?? "Transit stop"}
      sheet={sheet}
      onSheet={onSheet}
      header={<PanelHeader onClose={onClose} title={stop?.name ?? "Transit stop"} subtitle={stop ? `Stop${stop.code ? ` ${stop.code}` : ""} · ${stop.feed}` : undefined} />}
      footer={<BuiltFrom items={["marker-popup"]} />}
    >
      {stop ? <Marker lngLat={stop.coordinates} /> : null}
      <div className="grid gap-3 px-4 pb-4">
        {stop ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onDirections(stop.coordinates, stop.name)}>
              <NavigationIcon data-icon="inline-start" />
              Directions
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReach(stop.coordinates, stop.name)}>
              <TimerIcon data-icon="inline-start" />
              Travel area
            </Button>
            {stop.wheelchair_boarding === 1 ? (
              <Badge variant="outline">
                <AccessibilityIcon data-icon="inline-start" />
                Wheelchair boarding
              </Badge>
            ) : null}
          </div>
        ) : null}
        {state.status === "error" ? (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Couldn&apos;t load this stop</AlertTitle>
            <AlertDescription>{errorMessage(state.error)}</AlertDescription>
          </Alert>
        ) : state.status !== "done" ? (
          <Skeleton className="h-40" />
        ) : state.data.departures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No more scheduled departures in the next window.</p>
        ) : (
          <Table aria-label="Scheduled departures">
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Toward</TableHead>
                <TableHead className="text-right">Leaves</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.departures.map((d) => {
                const mins = minutesUntil(d.departure);
                return (
                  <TableRow key={`${d.trip_id}-${d.stop_sequence}`}>
                    <TableCell>
                      <Badge variant="secondary">{d.route_id}</Badge>
                    </TableCell>
                    <TableCell>{d.headsign ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mins != null && mins >= 0 && mins < 60 ? `${mins} min ` : ""}
                      <span className="text-muted-foreground">{clock(d.departure)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Alert>
          <ClockIcon />
          <AlertTitle>Scheduled, not live</AlertTitle>
          <AlertDescription>These times come from the agency&apos;s published timetable (GTFS).</AlertDescription>
        </Alert>
      </div>
    </SidePanel>
  );
}

const TYPE_LABEL: Record<string, string> = {
  closure: "Closure",
  incident: "Incident",
  construction: "Construction",
  weather: "Weather",
  restriction: "Restriction",
  ferry: "Ferry",
  hazard: "Hazard",
  special_event: "Special event",
  unknown: "Road event",
};

/** One point of a GeoJSON geometry, for the pin. */
function anchorOf(event: RoadEvent): LngLat | null {
  let c: unknown = event.geometry?.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[Math.floor(c.length / 2)];
  return Array.isArray(c) && typeof c[0] === "number" ? (c as LngLat) : null;
}

/** Finds one event: the road layer's copy, or else the three feeds around a point. There is no single-event endpoint. */
async function findEvent(id: string, near: LngLat): Promise<RoadEvent | null> {
  const cached = eventCache.get(id);
  if (cached) return cached;
  const all = await Promise.allSettled([unmap.roads.incidents({ near, radius: 100000 }), unmap.roads.closures({ near, radius: 100000 }), unmap.roads.conditions({ near, radius: 100000 })]);
  for (const r of all) if (r.status === "fulfilled") for (const e of r.value.data) eventCache.set(e.id, e);
  return eventCache.get(id) ?? null;
}

/** A road event: incidents, closures and conditions share one shape. */
export function EventPanel({ id, near, sheet, onSheet, onClose }: { id: string; near: LngLat; sheet: SheetSize; onSheet: () => void; onClose: () => void }) {
  const state = useAsync(id, () => findEvent(id, near));
  const event = state.status === "done" ? state.data : (eventCache.get(id) ?? null);
  const at = event ? anchorOf(event) : null;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null);
  return (
    <SidePanel
      label="Road event"
      sheet={sheet}
      onSheet={onSheet}
      header={<PanelHeader onClose={onClose} title={event ? (event.headline ?? `${TYPE_LABEL[event.type] ?? "Road event"}${event.roads[0] ? ` · ${event.roads[0].name}` : ""}`) : "Road event"} subtitle={event ? `${TYPE_LABEL[event.type]} · ${event.source}` : undefined} />}
      footer={<BuiltFrom items={["geojson-layer"]} />}
    >
      {at ? <Marker lngLat={at} /> : null}
      <div className="grid gap-3 px-4 pb-4">
        {!event && state.status === "loading" ? (
          <Skeleton className="h-32" />
        ) : !event ? (
          <p className="text-sm text-muted-foreground">This event is no longer reported. Turn on Road events in Layers to see what is current.</p>
        ) : (
          <>
            <p className="text-sm">{event.description}</p>
            <div>
              {event.roads.map((r, i) => (
                <Row key={i} icon={<TriangleAlertIcon />} action={r.closed ? <Badge variant="destructive">Closed</Badge> : undefined}>
                  {r.name}
                  <span className="block text-xs text-muted-foreground">
                    {[r.direction === "both" ? "both directions" : r.direction !== "unknown" ? `${r.direction}bound` : null, r.from && r.to ? `${r.from} to ${r.to}` : null, r.condition !== "unknown" ? r.condition.replace(/_/g, " ") : null].filter(Boolean).join(" · ")}
                  </span>
                </Row>
              ))}
              {event.ends_at ? (
                <Row icon={<ClockIcon />}>
                  {date(event.ends_at)}
                  <span className="block text-xs text-muted-foreground">Expected to end</span>
                </Row>
              ) : null}
              <Row icon={<FileTextIcon />}>
                <span className="font-mono text-xs">{event.id}</span>
                <span className="block text-xs text-muted-foreground">
                  Severity {event.severity} · updated {date(event.source_updated_at ?? event.unmap_updated_at)}
                </span>
              </Row>
            </div>
            <Alert>
              <NavigationIcon />
              <AlertTitle>Routes see this too</AlertTitle>
              <AlertDescription>A route that passes a closure lists it in its warnings, on every travel mode.</AlertDescription>
            </Alert>
          </>
        )}
      </div>
    </SidePanel>
  );
}
