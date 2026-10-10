"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ComponentProps } from "react";
import { useTheme } from "next-themes";
import { CodeIcon } from "lucide-react";
import type { GeocodeResult, Place } from "@unmap/geocoding";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Map, type MapViewport } from "@/components/ui/map";
import { MapControls } from "@/components/ui/map-controls";
import { useMap } from "@/lib/map-context";
import { DirectionsPanel, waypointOf } from "@/components/maps/directions-panel";
import { CategoryChips, FloatingSearch } from "@/components/maps/floating-search";
import { HereCard } from "@/components/maps/here-card";
import { InspectorPanel } from "@/components/maps/inspector-panel";
import { LayersButton, LayersSheet, catalogOverlays } from "@/components/maps/layers-control";
import { RoadEventsLayer, TransitStopsLayer } from "@/components/maps/live-layers";
import { NearbyPanel } from "@/components/maps/nearby-panel";
import { PlacePanel } from "@/components/maps/place-panel";
import { ReachPanel } from "@/components/maps/reach-panel";
import { nextSheet, type SheetSize } from "@/components/maps/side-panel";
import { EventPanel, StopPanel } from "@/components/maps/stop-event-panels";
import { useAppState } from "@/components/maps/use-app-state";
import { useChromeLayout } from "@/lib/chrome-layout";
import { copyText } from "@/lib/clipboard";
import { API_KEY, DEFAULT_CAMERA, GATEWAY } from "@/lib/config";
import { DEFAULT_MINUTES, roundLngLat, type LngLat, type View } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** Whatever a screen needs that the URL does not carry: the name to show for a point, where a list came from. */
interface Context {
  nearLabel?: string;
  reachLabel?: string;
}

/**
 * Map-level events: a click on the map opens "what's here" (or fills an empty end of a route),
 * and a camera that arrives through Back is applied.
 */
function MapEvents({ onClick, camera }: { onClick: (at: LngLat) => void; camera: { lng: number; lat: number; zoom: number } | null }) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });
  useEffect(() => {
    if (!map) return;
    const handler = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number }; originalEvent: Event }) => {
      // A marker's click bubbles to the map: only a click on the canvas itself is "what's here".
      if (e.originalEvent.target !== map.getCanvas()) return;
      const hits = map.queryRenderedFeatures([e.point.x, e.point.y] as never).filter((f) => /^app-(transit|roads)/.test(String(f.source)));
      if (hits.length) return;
      onClickRef.current(roundLngLat([e.lngLat.lng, e.lngLat.lat]));
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map]);
  useEffect(() => {
    if (map && camera) map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom });
  }, [map, camera]);
  return null;
}

type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * Tells the map what the floating UI covers, so its centre, flights and fits all land in the part
 * of the map you can see. MapLibre keeps this padding on the map and adds any per-call padding to
 * it, which is why calls pass only a margin: passing the chrome to each `fitBounds` as well would
 * count it twice, and MapLibre declines (with only a console warning) to fit into a negative box.
 */
function ChromePadding({ padding }: { padding: Padding }) {
  const map = useMap();
  const { top, bottom, left, right } = padding;
  useEffect(() => {
    if (!map) return;
    // Apply before sibling panels fit their results: a fit cancels any in-flight padding animation.
    map.setPadding({ top, bottom, left, right });
  }, [map, top, bottom, left, right]);
  return null;
}

/** The margin every fit adds inside the visible part of the map. */
const FIT_MARGIN = { top: 48, bottom: 48, left: 48, right: 48 };

