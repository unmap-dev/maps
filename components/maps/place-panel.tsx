"use client";

import type { ReactNode } from "react";
import {
  BuildingIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  Grid3x3Icon,
  InfoIcon,
  ListChecksIcon,
  MapPinIcon,
  MountainIcon,
  NavigationIcon,
  SearchIcon,
  Share2Icon,
  TimerIcon,
} from "lucide-react";
import type { GeocodeResult, IdentifyResponse, Place } from "@unmap/geocoding";
import type { TimezoneResult } from "@unmap/sdk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Marker } from "@/components/ui/marker-popup";
import { BuiltFrom, CloseButton, PanelHeader, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { copyText } from "@/lib/clipboard";
import { unmap } from "@/lib/api";
import { categoryLabel } from "@/lib/categories";
import { addressLine, fmtCoord } from "@/lib/format";
import { errorMessage, useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";

/** North–south section through the point: 41 samples over 2.6 km, one elevation call. */
const SECTION_SAMPLES = 41;
const SECTION_SPAN_DEG = 0.024;

export function sectionLine([lng, lat]: LngLat): LngLat[] {
  return Array.from({ length: SECTION_SAMPLES }, (_, i) => [lng, lat - SECTION_SPAN_DEG / 2 + (i * SECTION_SPAN_DEG) / (SECTION_SAMPLES - 1)] as LngLat);
}

export interface LandContext {
  unavailable: string[];
  elevation: number | null;
  section: (number | null)[] | null;
  timezone: TimezoneResult | null;
  /** Municipality at the point. */
  where: IdentifyResponse | null;
  /** The nearest address or place, with treaty context. */
  near: GeocodeResult | null;
  /** Survey grid at the point; `"addon"` when the key lacks the legal-land add-on. */
  survey: IdentifyResponse | "addon" | null;
}

/** Everything known about a point: five calls, run in parallel. */
export async function landContext(at: LngLat, lang: Lang, signal: AbortSignal): Promise<LandContext> {
  const [section, timezone, where, near, survey] = await Promise.allSettled([
    unmap.elevation.get(sectionLine(at), { signal }),
    unmap.timezone.lookup(at, { signal }),
    unmap.identify({ at, layers: ["municipalities"], signal }),
    unmap.geocoder.reverse(at[0], at[1], { lang, limit: 1, include: ["treaties"], signal }),
    // Separate on purpose: a key without the add-on gets 403 for the whole request.
    unmap.identify({ at, layers: ["survey.dls"], signal }),
  ]);
  const values = section.status === "fulfilled" ? section.value : null;
  const labels = ["Elevation", "Time zone", "Municipality", "Nearby address", "Legal land grid"];
  const unavailable = [section, timezone, where, near, survey].flatMap((result, i) => result.status === "rejected" && !(i === 4 && (result.reason as { status?: number })?.status === 403) ? [labels[i]!] : []);
  return {
    unavailable,
    section: values,
    elevation: values?.[Math.floor(SECTION_SAMPLES / 2)] ?? null,
    timezone: timezone.status === "fulfilled" ? timezone.value : null,
    where: where.status === "fulfilled" ? where.value : null,
    near: near.status === "fulfilled" ? (near.value[0] ?? null) : null,
    survey: survey.status === "fulfilled" ? survey.value : (survey.reason as { status?: number })?.status === 403 ? "addon" : null,
  };
}

function TerrainSection({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const min = Math.min(...known) - 3, max = Math.max(...known) + 3, w = 400, h = 96;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 10 - (((v ?? min) - min) / (max - min)) * (h - 28)] as const);
  const d = pts.map(([x, y], i) => values[i] == null ? "" : `${i === 0 || values[i - 1] == null ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const mid = pts[Math.floor(pts.length / 2)]!;
  return (
    <div className="relative h-24 border-b bg-muted">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="size-full" role="img" aria-label={label}>
        {known.length === values.length ? <path d={`${d}L${w},${h}L0,${h}Z`} className="fill-border" /> : null}
        <path d={d} className="fill-none stroke-muted-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {values[Math.floor(values.length / 2)] != null ? <line x1={mid[0]} x2={mid[0]} y1={mid[1]} y2={8} className="stroke-foreground" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <Badge variant="outline" className="absolute bottom-2 left-3 bg-background">
        <MountainIcon data-icon="inline-start" />
        {label}
      </Badge>
    </div>
  );
}

export function Row({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 py-1.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:text-muted-foreground">
      {icon}
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
      {action ?? <span />}
    </div>
  );
}

const Sub = ({ children }: { children: ReactNode }) => <span className="block text-xs text-muted-foreground">{children}</span>;

/** Rows for the land a point sits on: municipality, treaty, survey grid, elevation, time zone. */
export function LandRows({ ctx }: { ctx: LandContext }) {
  const muni = ctx.where?.results.find((r) => r.layer === "municipalities");
  const treaties = ctx.near?.treaties?.status === "ok" ? ctx.near.treaties.matches : [];
  const survey = ctx.survey === "addon" ? "addon" : ctx.survey?.results.map((r) => r.name).filter(Boolean) ?? [];
  return (
    <>
      {ctx.unavailable.length ? <Alert><InfoIcon /><AlertTitle>Some map details are unavailable</AlertTitle><AlertDescription>{ctx.unavailable.join(", ")} couldn&apos;t load. Reload the page to try again.</AlertDescription></Alert> : null}
      {ctx.elevation != null ? (
        <Row icon={<MountainIcon />}>
          <span className="tabular-nums">{Math.round(ctx.elevation).toLocaleString()} m</span>
          <Sub>Elevation above sea level</Sub>
        </Row>
      ) : null}
      {ctx.timezone?.timezone ? (
        <Row icon={<ClockIcon />}>
          {ctx.timezone.timezone}
          <Sub>UTC{ctx.timezone.offset ?? ""}{ctx.timezone.dst ? " · daylight time" : ""}</Sub>
        </Row>
      ) : null}
      {muni ? (
        <Row icon={<BuildingIcon />}>
          {muni.name}
          <Sub>Municipality{muni.province ? ` · ${muni.province}` : ""}</Sub>
        </Row>
      ) : null}
      {treaties.length ? (
        <Row icon={<FileTextIcon />}>
          {treaties.map((t) => t.name).join(", ")}
          <Sub>Treaty area</Sub>
        </Row>
      ) : null}
      <Row icon={<Grid3x3Icon />} action={survey === "addon" ? <Badge variant="outline">legal-land add-on</Badge> : undefined}>
        {survey === "addon" ? (
          <span className="text-muted-foreground">Legal land description</span>
        ) : survey.length ? (
          <span className="font-mono text-[13px]">{survey[survey.length - 1]}</span>
        ) : (
          <span className="text-muted-foreground">{ctx.survey == null ? "Survey grid unavailable" : "No survey grid here"}</span>
        )}
        <Sub>{survey === "addon" ? "This key does not include the legal-land add-on" : "Dominion Land Survey"}</Sub>
      </Row>
    </>
  );
}

function PlaceBody({ place, ctx, lang, actions }: { place: Place; ctx: LandContext | null; lang: Lang; actions: PlaceActions }) {
  const other = Object.entries(place.names ?? {}).filter(([l, n]) => l !== lang && n && n !== place.name);
  const address = addressLine(place.address);
  const category = categoryLabel(place.category);
  return (
    <>
      {ctx ? (ctx.section && ctx.section.filter((v) => v != null).length >= 2 ? <TerrainSection values={ctx.section} label={`Terrain near this place${ctx.elevation != null ? ` · ${Math.round(ctx.elevation).toLocaleString()} m` : ""}`} /> : <p className="bg-muted px-4 py-6 text-sm text-muted-foreground">Elevation profile unavailable here.</p>) : <Skeleton className="h-24 rounded-none" />}
      <div className="grid gap-3 px-4 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-balance">{place.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {other.slice(0, 3).map(([l, n]) => (
              <span key={l} className="inline-flex items-center gap-1">
                {n}
                <Badge variant="outline">{l}</Badge>
              </span>
            ))}
            {category ? <span>{category}</span> : null}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <ActionButton label="Directions" primary onClick={actions.onDirections} icon={<NavigationIcon />} />
          <ActionButton label="Travel area" onClick={actions.onReach} icon={<TimerIcon />} />
          <ActionButton label="Nearby" onClick={actions.onNearby} icon={<SearchIcon />} />
          <ActionButton label="15-min" onClick={actions.onScore} icon={<ListChecksIcon />} />
          <ActionButton label="Share" onClick={actions.onShare} icon={<Share2Icon />} />
        </div>
      </div>
      <Separator />
      <div className="px-4 py-3">
        {address ? <Row icon={<MapPinIcon />}>{address}</Row> : null}
        <Row
          icon={<MapPinIcon className="opacity-0" />}
          action={
            <Button variant="ghost" size="icon-xs" aria-label="Copy coordinates" onClick={() => copyText(fmtCoord(place.coordinates), "Coordinates copied")}>
              <CopyIcon />
            </Button>
          }
        >
          <span className="font-mono text-[13px]">{fmtCoord(place.coordinates)}</span>
        </Row>
        {ctx ? <LandRows ctx={ctx} /> : <Skeleton className="mt-2 h-24" />}
      </div>
      <div className="px-4 pb-4">
        <Alert>
          <InfoIcon />
          <AlertTitle>No hours, phone numbers, photos or reviews</AlertTitle>
          <AlertDescription>This demo includes place names, locations and map details. Check the business directly for opening hours and contact information.</AlertDescription>
        </Alert>
      </div>
    </>
  );
}

function ActionButton({ label, icon, onClick, primary }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <Button variant={primary ? "default" : "outline"} size="sm" onClick={onClick} className="h-auto flex-col gap-1.5 py-2.5">
      {icon}
      <span className="text-xs">{label}</span>
    </Button>
  );
}

export interface PlaceActions {
  onDirections: () => void;
  onReach: () => void;
  onNearby: () => void;
  onScore: () => void;
  onShare: () => void;
}

export interface PlaceLoaded {
  place: Place;
  ctx: LandContext;
}

/** The place card: `places.get`, then elevation, time zone and land context in parallel. */
export function PlacePanel({
  id,
  lang,
  sheet,
  onSheet,
  onClose,
  onBack,
  onLoaded,
  actions,
}: {
  id: string;
  lang: Lang;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onBack?: () => void;
  onLoaded: (place: Place) => void;
  actions: (place: Place) => PlaceActions;
}) {
  const placeState = useAsync(`${id}|${lang}`, async (signal) => {
    const place = (await unmap.places.get(id, { lang, signal })).data;
    if (!signal.aborted) onLoaded(place);
    return place;
  });
  const place = placeState.status === "done" ? placeState.data : null;
  const ctxState = useAsync(place ? `${place.coordinates.join(",")}|${lang}` : null, (signal) => landContext(place!.coordinates, lang, signal));
  const ctx = ctxState.status === "done" ? ctxState.data : null;

  return (
    <SidePanel
      label={place?.name ?? "Place"}
      sheet={sheet}
      onSheet={onSheet}
      header={
        onBack || !place ? (
          <PanelHeader onClose={onClose} onBack={onBack} title={!place ? (placeState.status === "error" ? "Place not found" : "Loading place…") : undefined} />
        ) : (
          <div className="absolute top-2 right-2 z-10 lg:top-3">
            <CloseButton onClick={onClose} />
          </div>
        )
      }
      footer={<BuiltFrom items={["geocoder", "marker-popup"]} />}
    >
      {placeState.status === "error" ? (
        <div className="p-4">
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Couldn&apos;t load this place</AlertTitle>
            <AlertDescription>{errorMessage(placeState.error)}</AlertDescription>
          </Alert>
        </div>
      ) : place ? (
        <>
          <Marker lngLat={place.coordinates} />
          <PlaceBody place={place} ctx={ctx} lang={lang} actions={actions(place)} />
        </>
      ) : (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24" />
        </div>
      )}
    </SidePanel>
  );
}
