"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { useTheme } from "next-themes";
import type { GeocodeResult, Place } from "@unmap/geocoding";
import { ApiInspector } from "@/components/ui/api-inspector";
import { Sheet } from "@/components/ui/sheet";
import { Map, type MapViewport } from "@/components/ui/map";
import { MapControls } from "@/components/ui/map-controls";
import { useMap } from "@/lib/map-context";
import { DirectionsPanel, waypointOf } from "@/components/maps/directions-panel";
import { CategoryChips, SearchBox } from "@/components/maps/floating-search";
import { PointOverview } from "@/components/maps/here-card";
import { LayersButton, LayersSheet } from "@/components/maps/layers-control";
import { RoadEventsLayer, TransitStopsLayer } from "@/components/maps/live-layers";
import { NearbyPanel } from "@/components/maps/nearby-panel";
import { PlaceOverview } from "@/components/maps/place-panel";
import { ReachPanel } from "@/components/maps/reach-panel";
import { ScorePanel } from "@/components/maps/score-panel";
import { RequestsButton, RequestsDrawer } from "@/components/maps/requests-drawer";
import { nextSheet, type SheetSize } from "@/components/maps/side-panel";
import { SubjectPanel, subjectKey, type Subject, type SubjectContent, type SubjectTab } from "@/components/maps/subject-panel";
import { EventPanel, StopPanel } from "@/components/maps/stop-event-panels";
import { useAppState } from "@/components/maps/use-app-state";
import { useChromeLayout } from "@/lib/chrome-layout";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/components/ui/toast";
import { unmap } from "@/lib/api";
import { catalogOverlays, overlayLabel } from "@/lib/layer-catalog";
import { useAsync } from "@/lib/use-async";
import { API_KEY, DEFAULT_CAMERA, GATEWAY } from "@/lib/config";
import { DEFAULT_MINUTES, roundLngLat, type LngLat, type View, type Waypoint } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** Whatever a screen needs that the URL does not carry: the name to show for a point, where a list came from. */
interface Context {
  nearLabel?: string;
  reachLabel?: string;
  scoreLabel?: string;
  /** A dropped pin's address, by subject key, once its Overview has found it. */
  pin?: { key: string; label: string | null };
}

/** Hands the map to the app shell, which sits outside the map's context. */
type MapInstance = ReturnType<typeof useMap>;

