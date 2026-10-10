"use client";

import { useEffect, useMemo, useState } from "react";
import { BikeIcon, CarIcon, FootprintsIcon, InfoIcon } from "lucide-react";
import type { Place } from "@unmap/geocoding";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GeoJSONLayer } from "@/components/ui/geojson-layer";
import { Marker } from "@/components/ui/marker-popup";
import { chartRamp } from "@/lib/map-layers";
import { useMap } from "@/lib/map-context";
import { BuiltFrom, PanelHeader, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { unmap } from "@/lib/api";
import { CHIPS, categoryLabel } from "@/lib/categories";
import { fmtDistance, haversine } from "@/lib/format";
import { bboxOf, contains, geometryArea } from "@/lib/geo";
import { errorMessage, useAsync } from "@/lib/use-async";
import { MAX_BANDS, type Lang, type LngLat, type ReachMode } from "@/lib/url-state";

const MODES: { id: ReachMode; label: string; icon: typeof CarIcon }[] = [
  { id: "pedestrian", label: "Walk", icon: FootprintsIcon },
  { id: "bicycle", label: "Bike", icon: BikeIcon },
  { id: "auto", label: "Drive", icon: CarIcon },
];
const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60];
/** Categories offered for "what's inside": a few chips' worth, not the whole taxonomy. */
const INSIDE = ["food.cafe", "recreation.park", "shop.supermarket"];

type Feature = { type: "Feature"; properties: { contour?: number } & Record<string, unknown>; geometry: { type: string; coordinates: unknown } };

/**
 * Travel-time areas: one `router.isochrone` call drawn with the registry's GeoJSON layer, plus an
 * optional `places.nearby` filtered to the outer band on the client.
 */
