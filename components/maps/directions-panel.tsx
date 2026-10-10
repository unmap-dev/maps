"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpDownIcon,
  BikeIcon,
  CarIcon,
  CircleDotIcon,
  FootprintsIcon,
  InfoIcon,
  MapPinIcon,
  TrainFrontIcon,
  TriangleAlertIcon,
  TruckIcon,
  XIcon,
} from "lucide-react";
import type { GeocodeResult } from "@unmap/geocoding";
import type { RouteResult } from "@unmap/routing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ElevationProfile } from "@/components/ui/elevation-profile";
import { Geocoder } from "@/components/ui/geocoder";
import { Marker } from "@/components/ui/marker-popup";
import { RouteLine } from "@/components/ui/route-line";
import { useMap } from "@/lib/map-context";
import { BuiltFrom, CloseButton, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { unmap } from "@/lib/api";
import { API_KEY, GATEWAY } from "@/lib/config";
import { fmtCoord, fmtDistance, fmtDuration } from "@/lib/format";
import { errorMessage, useAsync } from "@/lib/use-async";
import { TRAVEL_MODES, type Lang, type LngLat, type TravelMode, type Waypoint } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const MODE_META: Record<TravelMode, { label: string; icon: typeof CarIcon }> = {
  auto: { label: "Drive", icon: CarIcon },
  transit: { label: "Transit", icon: TrainFrontIcon },
  bicycle: { label: "Bike", icon: BikeIcon },
  pedestrian: { label: "Walk", icon: FootprintsIcon },
  truck: { label: "Truck", icon: TruckIcon },
};

export interface ResolvedPoint {
  label: string;
  at: LngLat;
}

/** A waypoint as a name and a position: `places.get` for a place, a reverse geocode for a point. */
export async function resolveWaypoint(w: Waypoint, lang: Lang, signal: AbortSignal): Promise<ResolvedPoint> {
  if ("place" in w) {
    const place = (await unmap.places.get(w.place, { lang, signal })).data;
    return { label: place.name, at: place.coordinates };
  }
  const near = await unmap.geocoder.reverse(w.at[0], w.at[1], { lang, limit: 1, signal }).catch(() => []);
  return { label: near[0]?.name ?? fmtCoord(w.at), at: w.at };
}

const waypointKey = (w: Waypoint | null) => (!w ? null : "place" in w ? w.place : w.at.join(","));

/** A geocoder result as a waypoint: a place when it is one, else its point. */
export function waypointOf(r: GeocodeResult): Waypoint {
  return r.layer === "poi" ? { place: `um:place:${r.id}` } : { at: [r.lng, r.lat] };
}

function WaypointField({
  role,
  waypoint,
  lang,
  onChange,
}: {
  role: "from" | "to";
  waypoint: Waypoint | null;
  lang: Lang;
  onChange: (w: Waypoint | null) => void;
}) {
  const key = waypointKey(waypoint);
  const state = useAsync(key ? `${key}|${lang}` : null, (signal) => resolveWaypoint(waypoint!, lang, signal));
  const label = role === "from" ? "Starting point" : "Destination";
  return (
    <Field data-invalid={state.status === "error" || undefined}>
      <FieldTitle>{label}</FieldTitle>
      {!waypoint ? (
        <Geocoder apiKey={API_KEY} gateway={GATEWAY} lang={lang} proximity="map" placeholder={label} onSelect={(r) => onChange(waypointOf(r))} className="min-w-0" />
      ) : (
        <InputGroup>
          <InputGroupInput readOnly aria-label={label} aria-invalid={state.status === "error" || undefined} value={state.status === "done" ? state.data.label : state.status === "error" ? "Point unavailable" : "Finding point…"} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)}><XIcon /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </Field>
  );
}

function TransitLegs({ route }: { route: RouteResult }) {
  if (!route.legs?.length) return null;
  return (
    <ol className="grid gap-2">
      {route.legs.map((leg, i) =>
        leg.mode === "pedestrian" ? (
          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <FootprintsIcon className="size-4" aria-hidden />
            Walk {fmtDuration(leg.durationSeconds)} · {fmtDistance(leg.distanceMeters)}
          </li>
        ) : (
          <li key={i} className="grid gap-1 rounded-md border p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded px-1.5 text-xs font-semibold"
                style={{ background: leg.route?.color ? `#${leg.route.color.replace(/^#/, "")}` : "var(--secondary)", color: leg.route?.textColor ? `#${leg.route.textColor.replace(/^#/, "")}` : "var(--secondary-foreground)" }}
              >
                {leg.route?.shortName ?? leg.route?.longName ?? "Transit"}
              </span>
              {leg.headsign ? <span>toward {leg.headsign}</span> : null}
            </div>
            <div className="text-xs text-muted-foreground">
              {leg.stops[0]?.name}
              {leg.departure ? ` · ${leg.departure.slice(11, 16)}` : ""} → {leg.stops[leg.stops.length - 1]?.name}
              {leg.arrival ? ` · ${leg.arrival.slice(11, 16)}` : ""} · {Math.max(0, leg.stops.length - 1)} {leg.stops.length === 2 ? "stop" : "stops"}
            </div>
            {leg.agency ? <div className="text-xs text-muted-foreground">{leg.agency.name}</div> : null}
          </li>
        ),
      )}
    </ol>
  );
}

export interface DirectionsProps {
  from: Waypoint | null;
  to: Waypoint | null;
  mode: TravelMode;
  hills: number;
  avoid: string[];
  lang: Lang;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onChange: (patch: { from?: Waypoint | null; to?: Waypoint | null; mode?: TravelMode; hills?: number; avoid?: string[] }) => void;
  padding: () => { top: number; bottom: number; left: number; right: number };
}

/**
 * Directions: `router.route` for the chosen mode, drawn with the registry's route line, and an
 * elevation profile under the walking and cycling modes, where grade changes the time.
 */
export function DirectionsPanel({ from, to, mode, hills, avoid, lang, sheet, onSheet, onClose, onChange, padding }: DirectionsProps) {
  const map = useMap();
  const [truck, setTruck] = useState({ height: 4.1, weight: 36 });
  // The slider's value while it is dragged; the committed value is `hills`, from the URL.
  const [draft, setDraft] = useState<{ base: number; value: number } | null>(null);
  const hillsDraft = draft && draft.base === hills ? draft.value : hills;

  const fromKey = waypointKey(from), toKey = waypointKey(to);
  const ends = useAsync(fromKey && toKey ? `${fromKey}|${toKey}|${lang}` : null, (signal) =>
    Promise.all([resolveWaypoint(from!, lang, signal), resolveWaypoint(to!, lang, signal)]),
  );
  const pts = ends.status === "done" ? ends.data : null;
  const grade = mode === "bicycle" || mode === "pedestrian";
  const driving = mode === "auto" || mode === "truck";
  const routeKey = pts
    ? JSON.stringify([pts[0].at, pts[1].at, mode, grade ? hills : null, driving ? avoid : null, mode === "truck" ? truck : null])
    : null;
  const route = useAsync(routeKey, (signal) => {
    const [a, b] = pts!;
    if (mode === "transit") return unmap.router.route(a.at, b.at, { mode: "transit", departAt: new Date(), signal });
    return unmap.router.route(a.at, b.at, {
      mode,
      ...(grade ? { useHills: hills } : {}),
      ...(driving && avoid.length ? { avoid: avoid as ("tolls" | "highways")[] } : {}),
      ...(mode === "truck" ? { truck } : {}),
      signal,
    });
  });
  const result = route.status === "done" ? route.data : null;

  useEffect(() => {
    if (!map || !result) return;
    const c = result.geometry.coordinates;
    const lngs = c.map((p) => p[0]), lats = c.map((p) => p[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: padding(), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, result]);

  const toggleAvoid = (k: "tolls" | "highways", on: boolean) => onChange({ avoid: on ? [...avoid, k] : avoid.filter((a) => a !== k) });

  return (
    <SidePanel
      label="Directions"
      flush
      sheet={sheet}
      onSheet={onSheet}
      header={
        <div className="flex shrink-0 items-start gap-2 px-3 pt-2 lg:pt-3">
          <ToggleGroup value={[mode]} onValueChange={(v) => v[0] && onChange({ mode: v[0] as TravelMode })} aria-label="Travel mode" className="grid w-full flex-1 grid-cols-5 gap-1">
            {TRAVEL_MODES.map((m) => {
              const { label, icon: Icon } = MODE_META[m];
              return (
                <ToggleGroupItem key={m} value={m} className="h-auto flex-col gap-1 py-2">
                  <Icon />
                  <span className="text-xs">{label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <CloseButton onClick={onClose} label="Close directions" />
        </div>
      }
      footer={<BuiltFrom items={grade ? ["geocoder", "route-line", "elevation-profile"] : ["geocoder", "route-line"]} />}
    >
      {pts ? (
        <>
          <Marker lngLat={pts[1].at} />
          <Marker lngLat={pts[0].at} markerContent={<span className="block size-3.5 rounded-full border-[3px] border-primary bg-background shadow" />} />
        </>
      ) : null}
      {result ? <RouteLine id="app-route" coordinates={result.geometry.coordinates as [number, number][]} /> : null}

      <div className="grid gap-3 px-4 pt-2 pb-4">
        <FieldGroup className="grid grid-cols-[1rem_minmax(0,1fr)_2rem] items-end gap-x-2 gap-y-3">
          <CircleDotIcon className="mb-2 size-4 text-muted-foreground" aria-hidden />
          <WaypointField role="from" waypoint={from} lang={lang} onChange={(w) => onChange({ from: w })} />
          <Button variant="ghost" size="icon-sm" className="row-span-2" aria-label="Swap start and destination" onClick={() => onChange({ from: to, to: from })}>
            <ArrowUpDownIcon />
          </Button>
          <MapPinIcon className="mb-2 size-4 text-muted-foreground" aria-hidden />
          <WaypointField role="to" waypoint={to} lang={lang} onChange={(w) => onChange({ to: w })} />
        </FieldGroup>
        <p className="text-xs text-muted-foreground">Search for each point, or select it on the map.</p>

        {grade ? (
          <Field>
            <FieldLabel htmlFor="hill-preference">Hill preference</FieldLabel>
            <Slider id="hill-preference" min={0} max={1} step={0.1} value={[hillsDraft]} onValueChange={(v) => setDraft({ base: hills, value: Array.isArray(v) ? v[0]! : (v as number) })} onValueCommitted={(v) => onChange({ hills: Array.isArray(v) ? v[0]! : (v as number) })} aria-label="Hill preference" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Avoid hills</span>
              <span>Allow hills</span>
            </div>
          </Field>
        ) : null}
        {driving ? (
          <FieldGroup className="flex-row flex-wrap gap-x-5 gap-y-2">
            {(["tolls", "highways"] as const).map((k) => (
              <Field key={k} orientation="horizontal" className="w-auto">
                <Switch id={`avoid-${k}`} size="sm" checked={avoid.includes(k)} onCheckedChange={(on) => toggleAvoid(k, on)} />
                <FieldLabel htmlFor={`avoid-${k}`}>Avoid {k}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        ) : null}
        {mode === "truck" ? (
          <FieldGroup className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="truck-height">Height (m)</FieldLabel>
              <Input id="truck-height" type="number" step={0.1} min={1} max={6} required defaultValue={truck.height} onBlur={(e) => { if (e.currentTarget.reportValidity()) setTruck((t) => ({ ...t, height: Number(e.currentTarget.value) })); }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="truck-weight">Weight (t)</FieldLabel>
              <Input id="truck-weight" type="number" step={1} min={1} max={80} required defaultValue={truck.weight} onBlur={(e) => { if (e.currentTarget.reportValidity()) setTruck((t) => ({ ...t, weight: Number(e.currentTarget.value) })); }} />
            </Field>
          </FieldGroup>
        ) : null}
        {mode === "transit" ? <p className="text-xs text-muted-foreground">Leaving now. Scheduled transit routes are available in supported service areas.</p> : null}
      </div>

      <Separator />
      <div className="grid gap-3 px-4 py-4">
        {ends.status === "error" ? (
          <Alert variant="destructive"><InfoIcon /><AlertTitle>Couldn&apos;t find a trip point</AlertTitle><AlertDescription>{errorMessage(ends.error)} Clear the unavailable point and search again.</AlertDescription></Alert>
        ) : ends.status === "loading" ? (
          <Skeleton className="h-16" />
        ) : !pts ? (
          <p className="text-sm text-muted-foreground">{fromKey || toKey ? "Add the other end of the trip." : "Choose a start and a destination."}</p>
        ) : route.status === "error" ? (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>No route</AlertTitle>
            <AlertDescription>{errorMessage(route.error)}</AlertDescription>
          </Alert>
        ) : !result ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{fmtDuration(result.durationSeconds)}</p>
                <p className="text-sm text-muted-foreground">
                  {MODE_META[mode].label} · {fmtDistance(result.distanceMeters)}
                  {result.scheduleType ? ` · ${result.scheduleType} times` : ""}
                </p>
              </div>
              {mode === "truck" && result.truck ? <Badge variant="outline">Truck restrictions checked</Badge> : null}
            </div>
            {[...(result.warnings ?? []), ...((result.truck?.warnings ?? []) as { message?: string }[])]
              .filter((w) => w.message)
              .map((w, i) => (
                <Alert key={i}>
                  <TriangleAlertIcon />
                  <AlertDescription>{w.message}</AlertDescription>
                </Alert>
              ))}
            <TransitLegs route={result} />
            {grade ? (
              <ElevationProfile apiKey={API_KEY} gateway={GATEWAY} line={result.geometry.coordinates as [number, number][]} lang={lang} className={cn("min-h-40")} />
            ) : null}
            <p className="text-xs text-muted-foreground">Route preview only. Turn-by-turn instructions and alternative routes are unavailable.</p>
          </>
        )}
      </div>
    </SidePanel>
  );
}
