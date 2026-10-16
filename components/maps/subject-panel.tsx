"use client";

import type { ReactNode } from "react";
import { CopyIcon, InfoIcon, NavigationIcon, Share2Icon } from "lucide-react";
import type { Place } from "@unmap/geocoding";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceSubtitle } from "@/components/maps/place-panel";
import { CloseButton, PanelSlot, SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { unmap } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { addressLine, fmtCoord } from "@/lib/format";
import { errorMessage, useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** What a card is about: a place by id, or a dropped pin. */
export type Subject = { place: string } | { at: LngLat };
export type SubjectTab = "overview" | "nearby" | "reach" | "score";

const TABS: { id: SubjectTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "nearby", label: "Nearby" },
  { id: "reach", label: "Travel area" },
  { id: "score", label: "15-min" },
];

/** A stable key for a subject: the card stays mounted, and its place loaded, across its tabs. */
export const subjectKey = (s: Subject) => ("place" in s ? `place:${s.place}` : `pin:${s.at.join(",")}`);

export interface SubjectContent {
  origin: LngLat;
  place: Place | null;
  /** What to call the subject in a sentence: the place's name, the pin's address, or "this point". */
  name: string;
}

/**
 * A place card or a dropped pin, with its tools as tabs: Overview, Nearby, Travel area, 15-min.
 * Each tab is its own screen with its own URL (`?of=` ties it to the card), so Back steps through
 * them. The card's heading and tabs sit above whichever panel the tab renders, through
 * `PanelSlot`; a place is fetched once and kept while the tabs change.
 */
export function SubjectPanel({
  subject,
  tab,
  lang,
  label,
  sheet,
  onSheet,
  onClose,
  onTab,
  onDirections,
  onShare,
  onLoaded,
  children,
}: {
  subject: Subject;
  tab: SubjectTab;
  lang: Lang;
  /** A dropped pin's address, once something has found it. */
  label?: string | null;
  sheet: SheetSize;
  onSheet: () => void;
  onClose: () => void;
  onTab: (tab: SubjectTab, content: SubjectContent) => void;
  onDirections: () => void;
  onShare: () => void;
  onLoaded?: (place: Place) => void;
  children: (content: SubjectContent) => ReactNode;
}) {
  const id = "place" in subject ? subject.place : null;
  const placeState = useAsync(id ? `${id}|${lang}` : null, async (signal) => {
    const place = (await unmap.places.get(id!, { lang, signal })).data;
    if (!signal.aborted) onLoaded?.(place);
    return place;
  });
  const place = placeState.status === "done" ? placeState.data : null;
  const origin = "at" in subject ? subject.at : (place?.coordinates ?? null);
  const content: SubjectContent | null = origin ? { origin, place, name: place?.name ?? label ?? "this point" } : null;
  const address = place ? addressLine(place.address) : null;

  const heading = (
    <div className="grid shrink-0 gap-3 px-4 pt-1 pb-3 lg:pt-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {"at" in subject ? (
            <>
              <p className="text-xs text-muted-foreground">Dropped pin</p>
              {label ? <h2 className="text-lg font-semibold tracking-tight text-balance">{label}</h2> : null}
              <p className={cn("flex items-center gap-1 font-mono", label ? "text-xs text-muted-foreground" : "text-base font-semibold")}>
                {fmtCoord(subject.at)}
                <Button variant="ghost" size="icon-xs" aria-label="Copy coordinates" onClick={() => copyText(fmtCoord(subject.at), "Coordinates copied")}>
                  <CopyIcon />
                </Button>
              </p>
            </>
          ) : place ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight text-balance">{place.name}</h2>
              <PlaceSubtitle place={place} lang={lang} />
              {address && tab !== "overview" ? <p className="truncate text-xs text-muted-foreground">{address}</p> : null}
            </>
          ) : placeState.status === "error" ? (
            <h2 className="text-lg font-semibold">Place not found</h2>
          ) : (
            <div className="grid gap-2 pt-1">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          )}
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {placeState.status === "error" ? (
        <Alert variant="destructive">
          <InfoIcon />
          <AlertTitle>Couldn&apos;t load this place</AlertTitle>
          <AlertDescription>{errorMessage(placeState.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onDirections} disabled={!content}>
              <NavigationIcon data-icon="inline-start" />
              Directions
            </Button>
            <Button variant="outline" size="icon" aria-label="Share" onClick={onShare}>
              <Share2Icon />
            </Button>
          </div>
          <Tabs value={tab} onValueChange={(next) => content && next !== tab && onTab(next as SubjectTab, content)}>
            <TabsList className="w-full">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} disabled={!content}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </>
      )}
    </div>
  );

  return (
    <PanelSlot.Provider value={heading}>
      {content ? (
        children(content)
      ) : (
        <SidePanel label={placeState.status === "error" ? "Place not found" : "Loading place"} sheet={sheet} onSheet={onSheet}>
          {placeState.status === "error" ? null : (
            <div className="grid gap-3 p-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-16" />
            </div>
          )}
        </SidePanel>
      )}
    </PanelSlot.Provider>
  );
}