export function ReachPanel({
  origin,
  originLabel,
  minutes,
  mode,
  lang,
  dark,
  sheet,
  onSheet,
  onClose,
  onChange,
  onOpen,
  padding,
}: {
  origin: LngLat;
  originLabel: string;
  minutes: number[];
  mode: ReachMode;
  lang: Lang;
  dark: boolean;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onChange: (next: { minutes?: number[]; mode?: ReachMode }) => void;
  onOpen: (place: Place) => void;
  padding: () => { top: number; bottom: number; left: number; right: number };
}) {
  const map = useMap();
  const [inside, setInside] = useState<string | null>(null);
  const state = useAsync(`${origin.join(",")}|${minutes.join(",")}|${mode}`, (signal) =>
    unmap.router.isochrone(origin, { mode, minutes, signal }),
  );
  const features = useMemo(() => {
    if (state.status !== "done") return [];
    return ([...state.data.features] as unknown as Feature[]).sort((a, b) => (b.properties.contour ?? 0) - (a.properties.contour ?? 0));
  }, [state]);
  const outer = features[0]?.geometry;

  // Colour per band from the customer's chart tokens, smallest band first.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ramp = useMemo(() => chartRamp(map), [map, dark]);
  const bands = [...features].reverse().map((f, i) => ({ minutes: f.properties.contour ?? 0, color: ramp[i % ramp.length]!, area: geometryArea(f.geometry), feature: f }));

  useEffect(() => {
    if (!map || !outer) return;
    const b = bboxOf([outer]);
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: padding(), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, outer]);

  const insideState = useAsync(inside && outer ? `${inside}|${origin.join(",")}|${minutes.join(",")}|${mode}|${lang}` : null, async (signal) => {
    const b = bboxOf([outer])!;
    // The search radius that covers the whole outer band, from the origin to its furthest corner.
    const radius = Math.ceil(Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map((c) => haversine(origin, c as LngLat))));
    const res = await unmap.places.nearby(inside!, { near: origin, radius: Math.min(radius, 50000), limit: 50, lang, signal });
    return res.data.filter((p) => contains(outer, p.coordinates));
  });

  return (
    <SidePanel
      label="Reachable area"
      sheet={sheet}
      onSheet={onSheet}
      header={<PanelHeader onClose={onClose} title="Travel-time area" subtitle={`Explore what you can reach from ${originLabel}.`} />}
      footer={<BuiltFrom items={["geojson-layer", "marker-popup"]} />}
    >
      <Marker lngLat={origin} />
      {features.length ? (
        <GeoJSONLayer
          id="app-reach"
          data={{ type: "FeatureCollection", features }}
          fillPaint={{ "fill-color": ["match", ["get", "contour"], ...bands.flatMap((b) => [b.minutes, b.color]), ramp[0]!], "fill-opacity": 0.14 }}
          linePaint={{ "line-color": ["match", ["get", "contour"], ...bands.flatMap((b) => [b.minutes, b.color]), ramp[0]!], "line-width": 1.5 }}
          circlePaint={false}
        />
      ) : null}
      <div className="grid gap-3 px-4 pb-4">
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[mode]} onValueChange={(v) => v[0] && onChange({ mode: v[0] as ReachMode })} aria-label="Travel mode">
          {MODES.map(({ id, label, icon: Icon }) => (
            <ToggleGroupItem key={id} value={id}>
              <Icon data-icon="inline-start" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Field>
          <FieldTitle>Travel time</FieldTitle>
          <ToggleGroup multiple variant="outline" value={minutes.map(String)} onValueChange={(v) => { if (v.length && v.length <= MAX_BANDS) onChange({ minutes: v.map(Number).sort((a, b) => a - b) }); }} aria-label="Travel time" className="w-full flex-wrap">
            {[...new Set([...MINUTE_CHOICES, ...minutes])].sort((a, b) => a - b).map((m) => (
              <ToggleGroupItem key={m} value={String(m)} disabled={!minutes.includes(m) && minutes.length >= MAX_BANDS}>
                {m} min
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>Choose up to {MAX_BANDS} travel times. Keep at least one selected.</FieldDescription>
        </Field>
        {state.status === "error" ? (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Couldn&apos;t compute the area</AlertTitle>
            <AlertDescription>{errorMessage(state.error)}</AlertDescription>
          </Alert>
        ) : state.status !== "done" ? (
          <Skeleton className="h-16" />
        ) : !bands.length ? (
          <Empty><EmptyHeader><EmptyTitle>No travel area found</EmptyTitle><EmptyDescription>Try a point closer to a road or path.</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <ul className="grid gap-1.5">
            {bands.map((b) => (
              <li key={b.minutes} className="grid grid-cols-[0.875rem_1fr_auto] items-center gap-2.5 text-sm">
                <span className="size-3.5 rounded-sm border-2" style={{ borderColor: b.color, background: `color-mix(in oklab, ${b.color} 25%, transparent)` }} />
                <span>Within {b.minutes} min</span>
                <span className="text-muted-foreground tabular-nums">{(b.area / 1e6).toFixed(2)} km²</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Separator />
      <div className="grid gap-2 px-4 py-3">
        <h3 className="text-xs font-medium text-muted-foreground">What&apos;s inside {bands[bands.length - 1]?.minutes ?? minutes[minutes.length - 1]} min</h3>
        <ToggleGroup variant="outline" size="sm" spacing={0} value={inside ? [inside] : []} onValueChange={(v) => setInside(v[0] ?? null)} aria-label="Category">
          {INSIDE.map((id) => (
            <ToggleGroupItem key={id} value={id} disabled={!outer}>
              {CHIPS.find((c) => c.id === id)?.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {insideState.status === "loading" ? <Skeleton className="h-10" /> : null}
        {insideState.status === "error" ? <Alert variant="destructive"><InfoIcon /><AlertTitle>Places unavailable</AlertTitle><AlertDescription>{errorMessage(insideState.error)}</AlertDescription></Alert> : null}
        {insideState.status === "done" ? (
          insideState.data.length ? (
            <ul className="-mx-4 border-t">
              {insideState.data.map((p) => (
                <li key={p.id} className="border-b">
                  <Marker lngLat={p.coordinates} onClick={() => onOpen(p)} markerContent={<span className="block size-3 rounded-full border-2 border-background bg-primary shadow" />} />
                  <Button variant="ghost" onClick={() => onOpen(p)} className="h-auto w-full justify-between gap-3 px-4 py-2 text-left">
                    <span className="min-w-0 truncate">
                      {p.name} <span className="text-muted-foreground">· {categoryLabel(p.category)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDistance(haversine(origin, p.coordinates))}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty><EmptyHeader><EmptyTitle>No places found</EmptyTitle><EmptyDescription>Try another category or a longer travel time.</EmptyDescription></EmptyHeader></Empty>
          )
        ) : null}
        {inside ? <p className="text-xs text-muted-foreground">Showing up to 50 nearby places inside the selected area, within 50 km of the starting point.</p> : null}
      </div>
    </SidePanel>
  );
}
