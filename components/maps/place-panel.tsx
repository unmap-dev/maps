"use client";

import type { ReactNode } from "react";
import {
  BuildingIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  Grid3x3Icon,
  InfoIcon,
  MapPinIcon,
  MountainIcon,
} from "lucide-react";
import type { GeocodeResult, IdentifyResponse, Place } from "@unmap/geocoding";
import type { TimezoneResult } from "@unmap/sdk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Marker } from "@/components/ui/marker-popup";
import { SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { copyText } from "@/lib/clipboard";
import { unmap } from "@/lib/api";
import { categoryLabel } from "@/lib/categories";
import { addressLine, fmtCoord } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
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
    <div className="relative h-24 overflow-hidden rounded-lg border bg-muted">
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

/** The Overview tab of a place: terrain, where it is, and the land it sits on. */
function PlaceBody({ place, ctx }: { place: Place; ctx: LandContext | null }) {
  const address = addressLine(place.address);
  return (
    <>
      <div className="px-4 pt-3">
        {ctx ? (ctx.section && ctx.section.filter((v) => v != null).length >= 2 ? <TerrainSection values={ctx.section} label={`Terrain near this place${ctx.elevation != null ? `, ${Math.round(ctx.elevation).toLocaleString()} m` : ""}`} /> : <p className="rounded-lg bg-muted px-4 py-6 text-sm text-muted-foreground">Elevation profile unavailable here.</p>) : <Skeleton className="h-24" />}
      </div>
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
          <AlertDescription>This app includes place names, locations and map details. Check the business directly for opening hours and contact information.</AlertDescription>
        </Alert>
      </div>
    </>
  );
}

/** A place's other-language names and its category, for the line under its name. */
export function PlaceSubtitle({ place, lang }: { place: Place; lang: Lang }) {
  const other = Object.entries(place.names ?? {}).filter(([l, n]) => l !== lang && n && n !== place.name);
  const category = categoryLabel(place.category);
  if (!other.length && !category) return null;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {other.slice(0, 3).map(([l, n]) => (
        <span key={l} className="inline-flex items-center gap-1">
          {n}
          <Badge variant="outline">{l}</Badge>
        </span>
      ))}
      {category ? <span>{category}</span> : null}
    </p>
  );
}

/** A place's Overview tab: elevation, time zone and land context in parallel, around its pin. */
export function PlaceOverview({ place, lang, sheet, onSheet }: { place: Place; lang: Lang; sheet: SheetSize; onSheet: () => void }) {
  const ctxState = useAsync(`${place.coordinates.join(",")}|${lang}`, (signal) => landContext(place.coordinates, lang, signal));
  const ctx = ctxState.status === "done" ? ctxState.data : null;
  return (
    <SidePanel label={place.name} sheet={sheet} onSheet={onSheet}>
      <Marker lngLat={place.coordinates} />
      <PlaceBody place={place} ctx={ctx} />
    </SidePanel>
  );
}
