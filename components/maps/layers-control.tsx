"use client";

import { LayersIcon } from "lucide-react";
import { RECIPES, type ThemeBase } from "@unmap/themes";
import { STYLE_NAMES } from "@unmap/maps";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Lang, MapMode, Prefs } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** Overlays the layers sheet offers: two app layers fed by data endpoints, then catalog overlays. */
export const OVERLAYS: { id: string; label: string; detail: string; addon?: string }[] = [
  { id: "transit", label: "Transit", detail: "Stops from published GTFS feeds" },
  { id: "roads", label: "Road events", detail: "Incidents, closures and conditions" },
  { id: "treaties", label: "Treaties", detail: "Treaty representations" },
  { id: "aboriginal-lands", label: "Aboriginal lands", detail: "Legislative boundaries, NRCan" },
  { id: "municipalities", label: "Municipalities", detail: "Municipal boundaries" },
  { id: "parks", label: "Protected areas", detail: "Protected and conserved areas" },
  { id: "survey.dls", label: "Legal land grid", detail: "Dominion Land Survey sections", addon: "legal-land" },
];

/** Catalog overlay ids among the layers: what the style composes, as opposed to app layers. */
export const catalogOverlays = (layers: string[]) => layers.filter((l) => l !== "transit" && l !== "roads");

/** A tiny map drawn in a style's own colours, from the same recipes the gateway builds styles from. */
function Swatch({ style, dark, className }: { style: string; dark: boolean; className?: string }) {
  const recipe = RECIPES[style as ThemeBase]?.[dark ? "dark" : "light"];
  if (!recipe) return <span className={cn("block bg-muted", className)} />;
  return (
    <svg viewBox="0 0 52 40" className={cn("block", className)} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="52" height="40" fill={recipe.earth} />
      <rect x="30" y="4" width="16" height="10" rx="2" fill={recipe.parkA} />
      <path d="M-2 30 C 14 22, 28 34, 54 22" fill="none" stroke={recipe.water} strokeWidth="7" />
      <path d="M14 -2V42M-2 16H54" stroke={recipe.roads.major} strokeWidth="2.4" />
      <path d="M40 -2 L34 42" stroke={recipe.roads.highway} strokeWidth="3" />
    </svg>
  );
}

export function LayersButton({ className }: { className?: string }) {
  return (
    <SheetTrigger render={<Button variant="outline" size="lg" className={className} />} aria-label="Map styles and layers">
      <LayersIcon data-icon="inline-start" />
      Layers
    </SheetTrigger>
  );
}

export function LayersSheet({
  prefs,
  dark,
  onChange,
  desktop,
}: {
  prefs: Prefs;
  dark: boolean;
  onChange: (patch: Partial<Prefs>) => void;
  desktop: boolean;
}) {
  const toggle = (id: string, on: boolean) => onChange({ layers: on ? [...prefs.layers, id] : prefs.layers.filter((l) => l !== id) });
  return (
    <SheetContent side={desktop ? "right" : "bottom"} className={desktop ? "w-full sm:max-w-[400px]" : "max-h-[85dvh]"}>
      <SheetHeader>
        <SheetTitle>Map styles and layers</SheetTitle>
        <SheetDescription>Choose a map style and explore additional data.</SheetDescription>
      </SheetHeader>
      <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <section className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Style</h3>
          <ToggleGroup variant="outline" value={[prefs.style]} onValueChange={(v) => v[0] && onChange({ style: v[0] })} aria-label="Map style" className="grid w-full grid-cols-4 gap-2">
            {STYLE_NAMES.map((style) => (
              <ToggleGroupItem key={style} value={style} className="h-auto flex-col gap-1 p-1">
                <Swatch
                  style={style}
                  dark={dark}
                  className="size-auto aspect-[1.3] w-full overflow-hidden rounded-md"
                />
                <span className="text-xs capitalize">{style}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Mode</h3>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[prefs.mapMode]}
            onValueChange={(v) => v[0] && onChange({ mapMode: v[0] as MapMode })}
            aria-label="Map mode"
          >
            <ToggleGroupItem value="auto">Automatic</ToggleGroupItem>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Separator />
        <section className="grid gap-1">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Overlays</h3>
          {OVERLAYS.map((o) => (
            <Field key={o.id} orientation="horizontal" className="py-1.5">
              <FieldContent>
                <FieldLabel htmlFor={`overlay-${o.id}`}>
                  {o.label}
                  {o.addon ? <Badge variant="outline">Add-on</Badge> : null}
                </FieldLabel>
                <FieldDescription>{o.detail}</FieldDescription>
              </FieldContent>
              <Switch id={`overlay-${o.id}`} checked={prefs.layers.includes(o.id)} onCheckedChange={(on) => toggle(o.id, on)} />
            </Field>
          ))}
        </section>
        <Separator />
        <div className="grid gap-3">
          <div>
            <h3 className="text-sm">Label language</h3>
            <p className="text-xs text-muted-foreground">Map labels and search results. Indigenous names appear in either language.</p>
          </div>
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[prefs.lang]} onValueChange={(v) => v[0] && onChange({ lang: v[0] as Lang })} aria-label="Label language">
            <ToggleGroupItem value="en">English</ToggleGroupItem>
            <ToggleGroupItem value="fr">Français</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </SheetContent>
  );
}
