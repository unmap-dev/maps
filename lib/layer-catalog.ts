import type { Layer, LayerCapability } from "@unmap/sdk";
import type { Lang } from "@/lib/url-state";

/**
 * The overlays the Layers sheet offers.
 *
 * Two app layers the page draws itself from data endpoints (transit stops, road events), then
 * every layer in the gateway's live catalog (`unmap.layers.list()`), grouped by the add-on its
 * tiles need. Read from the catalog rather than listed here, so a layer the gateway ships shows up
 * without a release of this app, and a retired one goes.
 */

export interface Overlay {
  id: string;
  label: string;
  /** Where coverage is verified, as the reader would say it: "Canada", "AB, SK, MB". */
  detail: string;
  addon: LayerCapability | null;
}

export interface OverlayGroup {
  id: string;
  label: string;
  /** The add-on a key needs for this group's tiles, or null when every key has it. */
  addon: LayerCapability | null;
  overlays: Overlay[];
}

/** The app's own layers, fed by `/transit` and `/roads` rather than composed into the style. */
export const APP_LAYERS: Overlay[] = [
  { id: "transit", label: "Transit stops", detail: "Published GTFS feeds", addon: null },
  { id: "roads", label: "Road events", detail: "Incidents, closures and conditions", addon: null },
];

const APP_LAYER_LABELS_FR: Record<string, { label: string; detail: string }> = {
  transit: { label: "Arrêts de transport en commun", detail: "Flux GTFS publiés" },
  roads: { label: "Événements routiers", detail: "Incidents, fermetures et conditions" },
};

/** Catalog overlay ids among the layers: what the style composes, as opposed to app layers. */
export const catalogOverlays = (layers: string[]) => layers.filter((l) => !APP_LAYERS.some((a) => a.id === l));

/** Group order and names. A capability missing here still shows, after these, under its own id. */
const GROUPS: { addon: LayerCapability | null; en: string; fr: string }[] = [
  { addon: null, en: "Boundaries", fr: "Limites" },
  { addon: "legalLand", en: "Legal land", fr: "Terres légales" },
  { addon: "agriculture", en: "Agriculture", fr: "Agriculture" },
  { addon: "energy", en: "Energy", fr: "Énergie" },
  { addon: "mining", en: "Mining", fr: "Mines" },
  { addon: "remote", en: "Remote", fr: "Régions éloignées" },
  { addon: "ski", en: "Ski", fr: "Ski" },
  { addon: "urbanNoise", en: "Urban noise", fr: "Bruit urbain" },
];

/** `["CA-AB", "CA-SK"]` → "AB, SK"; `["CA"]` → "Canada". */
export function jurisdictionLabel(codes: readonly string[] | undefined): string {
  if (!codes?.length) return "";
  if (codes.includes("CA")) return "Canada";
  return codes.map((c) => c.replace(/^CA-/, "")).join(", ");
}

/** The sheet's groups: the app layers first, then the catalog by add-on. */
export function overlayGroups(catalog: readonly Layer[], lang: Lang): OverlayGroup[] {
  const live: OverlayGroup = {
    id: "live",
    label: lang === "fr" ? "En direct" : "Live",
    addon: null,
    overlays: APP_LAYERS.map((o) => (lang === "fr" ? { ...o, ...APP_LAYER_LABELS_FR[o.id] } : o)),
  };
  const byAddon = new Map<string, Overlay[]>();
  for (const layer of catalog) {
    const key = layer.addon ?? "";
    const list = byAddon.get(key) ?? [];
    list.push({ id: layer.id, label: layer.display_name[lang] || layer.display_name.en, detail: jurisdictionLabel(layer.jurisdiction), addon: layer.addon ?? null });
    byAddon.set(key, list);
  }
  const known: string[] = GROUPS.map((g) => g.addon ?? "");
  const groups = GROUPS.filter((g) => byAddon.has(g.addon ?? "")).map((g) => ({
    id: g.addon ?? "core",
    label: lang === "fr" ? g.fr : g.en,
    addon: g.addon,
    overlays: byAddon.get(g.addon ?? "")!,
  }));
  for (const [key, overlays] of byAddon) {
    if (!known.includes(key)) groups.push({ id: key, label: key, addon: key as LayerCapability, overlays });
  }
  return [live, ...groups];
}

/** A layer's name for a message, from the catalog when it has loaded, else its id. */
export function overlayLabel(id: string, catalog: readonly Layer[] | null, lang: Lang): string {
  const app = APP_LAYERS.find((a) => a.id === id);
  if (app) return lang === "fr" ? APP_LAYER_LABELS_FR[id]!.label : app.label;
  const layer = catalog?.find((l) => l.id === id);
  return layer ? layer.display_name[lang] || layer.display_name.en : id;
}

/**
 * The style the Layers button pictures: never the one on screen, so the button reads as "there are
 * other maps" rather than as a mirror of this one. Canopy is the most unlike the default; on
 * canopy itself, the default.
 */
export const previewStyle = (current: string) => (current === "canopy" ? "base" : "canopy");
