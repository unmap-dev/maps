"use client";

import { useEffect, useState } from "react";
import { InfoIcon, MapPinIcon } from "lucide-react";
import type { Place } from "@unmap/geocoding";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Marker } from "@/components/ui/marker-popup";
import { useMap } from "@/lib/map-context";
import { BuiltFrom, PanelHeader, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { unmap } from "@/lib/api";
import { categoryLabel, chipLabel } from "@/lib/categories";
import { addressLine, fmtDistance, fmtDuration, haversine } from "@/lib/format";
import { errorMessage, useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const RADIUS_M = 3000;

/** A numbered dot for a result, drawn in the customer's --primary like the registry's pins. */
function NumberedDot({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border-2 border-background bg-primary font-sans text-[11px] font-semibold text-primary-foreground shadow-md transition-transform",
        active ? "size-7 scale-110" : "size-6",
      )}
    >
      {n}
    </span>
  );
}

/** `places.nearby` around a point: a list beside the map and numbered pins on it. */
export function NearbyPanel({
  category,
  near,
  nearLabel,
  lang,
  sheet,
  onSheet,
  onClose,
  onOpen,
  onSearchHere,
  padding,
}: {
  category: string;
  near: LngLat;
  nearLabel: string;
  lang: Lang;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onOpen: (place: Place) => void;
  onSearchHere: () => void;
  padding: () => { top: number; bottom: number; left: number; right: number };
}) {
  const map = useMap();
  const [hover, setHover] = useState<string | null>(null);
  const state = useAsync(`${category}|${near.join(",")}|${lang}`, async (signal) => {
    const res = await unmap.places.nearby(category, { near, radius: RADIUS_M, limit: 20, lang, signal });
    return res.data;
  });
  const places = state.status === "done" ? state.data : null;

  useEffect(() => {
    if (!map || !places?.length) return;
    const lngs = places.map((p) => p.coordinates[0]), lats = places.map((p) => p.coordinates[1]);
    map.fitBounds(
      [
        [Math.min(...lngs, near[0]), Math.min(...lats, near[1])],
        [Math.max(...lngs, near[0]), Math.max(...lats, near[1])],
      ],
      { padding: padding(), maxZoom: 16, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 },
    );
    // Fit once per result set, not on every padding change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, places]);

  return (
    <SidePanel
      label={`${chipLabel(category)} nearby`}
      sheet={sheet}
      onSheet={onSheet}
      header={
        <PanelHeader
          onClose={onClose}
          title={`${chipLabel(category)} near ${nearLabel}`}
          subtitle={places ? `${places.length} within ${fmtDistance(RADIUS_M)} · nearest first` : state.status === "error" ? "Search unavailable" : "Searching…"}
        />
      }
      footer={<BuiltFrom items={["marker-popup"]} />}
    >
      <div className="px-4 pb-3">
        <Button variant="outline" onClick={onSearchHere}>Search this area</Button>
      </div>
      {state.status === "error" ? (
        <div className="p-4">
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Couldn&apos;t search nearby</AlertTitle>
            <AlertDescription>{errorMessage(state.error)}</AlertDescription>
          </Alert>
        </div>
      ) : !places ? (
        <div className="grid gap-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing found here</EmptyTitle>
            <EmptyDescription>No {chipLabel(category).toLowerCase()} within {fmtDistance(RADIUS_M)} of {nearLabel}. Move the map, then choose Search this area.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="border-t">
          {places.map((place, i) => {
            const d = place.distance ?? haversine(near, place.coordinates);
            return (
              <li key={place.id} className="border-b">
                <Marker lngLat={place.coordinates} onClick={() => onOpen(place)} markerContent={<NumberedDot n={i + 1} active={hover === place.id} />} />
                <Button
                  variant="ghost"
                  onClick={() => onOpen(place)}
                  onMouseEnter={() => setHover(place.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(place.id)}
                  onBlur={() => setHover(null)}
                  className="grid h-auto w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{place.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[categoryLabel(place.category), addressLine(place.address)].filter(Boolean).join(" · ") || (
                        <>
                          <MapPinIcon className="inline size-3" /> {place.coordinates[1].toFixed(4)}, {place.coordinates[0].toFixed(4)}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    {fmtDistance(d)}
                    <br />
                    <span title="Straight-line estimate">≈ {fmtDuration(d / 1.3)} walk</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SidePanel>
  );
}
