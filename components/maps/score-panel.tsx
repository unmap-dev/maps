"use client";

import { useEffect, useMemo } from "react";
import {
  BanknoteIcon,
  BikeIcon,
  BusIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  CoffeeIcon,
  FootprintsIcon,
  InfoIcon,
  LibraryIcon,
  LinkIcon,
  PillIcon,
  SchoolIcon,
  ShoppingCartIcon,
  StethoscopeIcon,
  TreesIcon,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GeoJSONLayer } from "@/components/ui/geojson-layer";
import { Marker } from "@/components/ui/marker-popup";
import { chartRamp } from "@/lib/map-layers";
import { useMap } from "@/lib/map-context";
import { PanelHeader, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { unmap } from "@/lib/api";
import { fmtDistance } from "@/lib/format";
import { bboxOf } from "@/lib/geo";
import { ESSENTIALS, SCORE_MINUTES, SEARCH_RADIUS, checkEssentials, scoreOf, type Band, type Candidate, type EssentialResult, type ScoreMode } from "@/lib/score";
import { errorMessage, useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const MODES: { id: ScoreMode; label: string; verb: string; icon: LucideIcon }[] = [
  { id: "pedestrian", label: "Walk", verb: "walk", icon: FootprintsIcon },
  { id: "bicycle", label: "Bike", verb: "bike ride", icon: BikeIcon },
];

const ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCartIcon,
  pharmacy: PillIcon,
  health: StethoscopeIcon,
  school: SchoolIcon,
  park: TreesIcon,
  library: LibraryIcon,
  food: CoffeeIcon,
  bank: BanknoteIcon,
  transit: BusIcon,
};

type Feature = { type: "Feature"; properties: { contour?: number } & Record<string, unknown>; geometry: { type: string; coordinates: unknown } };

/**
 * The 15-minute check: one isochrone, one `places.nearby` per essential and one
 * `transit.nearbyStops`, all sent at once, then each essential's quickest place is found on the
 * client by testing it against the bands.
 */
export function ScorePanel({
  origin,
  originLabel,
  mode,
  lang,
  dark,
  sheet,
  onSheet,
  onClose,
  onMode,
  onOpenPlace,
  onOpenStop,
  onShare,
  padding,
}: {
  origin: LngLat;
  originLabel: string;
  mode: ScoreMode;
  lang: Lang;
  dark: boolean;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onMode: (mode: ScoreMode) => void;
  onOpenPlace: (id: string) => void;
  onOpenStop: (id: string) => void;
  onShare: () => void;
  padding: () => { top: number; bottom: number; left: number; right: number };
}) {
  const map = useMap();
  const state = useAsync(`${origin.join(",")}|${mode}|${lang}`, async (signal) => {
    const radius = SEARCH_RADIUS[mode];
    // A failed category is reported on its own row rather than failing the whole check.
    const lists = ESSENTIALS.map((e): Promise<Candidate[] | null> =>
      (e.categories.length
        ? unmap.places.nearby(e.categories, { near: origin, radius, limit: 50, lang, signal }).then((r) => r.data.map((p): Candidate => ({ kind: "place", id: p.id, name: p.name, coordinates: p.coordinates })))
        : unmap.transit.nearbyStops(origin, { radius, limit: 100, signal }).then((r) => r.data.map((s): Candidate => ({ kind: "stop", id: s.id, name: s.name, coordinates: s.coordinates })))
      ).catch(() => null),
    );
    const [iso, ...found] = await Promise.all([unmap.router.isochrone(origin, { mode, minutes: SCORE_MINUTES, signal }), ...lists]);
    const features = ([...iso.features] as unknown as Feature[]).sort((a, b) => (b.properties.contour ?? 0) - (a.properties.contour ?? 0));
    const bands: Band[] = features.map((f) => ({ minutes: f.properties.contour ?? 0, geometry: f.geometry }));
    return { features, results: checkEssentials(bands, origin, Object.fromEntries(ESSENTIALS.map((e, i) => [e.id, found[i] ?? null]))) };
  });
  const data = state.status === "done" ? state.data : null;
  const outer = data?.features[0]?.geometry;

  // Colour per band from the customer's chart tokens, smallest band first, as on the travel-time panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ramp = useMemo(() => chartRamp(map), [map, dark]);
  const colors = SCORE_MINUTES.map((m, i) => [m, ramp[i % ramp.length]!] as const);
  const color = ["match", ["get", "contour"], ...colors.flat(), ramp[0]!];

  useEffect(() => {
    if (!map || !outer) return;
    const b = bboxOf([outer]);
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: padding(), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, outer]);

  const verb = MODES.find((m) => m.id === mode)!.verb;
  const score = data ? scoreOf(data.results) : null;
  const open = (r: Extract<EssentialResult, { status: "met" }>) => (r.best.kind === "stop" ? onOpenStop(r.best.id) : onOpenPlace(r.best.id));

  return (
    <SidePanel
      label="15-minute check"
      sheet={sheet}
      onSheet={onSheet}
      header={<PanelHeader onClose={onClose} title="15-minute check" subtitle={`Everyday essentials within a 15-minute ${verb} of ${originLabel}.`} />}
    >
      <Marker lngLat={origin} />
      {data?.features.length ? (
        <GeoJSONLayer
          id="app-score"
          data={{ type: "FeatureCollection", features: data.features }}
          fillPaint={{ "fill-color": color, "fill-opacity": 0.12 }}
          linePaint={{ "line-color": color, "line-width": 1.5 }}
          circlePaint={false}
        />
      ) : null}
      {data?.results.map((r) => {
        if (r.status !== "met") return null;
        const Icon = ICONS[r.essential.id] ?? CircleCheckIcon;
        return (
          <Marker
            key={r.essential.id}
            lngLat={r.best.coordinates}
            onClick={() => open(r)}
            markerContent={
              <span title={`${r.essential.label}: ${r.best.name}`} className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md">
                <Icon className="size-3.5" aria-hidden />
              </span>
            }
          />
        );
      })}
      <div className="grid gap-3 px-4 pb-4">
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[mode]} onValueChange={(v) => v[0] && onMode(v[0] as ScoreMode)} aria-label="Travel mode">
          {MODES.map(({ id, label, icon: Icon }) => (
            <ToggleGroupItem key={id} value={id}>
              <Icon data-icon="inline-start" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {state.status === "error" ? (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Couldn&apos;t run the check</AlertTitle>
            <AlertDescription>{errorMessage(state.error)}</AlertDescription>
          </Alert>
        ) : !data || !score ? (
          <Skeleton className="h-14" />
        ) : !data.features.length ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>No travel area found</AlertTitle>
            <AlertDescription>Try a point closer to a road or path.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2" aria-live="polite">
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {score.met}
                <span className="text-muted-foreground"> of {score.total}</span>
              </span>
              <span className="text-sm text-muted-foreground">essentials within 15 min</span>
            </p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Travel-time bands">
              {colors.map(([m, c]) => (
                <li key={m} className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm border-2" style={{ borderColor: c, background: `color-mix(in oklab, ${c} 25%, transparent)` }} />
                  {m} min
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Separator />
      <ul aria-label="Essentials">
        {ESSENTIALS.map((e) => {
          const Icon = ICONS[e.id] ?? CircleCheckIcon;
          const r = data?.results.find((x) => x.essential.id === e.id);
          const row = (
            <>
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium">{e.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {!r ? "Checking…" : r.status === "met" ? `${r.best.name} · ${fmtDistance(r.best.distance)}` : r.status === "missing" ? `None found within 15 min` : "Couldn’t check this one"}
                </span>
              </span>
              {!r ? (
                <Skeleton className="h-4 w-14" />
              ) : r.status === "met" ? (
                <span className="flex items-center gap-1 text-xs tabular-nums">
                  <CircleCheckIcon className="size-4 text-primary" aria-hidden />≤ {r.best.minutes} min
                </span>
              ) : r.status === "missing" ? (
                <CircleXIcon className="size-4 text-muted-foreground" aria-label="Not within 15 minutes" />
              ) : (
                <CircleAlertIcon className="size-4 text-destructive" aria-label="Unavailable" />
              )}
            </>
          );
          const grid = "grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-sm";
          return (
            <li key={e.id} className="border-b">
              {r?.status === "met" ? (
                <Button variant="ghost" onClick={() => open(r)} className={cn(grid, "h-auto rounded-none")}>
                  {row}
                </Button>
              ) : (
                <div className={grid}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-3 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Click anywhere on the map to check another spot. Times are the routing graph&apos;s travel-time bands, not straight lines, and a missing essential can be a gap in the open data rather than on the ground.
        </p>
        <Button variant="outline" onClick={onShare} className="justify-self-start">
          <LinkIcon data-icon="inline-start" />
          Copy link
        </Button>
      </div>
    </SidePanel>
  );
}