function MapHandle({ mapRef }: { mapRef: MutableRefObject<MapInstance> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

/** The card a screen belongs to, when it is a place's or a dropped pin's tab. */
function subjectOf(view: View): { subject: Subject; tab: SubjectTab } | null {
  const of = (o: string, at: LngLat): Subject => (o === "pin" ? { at } : { place: o });
  switch (view.name) {
    case "place":
      return { subject: { place: view.id }, tab: "overview" };
    case "here":
      return { subject: { at: view.at }, tab: "overview" };
    case "nearby":
      return view.of && view.near ? { subject: of(view.of, view.near), tab: "nearby" } : null;
    case "reach":
      return view.of ? { subject: of(view.of, view.origin), tab: "reach" } : null;
    case "score":
      return view.of ? { subject: of(view.of, view.origin), tab: "score" } : null;
    default:
      return null;
  }
}

const ofSubject = (s: Subject) => ("place" in s ? s.place : "pin");
const waypointOfSubject = (s: Subject): Waypoint => ("place" in s ? { place: s.place } : { at: s.at });

/** A style the gateway refused (400 or 403), with the overlays it asked for. */
interface StyleRefusal {
  status: number;
  overlays: string[];
}

/**
 * Hears a style the gateway refused. An overlay the key has no add-on for is a 403 for the whole
 * style, and an unknown one a 400, either of which leaves MapLibre with no style at all; the app
 * takes the overlay back out so the map draws again.
 */
function StyleRefusals({ onRefused }: { onRefused: (refusal: StyleRefusal) => void }) {
  const map = useMap();
  const onRefusedRef = useRef(onRefused);
  useEffect(() => {
    onRefusedRef.current = onRefused;
  });
  useEffect(() => {
    if (!map) return;
    const handler = (e: { error: unknown }) => {
      // MapLibre's AJAXError carries the status and the URL it fetched.
      const { status, url } = (e.error ?? {}) as { status?: number; url?: string };
      if ((status !== 400 && status !== 403) || !url || !url.includes("/styles/")) return;
      const overlays = new URL(url).searchParams.get("overlays")?.split(",").filter(Boolean) ?? [];
      if (overlays.length) onRefusedRef.current({ status, overlays });
    };
    map.on("error", handler);
    return () => {
      map.off("error", handler);
    };
  }, [map]);
  return null;
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
/** The sidebar's width plus its margins: where the map's open area starts on a desktop. */
const SIDEBAR = 424;

export function MapsApp() {
  const { state, go, replaceView, setPrefs, setCamera, cameraRef, shareUrl } = useAppState();
  const { view, prefs } = state;
  const { resolvedTheme } = useTheme();
  const dark = prefs.mapMode === "auto" ? resolvedTheme === "dark" : prefs.mapMode === "dark";

  const root = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // The layer catalog loads the first time the Layers sheet opens, or at once when the URL already
  // asks for a catalog overlay, and is kept from then on. A failed load retries on the next open.
  const [catalogTry, setCatalogTry] = useState(() => (catalogOverlays(state.prefs.layers).length ? 1 : 0));
  const catalog = useAsync(catalogTry ? `catalog:${catalogTry}` : null, () => unmap.layers.list());
  const catalogLayers = catalog.status === "done" ? catalog.data : null;
  const onLayersOpen = (open: boolean) => {
    if (open && (catalogTry === 0 || catalog.status === "error")) setCatalogTry((n) => n + 1);
    setLayersOpen(open);
  };
  const onStyleRefused = ({ status, overlays }: StyleRefusal) => {
    // The newest overlay is the likeliest cause; a second refusal takes the next one out.
    const id = [...overlays].reverse().find((o) => prefs.layers.includes(o));
    if (!id) return;
    setPrefs({ layers: prefs.layers.filter((l) => l !== id) });
    const name = overlayLabel(id, catalogLayers, prefs.lang);
    toast.add(
      status === 403
        ? { title: `${name} is turned off`, description: "This API key does not include the add-on that layer needs.", type: "error" }
        : { title: `${name} is turned off`, description: "The gateway does not know that layer.", type: "error" },
    );
  };
  const [ctx, setCtx] = useState<Context>({});

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

  const panelOpen = view.name !== "map";
  const card = subjectOf(view);
  const cardKey = card ? subjectKey(card.subject) : null;
  const pinLabel = cardKey && ctx.pin?.key === cardKey ? ctx.pin.label : null;

  const { desktop, height, panelHeight } = useChromeLayout(root, viewKey, sheet);
  const inspectOpen = prefs.inspect === true;
  const drawerOpen = desktop && inspectOpen;
  const drawerHeight = Math.round(Math.min(340, height * 0.42));
  // On a desktop the requests panel floats in the bottom-right corner, beside the controls, only
  // while it is open; on a phone the bottom sheet is what covers the map.
  const coveredBottom = desktop ? (drawerOpen ? drawerHeight + 12 : 0) : panelHeight;
  // The requests button sits under the map controls, clear of the attribution on a desktop.
  const requestsBottom = desktop ? 36 : panelHeight + 32;
  const hideMapControls = !desktop && panelOpen && sheet === "full";
  const chrome: Padding = {
    top: desktop || view.name === "dir" ? 16 : view.name === "map" ? 112 : 72,
    // Leave room for fits even when a full panel covers nearly all of the map.
    bottom: Math.min(coveredBottom, Math.max(0, height - 240)),
    left: desktop && panelOpen ? SIDEBAR : 0,
    right: 0,
  };
  const padding = useCallback(() => FIT_MARGIN, []);

  const navigate = useCallback(
    (next: View) => {
      setLayersOpen(false);
      go(next);
    },
    [go],
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
    if (view.name === "score") {
      // The check's own "check another spot": a click moves it to a dropped pin there, and Back
      // returns to the last one.
      navigate({ name: "score", origin: at, mode: view.mode, of: "pin" });
      return;
    }
    navigate({ name: "here", at });
  };

  const directionsTo = (to: Waypoint) => navigate({ name: "dir", from: null, to, mode: "auto" });
  const reachFrom = (origin: LngLat, label: string) => {
    setCtx((c) => ({ ...c, reachLabel: label }));
    navigate({ name: "reach", origin, minutes: DEFAULT_MINUTES, mode: "pedestrian" });
  };
  const nearbyAround = (near: LngLat, label: string, category = "food.cafe") => {
    setCtx((c) => ({ ...c, nearLabel: label }));
    navigate({ name: "nearby", category, near });
  };

  /** A tab of a card: each is its own screen, tied to the card by `of`. */
  const openTab = (subject: Subject, tab: SubjectTab, { origin }: SubjectContent) => {
    const of = ofSubject(subject);
    if (tab === "overview") navigate("place" in subject ? { name: "place", id: subject.place } : { name: "here", at: subject.at });
    else if (tab === "nearby") navigate({ name: "nearby", category: view.name === "nearby" ? view.category : "food.cafe", near: origin, of });
    else if (tab === "reach") navigate({ name: "reach", origin, minutes: DEFAULT_MINUTES, mode: "pedestrian", of });
    else navigate({ name: "score", origin, mode: "pedestrian", of });
  };

  const flyToPlace = (place: Place) => {
    mapRef.current?.flyTo({ center: place.coordinates, zoom: Math.max(15, cameraRef.current?.zoom ?? 0), duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
  };

  const closeView = () => navigate({ name: "map" });

  const nearbyPanel = (v: Extract<View, { name: "nearby" }>, nearLabel: string) => (
    <NearbyPanel
      category={v.category}
      near={v.near ?? [initial.lng, initial.lat]}
      nearLabel={nearLabel}
      lang={prefs.lang}
      sheet={sheet}
      onSheet={cycleSheet}
      onClose={closeView}
      onOpen={(place) => navigate({ name: "place", id: place.id })}
      onCategory={(category) => replaceView({ ...v, category })}
      onSearchHere={(near) => nearbyAround(near, "map centre", v.category)}
      padding={padding}
    />
  );
  const reachPanel = (v: Extract<View, { name: "reach" }>, originLabel: string) => (
    <ReachPanel
      origin={v.origin}
      originLabel={originLabel}
      minutes={v.minutes}
      mode={v.mode}
      lang={prefs.lang}
      dark={dark}
      sheet={sheet}
      onSheet={cycleSheet}
      onClose={closeView}
      onChange={(patch) => replaceView({ ...v, ...patch })}
      onOpen={(place) => navigate({ name: "place", id: place.id })}
      padding={padding}
    />
  );
  const scorePanel = (v: Extract<View, { name: "score" }>, originLabel: string) => (
    <ScorePanel
      origin={v.origin}
      originLabel={originLabel}
      mode={v.mode}
      lang={prefs.lang}
      dark={dark}
      sheet={sheet}
      onSheet={cycleSheet}
      onClose={closeView}
      onMode={(mode) => replaceView({ ...v, mode })}
      onOpenPlace={(id) => navigate({ name: "place", id })}
      onOpenStop={(id) => navigate({ name: "stop", id })}
      onShare={share}
      padding={padding}
    />
  );

  const tabContent = ({ place, name }: SubjectContent) => {
    switch (view.name) {
      case "place":
        return place ? <PlaceOverview place={place} lang={prefs.lang} sheet={sheet} onSheet={cycleSheet} /> : null;
      case "here":
        return <PointOverview at={view.at} lang={prefs.lang} sheet={sheet} onSheet={cycleSheet} onLabel={(label) => cardKey && setCtx((c) => ({ ...c, pin: { key: cardKey, label } }))} />;
      case "nearby":
        return nearbyPanel(view, name);
      case "reach":
        return reachPanel(view, name);
      case "score":
        return scorePanel(view, name);
      default:
        return null;
    }
  };

  return (
    <div ref={root} className="relative h-dvh w-full overflow-hidden" style={{
      "--map-requests-bottom": `${requestsBottom}px`,
      // The controls stand on the requests button: its 32 px and an 8 px gap.
      "--map-controls-bottom": `${requestsBottom + 40}px`,
      "--map-layers-bottom": `${desktop ? 36 : panelHeight + 32}px`,
      "--map-controls-right": "12px",
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
        <MapHandle mapRef={mapRef} />
        <MapEvents onClick={onMapClick} camera={state.camera} />
        <StyleRefusals onRefused={onStyleRefused} />
        <ChromePadding padding={chrome} />
        <TransitStopsLayer enabled={prefs.layers.includes("transit")} dark={dark} onPick={(stop) => navigate({ name: "stop", id: stop.id })} />
        <RoadEventsLayer enabled={prefs.layers.includes("roads")} dark={dark} onPick={(event) => navigate({ name: "event", id: event.id })} />
        {!hideMapControls ? <MapControls
          position="bottom-right"
          locate
          compass
          terrain
          className="bottom-[var(--map-controls-bottom)] right-[var(--map-controls-right)]"
          onLocate={(loc) => setCamera({ lng: loc.lngLat[0], lat: loc.lngLat[1], zoom: 15 })}
        /> : null}
        {!hideMapControls ? (
          <RequestsButton
            gateway={GATEWAY}
            open={inspectOpen}
            onOpenChange={(open) => setPrefs({ inspect: open })}
            className="absolute right-3 bottom-[var(--map-requests-bottom)] z-[5]"
          />
        ) : null}

        {/* One sidebar on a desktop: search, then the screen. On a phone its parts float apart:
            search over the top of the map, the screen as a sheet from the bottom. */}
        <div
          data-sidebar=""
          className={cn(
            "max-lg:contents",
            "lg:absolute lg:top-3 lg:left-3 lg:z-30 lg:flex lg:w-[400px] lg:flex-col lg:overflow-hidden lg:rounded-xl lg:bg-card lg:text-card-foreground lg:shadow-lg lg:ring-1 lg:ring-foreground/10",
            panelOpen ? "lg:bottom-3" : "lg:max-h-[calc(100%-1.5rem)]",
          )}
        >
          {view.name !== "dir" ? (
            <SearchBox lang={prefs.lang} onResult={onSearchResult} onDirections={() => navigate({ name: "dir", from: null, to: card ? waypointOfSubject(card.subject) : null, mode: "auto" })} />
          ) : null}
          {view.name === "map" ? (
            <CategoryChips
              active={null}
              onPick={(category) => nearbyAround(center(), "map centre", category)}
              wrap={desktop}
              className="max-lg:absolute max-lg:inset-x-3 max-lg:top-[4.25rem] max-lg:z-20 lg:p-3"
            />
          ) : null}

          {card ? (
            <SubjectPanel
              key={cardKey}
              subject={card.subject}
              tab={card.tab}
              lang={prefs.lang}
              label={pinLabel}
              sheet={sheet}
              onSheet={cycleSheet}
              onClose={closeView}
              onTab={(tab, content) => openTab(card.subject, tab, content)}
              onDirections={() => directionsTo(waypointOfSubject(card.subject))}
              onShare={share}
              onLoaded={(place) => view.name === "place" && flyToPlace(place)}
            >
              {tabContent}
            </SubjectPanel>
          ) : null}
          {!card && view.name === "nearby" ? nearbyPanel(view, ctx.nearLabel ?? (view.near ? "the search point" : "map centre")) : null}
          {!card && view.name === "reach" ? reachPanel(view, ctx.reachLabel ?? "this point") : null}
          {!card && view.name === "score" ? scorePanel(view, ctx.scoreLabel ?? "this point") : null}
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
        </div>

        <Sheet open={layersOpen} onOpenChange={onLayersOpen}>
          <div className={cn("absolute bottom-[var(--map-layers-bottom)] left-3 z-20 flex gap-2", panelOpen && "lg:left-[calc(424px+0.75rem)]", !panelOpen && "lg:left-3", hideMapControls && "hidden")}>
            <LayersButton style={prefs.style} dark={dark} count={prefs.layers.length} />
          </div>
          <LayersSheet prefs={prefs} dark={dark} catalog={catalog} desktop={desktop} onChange={setPrefs} />
        </Sheet>

        {drawerOpen ? (
          <RequestsDrawer
            gateway={GATEWAY}
            onOpenChange={(open) => setPrefs({ inspect: open })}
            height={drawerHeight}
            // Beside the controls column (12 px margin, 32 px buttons, 12 px gap), never over the sidebar.
            className="absolute right-14 bottom-3 z-30"
            style={{ width: `min(60rem, calc(100% - ${panelOpen ? SIDEBAR + 12 : 12}px - 3.5rem))` }}
          />
        ) : null}
        {!desktop ? <ApiInspector gateway={GATEWAY} open={inspectOpen} side="bottom" onOpenChange={(open) => setPrefs({ inspect: open })} /> : null}
      </Map>
    </div>
  );
}
