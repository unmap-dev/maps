"use client";

import { createElement, useEffect, useRef, type ComponentType, type ReactNode, type RefObject } from "react";
import {
  BuildingIcon,
  FactoryIcon,
  Grid2x2Icon,
  HouseIcon,
  LandPlotIcon,
  MapIcon,
  MapPinIcon,
  NavigationIcon,
  DropletIcon,
  SearchIcon,
  SignpostIcon,
} from "lucide-react";
import type { GeocodeResult } from "@unmap/geocoding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Geocoder } from "@/components/ui/geocoder";
import { useMap } from "@/lib/map-context";
import { CHIPS } from "@/lib/categories";
import { API_KEY, GATEWAY } from "@/lib/config";
import { fmtDistance, haversine } from "@/lib/format";
import { highlight, resultLines } from "@/lib/search-result";
import type { Lang } from "@/lib/url-state";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

const LAYER_ICONS: Record<GeocodeResult["layer"], Icon> = {
  address: HouseIcon,
  street: SignpostIcon,
  locality: BuildingIcon,
  region: MapIcon,
  poi: MapPinIcon,
  legal_land: Grid2x2Icon,
  well: DropletIcon,
  facility: FactoryIcon,
  parcel: LandPlotIcon,
};

/** A place's icon is its category chip's when it has one ("Coffee" gets the cup), else the kind's. */
function iconOf(r: GeocodeResult): ReactNode {
  const chip = r.layer === "poi" && r.category ? CHIPS.find((c) => r.category === c.id || r.category!.startsWith(`${c.id}.`)) : undefined;
  return createElement(chip?.icon ?? LAYER_ICONS[r.layer] ?? MapPinIcon, { className: "size-4" });
}

/**
 * One suggestion, as a map app lists them: the kind's icon, the name with what you typed in bold
 * over where it is, and the distance from the map's centre at the end of the row.
 */
function ResultRow({ result, query, lang, from }: { result: GeocodeResult; query: string; lang: Lang; from: [number, number] | null }) {
  const { primary, secondary } = resultLines(result, lang);
  const distance = from ? fmtDistance(haversine(from, [result.lng, result.lat])) : null;
  return (
    <span data-search-result="" className="flex w-full min-w-0 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" data-search-icon="" aria-hidden>
        {iconOf(result)}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-muted-foreground">
          {highlight(primary, query).map((part, i) =>
            part.match ? (
              <strong key={i} className="font-semibold text-foreground">{part.text}</strong>
            ) : (
              <span key={i} className="text-foreground/80">{part.text}</span>
            ),
          )}
        </span>
        {secondary ? <span className="truncate text-xs text-muted-foreground">{secondary}</span> : null}
      </span>
      {distance ? <span className="ml-auto shrink-0 self-start pt-0.5 text-xs whitespace-nowrap tabular-nums text-muted-foreground">{distance}</span> : null}
    </span>
  );
}

/**
 * Marks the search box's suggestion list with `data-search-popup`, so globals.css can size it to
 * the card in every state: loading, empty and failed as well as with rows. The list is portaled
 * away from the card and the geocoder item is copied in unmodified, so the field's `aria-controls`
 * (the list's id, set while it is open) is the one link between them. Only the field's own
 * attributes are watched.
 */
function useSearchPopupMark(card: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const input = card.current?.querySelector("input");
    if (!input) return;
    let frame = 0;
    const mark = () => {
      cancelAnimationFrame(frame);
      // The list mounts in the same commit that sets the attribute; a frame later it is there.
      frame = requestAnimationFrame(() => {
        const id = input.getAttribute("aria-controls");
        const popup = id ? document.getElementById(id)?.closest("[data-slot=combobox-content]") : null;
        popup?.setAttribute("data-search-popup", "");
      });
    };
    const observer = new MutationObserver(mark);
    observer.observe(input, { attributes: true, attributeFilter: ["aria-controls", "aria-expanded"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [card]);
}

/**
 * The search box: the registry geocoder, as in Google Maps. On a phone it floats over the top of
 * the map; on a desktop it heads the sidebar. A place result opens its card; any other result (an
 * address, a street, a town) opens "what's here" on it.
 *
 * The geocoder item is copied in unmodified; its `renderResult` prop draws the rows here, and
 * globals.css styles the field and the list around them.
 */
export function SearchBox({ lang, onResult, onDirections }: { lang: Lang; onResult: (r: GeocodeResult) => void; onDirections: () => void }) {
  const map = useMap();
  // What is typed, for the bold in each row. A ref, not state: the geocoder owns the field, and a
  // re-render here in the middle of its input event put its old value back and lost the keystroke.
  const query = useRef("");
  const card = useRef<HTMLDivElement>(null);
  useSearchPopupMark(card);
  const centre = map?.getCenter();
  const from: [number, number] | null = centre ? [centre.lng, centre.lat] : null;
  const directions = lang === "fr" ? "Itinéraire" : "Directions";
  return (
    <Card data-search-card="" className="absolute inset-x-3 top-3 z-30 gap-0 py-1.5 shadow-lg lg:static lg:shrink-0 lg:rounded-none lg:border-b lg:py-2 lg:shadow-none lg:ring-0">
      <CardHeader className="sr-only"><CardTitle>Search the map</CardTitle></CardHeader>
      {/* The geocoder spans the card, so its list (anchored to the field) is as wide as the card;
          the icon and the directions button sit over the field's ends (globals.css pads it). */}
      <CardContent ref={card} className="relative px-0" onInputCapture={(e) => (query.current = (e.target as HTMLInputElement).value ?? "")}>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Geocoder
          apiKey={API_KEY}
          gateway={GATEWAY}
          lang={lang}
          proximity="map"
          placeholder={lang === "fr" ? "Rechercher un lieu ou une adresse" : "Search places and addresses"}
          onSelect={onResult}
          renderResult={(result) => <ResultRow result={result} query={query.current} lang={lang} from={from} />}
          className="min-w-0"
        />
        <div className="absolute inset-y-0 right-1.5 z-10 flex items-center gap-1">
          <Separator orientation="vertical" className="my-2.5" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label={directions} onClick={onDirections} />}>
              <NavigationIcon />
            </TooltipTrigger>
            <TooltipContent side="bottom">{directions}</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Category chips: one tap is a `places.nearby` call. `wrap` lays them out in rows, for the
 * sidebar and the Nearby tab; without it they are one row that scrolls sideways over the map.
 */
export function CategoryChips({ active, onPick, wrap, className }: { active: string | null; onPick: (category: string) => void; wrap?: boolean; className?: string }) {
  return (
    <div className={cn(wrap ? "" : "overflow-x-auto p-1 [scrollbar-width:none]", className)}>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={active ? [active] : []}
        onValueChange={(values) => onPick(values[0] ?? active!)}
        aria-label="Nearby categories"
        className={cn(wrap ? "w-full flex-wrap" : "w-max")}
      >
        {CHIPS.map(({ id, label, icon: Icon }) => (
          <ToggleGroupItem key={id} value={id} className={cn("shrink-0 rounded-full", !wrap && "bg-background shadow-sm")}>
            <Icon data-icon="inline-start" />
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
