"use client";

import { CopyIcon, ListChecksIcon, NavigationIcon, SearchIcon, TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Marker } from "@/components/ui/marker-popup";
import { LandRows, landContext } from "@/components/maps/place-panel";
import { CloseButton } from "@/components/maps/side-panel";
import { copyText } from "@/lib/clipboard";
import { addressLine, fmtCoord } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export interface HereActions {
  onDirections: (label: string) => void;
  onReach: (label: string) => void;
  onNearby: () => void;
  onScore: (label: string) => void;
}

/**
 * "What's here": a click on the map. The same parallel calls the place card makes: a reverse
 * geocode names the spot and brings treaty context, the rest add elevation, time zone and land.
 */
export function HereCard({ at, lang, onClose, actions, panelOpen }: { at: LngLat; lang: Lang; onClose: () => void; actions: HereActions; panelOpen: boolean }) {
  const ctxState = useAsync(`${at.join(",")}|${lang}`, (signal) => landContext(at, lang, signal));
  const ctx = ctxState.status === "done" ? ctxState.data : null;
  const top = ctx?.near;
  const label = top ? (addressLine(top.address) ?? top.name) : ctxState.status === "loading" || ctxState.status === "idle" ? null : "Dropped pin";

  return (
    <section
      aria-label="What's here"
      data-map-panel=""
      className={cn(
        "absolute z-20 grid max-h-[60%] gap-2 overflow-y-auto bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/10",
        "inset-x-0 bottom-0 rounded-t-2xl",
        "lg:inset-x-auto lg:bottom-6 lg:w-[420px] lg:rounded-xl",
        panelOpen ? "lg:left-[calc(400px+2rem)]" : "lg:left-4",
      )}
    >
      <Marker lngLat={at} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {label ? <h2 className="text-base font-semibold">{label}</h2> : <Skeleton className="h-5 w-48" />}
          <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
            {fmtCoord(at)}
            <Button variant="ghost" size="icon-xs" aria-label="Copy coordinates" onClick={() => copyText(fmtCoord(at), "Coordinates copied")}>
              <CopyIcon />
            </Button>
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => actions.onDirections(label ?? fmtCoord(at))}>
          <NavigationIcon data-icon="inline-start" />
          Directions
        </Button>
        <Button size="sm" variant="outline" onClick={() => actions.onReach(label ?? fmtCoord(at))}>
          <TimerIcon data-icon="inline-start" />
          Travel area
        </Button>
        <Button size="sm" variant="outline" onClick={actions.onNearby}>
          <SearchIcon data-icon="inline-start" />
          Nearby
        </Button>
        <Button size="sm" variant="outline" onClick={() => actions.onScore(label ?? fmtCoord(at))}>
          <ListChecksIcon data-icon="inline-start" />
          15-min check
        </Button>
      </div>
      <Separator />
      <div className="pt-1">{ctx ? <LandRows ctx={ctx} /> : <Skeleton className="mt-2 h-16" />}</div>
    </section>
  );
}