export function MapsApp() {
  const { state, go, replaceView, setPrefs, setCamera, cameraRef, shareUrl } = useAppState();
  const { view, prefs } = state;
  const { resolvedTheme } = useTheme();
  const dark = prefs.mapMode === "auto" ? resolvedTheme === "dark" : prefs.mapMode === "dark";

  const root = useRef<HTMLDivElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [ctx, setCtx] = useState<Context>({});
  const [cameFrom, setCameFrom] = useState<View["name"] | null>(null);

  // Each new screen opens its sheet half-way: the size is remembered per screen.
  const viewKey = JSON.stringify(view);
  const [sheetState, setSheetState] = useState<{ key: string; size: SheetSize }>({ key: viewKey, size: "half" });
  const sheet = sheetState.key === viewKey ? sheetState.size : "half";
  const cycleSheet = () => setSheetState({ key: viewKey, size: nextSheet(sheet) });

  const [initial] = useState(() => state.camera ?? DEFAULT_CAMERA);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewportChange = useCallback(
    (v: MapViewport) => {
      if (viewportTimer.current) clearTimeout(viewportTimer.current);
      const [lng, lat] = roundLngLat(v.center);
      const camera = { lng, lat, zoom: v.zoom };
      cameraRef.current = camera;
      viewportTimer.current = setTimeout(() => setCamera(camera), 300);
    },
    [setCamera, cameraRef],
  );

  const center = (): LngLat => {
    const c = cameraRef.current ?? initial;
    return roundLngLat([c.lng, c.lat]);
  };

  const panelOpen = view.name !== "map" && view.name !== "here";

  const { desktop, dockInspector, width, height, panelHeight } = useChromeLayout(root, viewKey, sheet);
  const inspectOpen = prefs.inspect ?? width >= 1440;
  const coveredBottom = desktop ? 0 : panelHeight;
  const hideMapControls = !desktop && panelOpen && sheet === "full";
  const chrome: Padding = {
    top: view.name === "dir" ? 16 : desktop ? 76 : 112,
    // Leave room for fits even when a full panel covers nearly all of the map.
    bottom: Math.min(coveredBottom, Math.max(0, height - 240)),
    left: desktop && panelOpen ? 432 : 0,
    right: dockInspector && inspectOpen ? 412 : 0,
  };
  const padding = useCallback(() => FIT_MARGIN, []);

  const navigate = useCallback(
    (next: View) => {
      setCameFrom(view.name);
      setLayersOpen(false);
      go(next);
    },
    [go, view],
  );

  const share = () => void copyText(shareUrl(), "Link copied");

  const onSearchResult = (r: GeocodeResult) => {
    const w = waypointOf(r);
    if ("place" in w) navigate({ name: "place", id: w.place });
    else navigate({ name: "here", at: w.at });
  };

  const onMapClick = (at: LngLat) => {
    setLayersOpen(false);
    if (view.name === "dir" && (!view.from || !view.to)) {
      replaceView({ ...view, ...(view.from ? { to: { at } } : { from: { at } }) });
      return;
    }
    navigate({ name: "here", at });
  };

  const directionsTo = (to: { place: string } | { at: LngLat }) => navigate({ name: "dir", from: null, to, mode: "auto" });
  const reachFrom = (origin: LngLat, label: string) => {
    setCtx((c) => ({ ...c, reachLabel: label }));
    navigate({ name: "reach", origin, minutes: DEFAULT_MINUTES, mode: "pedestrian" });
  };
  const nearbyAround = (near: LngLat, label: string, category = "food.cafe") => {
    setCtx((c) => ({ ...c, nearLabel: label }));
    navigate({ name: "nearby", category, near });
  };

  const flyToPlace = (place: Place, mapRef: { flyTo: (o: object) => void } | null) => {
    mapRef?.flyTo({ center: place.coordinates, zoom: Math.max(15, cameraRef.current?.zoom ?? 0), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
  };

  const closeView = () => navigate({ name: "map" });

  return (
    <div ref={root} className="relative h-dvh w-full overflow-hidden" style={{
      "--map-controls-bottom": `${coveredBottom + (desktop ? 40 : 32)}px`,
      "--map-controls-right": `${dockInspector && inspectOpen ? 412 : 16}px`,
    } as CSSProperties}>
      <Map
        apiKey={API_KEY}
        gateway={GATEWAY}
        style={prefs.style}
        mode={prefs.mapMode}
        lang={prefs.lang}
        overlays={catalogOverlays(prefs.layers)}
        center={[initial.lng, initial.lat]}
        zoom={initial.zoom}
        controls={false}
        onViewportChange={onViewportChange}
        className="rounded-none"
        containerStyle={{ position: "absolute", inset: 0, minHeight: 0 }}
      >
        <MapEvents onClick={onMapClick} camera={state.camera} />
        <ChromePadding padding={chrome} />
        <TransitStopsLayer enabled={prefs.layers.includes("transit")} dark={dark} onPick={(stop) => navigate({ name: "stop", id: stop.id })} />
        <RoadEventsLayer enabled={prefs.layers.includes("roads")} dark={dark} onPick={(event) => navigate({ name: "event", id: event.id })} />
        {!hideMapControls ? <MapControls
          position="bottom-right"
          locate
          compass
          className="bottom-[var(--map-controls-bottom)] right-[var(--map-controls-right)]"
          onLocate={(loc) => setCamera({ lng: loc.lngLat[0], lat: loc.lngLat[1], zoom: 15 })}
        /> : null}

        {view.name !== "dir" ? (
          <>
            <FloatingSearch lang={prefs.lang} onResult={onSearchResult} onDirections={() => navigate({ name: "dir", from: null, to: view.name === "place" ? { place: view.id } : null, mode: "auto" })} />
            <CategoryChips
              active={view.name === "nearby" ? view.category : null}
              onPick={(category) =>
                view.name === "nearby" && view.category === category
                  ? closeView()
                  : view.name === "nearby" && view.near
                    ? nearbyAround(view.near, ctx.nearLabel ?? "map centre", category)
                    : nearbyAround(center(), "map centre", category)
              }
              className={cn("inset-x-4 top-[4.5rem] lg:top-5 lg:left-[calc(400px+2rem)]", inspectOpen && dockInspector ? "lg:right-[26rem]" : "lg:right-44")}
            />
          </>
        ) : null}

        {view.name === "place" ? (
          <PlaceView
            id={view.id}
            lang={prefs.lang}
            sheet={sheet}
            onSheet={cycleSheet}
            onClose={closeView}
            onBack={cameFrom === "nearby" || cameFrom === "reach" ? () => window.history.back() : undefined}
            fly={flyToPlace}
            actions={(place) => ({
              onDirections: () => directionsTo({ place: place.id }),
              onReach: () => reachFrom(place.coordinates, place.name),
              onNearby: () => nearbyAround(place.coordinates, place.name),
              onShare: share,
            })}
          />
        ) : null}
        {view.name === "here" ? (
          <HereCard
            at={view.at}
            lang={prefs.lang}
            panelOpen={false}
            onClose={closeView}
            actions={{
              onDirections: () => directionsTo({ at: view.at }),
              onReach: (label) => reachFrom(view.at, label),
              onNearby: () => nearbyAround(view.at, "this point"),
            }}
          />
        ) : null}
        {view.name === "nearby" ? (
          <NearbyPanel
            category={view.category}
            near={view.near ?? [initial.lng, initial.lat]}
            nearLabel={ctx.nearLabel ?? (view.near ? "the search point" : "map centre")}
            lang={prefs.lang}
            sheet={sheet}
            onSheet={cycleSheet}
            onClose={closeView}
            onOpen={(place) => navigate({ name: "place", id: place.id })}
            onSearchHere={() => {
              setCtx((c) => ({ ...c, nearLabel: "map centre" }));
              replaceView({ ...view, near: center() });
            }}
            padding={padding}
          />
        ) : null}
        {view.name === "reach" ? (
          <ReachPanel
            origin={view.origin}
            originLabel={ctx.reachLabel ?? "this point"}
            minutes={view.minutes}
            mode={view.mode}
            lang={prefs.lang}
            dark={dark}
            sheet={sheet}
            onSheet={cycleSheet}
            onClose={closeView}
            onChange={(patch) => replaceView({ ...view, ...patch })}
            onOpen={(place) => navigate({ name: "place", id: place.id })}
            padding={padding}
          />
        ) : null}
        {view.name === "dir" ? (
          <DirectionsPanel
            from={view.from}
            to={view.to}
            mode={view.mode}
            hills={view.hills ?? 0.5}
            avoid={view.avoid ?? []}
            lang={prefs.lang}
            sheet={sheet}
            onSheet={cycleSheet}
            onClose={closeView}
            onChange={(patch) => replaceView({ ...view, ...patch })}
            padding={padding}
          />
        ) : null}
        {view.name === "stop" ? (
          <StopPanel
            id={view.id}
            sheet={sheet}
            onSheet={cycleSheet}
            onClose={closeView}
            onDirections={(at) => directionsTo({ at })}
            onReach={(at, label) => reachFrom(at, label)}
          />
        ) : null}
        {view.name === "event" ? <EventPanel id={view.id} near={[(state.camera ?? initial).lng, (state.camera ?? initial).lat]} sheet={sheet} onSheet={cycleSheet} onClose={closeView} /> : null}

        <Sheet open={layersOpen} onOpenChange={setLayersOpen}>
          <LayersButton
            className={cn("absolute z-20 left-4 bottom-[var(--map-controls-bottom)]", panelOpen && "lg:left-[calc(400px+2rem)]", hideMapControls && "hidden")}
          />
          <LayersSheet prefs={prefs} dark={dark} desktop={desktop} onChange={setPrefs} />
        </Sheet>

        {inspectOpen ? (
          <InspectorPanel
            docked={dockInspector}
            onClose={() => setPrefs({ inspect: false })}
          />
        ) : (
          <Button
            variant="outline"
            className={cn("absolute z-20 shadow-md", "right-4 bottom-[calc(var(--map-controls-bottom)+10rem)] lg:bottom-auto lg:top-5", hideMapControls && "hidden")}
            onClick={() => {
              setPrefs({ inspect: true });
            }}
            aria-label="Open the API inspector"
          >
            <CodeIcon data-icon="inline-start" />
            <span className="max-lg:sr-only">API inspector</span>
          </Button>
        )}
      </Map>
    </div>
  );
}

/** The place card, plus the flight to the place once it has loaded. */
function PlaceView(props: Omit<ComponentProps<typeof PlacePanel>, "onLoaded"> & { fly: (place: Place, map: { flyTo: (o: object) => void } | null) => void }) {
  const map = useMap();
  const { fly, ...rest } = props;
  return <PlacePanel {...rest} onLoaded={(place) => fly(place, map)} />;
}
