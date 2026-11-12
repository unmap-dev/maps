"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDownIcon, LayersIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import type { Layer } from "@unmap/sdk";
import { STYLE_NAMES } from "@unmap/maps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BASE_PATH } from "@/lib/config";
import { overlayGroups, previewStyle, type OverlayGroup } from "@/lib/layer-catalog";
import type { AsyncState } from "@/lib/use-async";
import type { Lang, MapMode, Prefs } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/**
 * A style's capture over downtown Calgary in one mode (public/style-thumbnails, written by
 * scripts/capture-style-thumbnails.mjs), so the button and the picker show the real cartography
 * without a live map apiece.
 */
export const styleThumbnail = (style: string, dark: boolean) => `${BASE_PATH}/style-thumbnails/${style}-${dark ? "dark" : "light"}.jpg`;

/**
 * The button that opens the Layers panel: a picture of another style than the one on screen (see
 * `previewStyle`), in the map's mode, with a badge counting the overlays that are on. 64 px on a
 * phone, 76 px on a desktop.
 */
export function LayersButton({ style, dark, count, className }: { style: string; dark: boolean; count: number; className?: string }) {
  return (
    <SheetTrigger
      render={
        <Button
          variant="outline"
          className={cn(
            "relative size-16 overflow-visible rounded-xl border-2 border-white p-0 shadow-md transition-shadow hover:shadow-lg lg:size-19 dark:border-white",
            className,
          )}
        />
      }
      aria-label={count ? `Map styles and layers, ${count} ${count === 1 ? "overlay" : "overlays"} on` : "Map styles and layers"}
    >
      <span className="absolute inset-0 overflow-hidden rounded-[calc(var(--radius-xl)-2px)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static export has no image optimiser */}
        <img src={styleThumbnail(previewStyle(style), dark)} alt="" className="size-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-black/70 to-transparent" />
        <span className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1 text-xs font-medium text-white">
          <LayersIcon className="size-3.5" aria-hidden />
          Layers
        </span>
      </span>
      {count > 0 ? (
        <Badge aria-hidden className="pointer-events-none absolute -top-2 -right-2 h-5 min-w-5 px-1.5 tabular-nums ring-2 ring-white">
          {count}
        </Badge>
      ) : null}
    </SheetTrigger>
  );
}

/** Every style, pictured in the mode the map is in. */
function StylePicker({ value, dark, onChange }: { value: string; dark: boolean; onChange: (style: string) => void }) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0])}
      aria-label="Map style"
      spacing={2}
      className="grid w-full grid-cols-3"
    >
      {STYLE_NAMES.map((style) => (
        <ToggleGroupItem
          key={style}
          value={style}
          aria-label={style}
          className="group/style h-auto min-w-0 flex-col items-stretch gap-1.5 rounded-lg p-0 hover:bg-transparent aria-pressed:bg-transparent data-[state=on]:bg-transparent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a static export has no image optimiser */}
          <img
            src={styleThumbnail(style, dark)}
            alt=""
            loading="lazy"
            className="aspect-[5/4] w-full rounded-lg object-cover ring-1 ring-foreground/10 transition-shadow group-hover/style:ring-foreground/30 group-aria-pressed/style:ring-2 group-aria-pressed/style:ring-primary"
          />
          <span className="truncate text-xs capitalize text-muted-foreground group-aria-pressed/style:font-medium group-aria-pressed/style:text-foreground">{style}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** One group of overlays: a header that folds, then a switch per layer. */
function OverlaySection({ group, active, onToggle, lang }: { group: OverlayGroup; active: string[]; onToggle: (id: string, on: boolean) => void; lang: Lang }) {
  const on = group.overlays.filter((o) => active.includes(o.id)).length;
  // The groups every key can draw start open; an add-on group opens when one of its layers is on.
  const [open, setOpen] = useState(group.addon === null || on > 0);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2" />}>
        <ChevronDownIcon data-icon="inline-start" className={cn("transition-transform", !open && "-rotate-90")} />
        <span className="font-medium">{group.label}</span>
        {group.addon ? <Badge variant="outline">{lang === "fr" ? "Module" : "Add-on"}</Badge> : null}
        <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
          {on > 0 ? `${on} / ${group.overlays.length}` : group.overlays.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-0.5 pb-2 pl-8">
        {group.overlays.map((o) => (
          <Field key={o.id} orientation="horizontal" className="py-1.5 pr-2">
            <FieldContent>
              <FieldLabel htmlFor={`overlay-${o.id}`}>{o.label}</FieldLabel>
              {o.detail ? <FieldDescription>{o.detail}</FieldDescription> : null}
            </FieldContent>
            <Switch id={`overlay-${o.id}`} checked={active.includes(o.id)} onCheckedChange={(next) => onToggle(o.id, next)} />
          </Field>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const THEMES = [
  { id: "system", label: "System", icon: MonitorIcon },
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
] as const;

export function LayersSheet({
  prefs,
  dark,
  catalog,
  onChange,
  desktop,
}: {
  prefs: Prefs;
  /** Whether the map is drawn dark, so the style pictures match it. */
  dark: boolean;
  catalog: AsyncState<Layer[]>;
  onChange: (patch: Partial<Prefs>) => void;
  desktop: boolean;
}) {
  const { theme = "system", setTheme } = useTheme();
  const toggle = (id: string, on: boolean) => onChange({ layers: on ? [...prefs.layers, id] : prefs.layers.filter((l) => l !== id) });
  const groups = overlayGroups(catalog.status === "done" ? catalog.data : [], prefs.lang);
  return (
    <SheetContent side={desktop ? "right" : "bottom"} className={desktop ? "w-full sm:max-w-[400px]" : "max-h-[85dvh]"}>
      <SheetHeader>
        <SheetTitle>Map styles and layers</SheetTitle>
        <SheetDescription>Choose a map style and turn on data from the unmap layer catalog.</SheetDescription>
      </SheetHeader>
      <div className="grid min-h-0 gap-5 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <section className="grid gap-3" aria-labelledby="layers-style">
          <div className="flex items-center justify-between gap-3">
            <h3 id="layers-style" className="text-sm font-medium">Style</h3>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[prefs.mapMode]}
              onValueChange={(v) => v[0] && onChange({ mapMode: v[0] as MapMode })}
              aria-label="Map colours"
            >
              <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <StylePicker value={prefs.style} dark={dark} onChange={(style) => onChange({ style })} />
          <p className="text-xs text-muted-foreground">
            Previews of Calgary. © unmap ©{" "}
            <a className="underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
          </p>
        </section>
        <Separator />
        <section className="grid gap-1" aria-labelledby="layers-overlays">
          <h3 id="layers-overlays" className="mb-1 text-sm font-medium">Overlays</h3>
          {groups.map((group) => (
            <OverlaySection key={group.id} group={group} active={prefs.layers} onToggle={toggle} lang={prefs.lang} />
          ))}
          {catalog.status === "loading" ? (
            <div className="grid gap-2 px-2 pt-1" role="status" aria-label="Loading the layer catalog">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          ) : null}
          {catalog.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>The layer catalog did not load, so only the live layers are listed. Reopen this panel to try again.</AlertDescription>
            </Alert>
          ) : null}
          <p className="px-2 pt-1 text-xs text-muted-foreground">Add-on layers draw only with a key that includes the add-on.</p>
        </section>
        <Separator />
        <section className="grid gap-4" aria-labelledby="layers-display">
          <h3 id="layers-display" className="text-sm font-medium">Display</h3>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel id="layers-theme">App theme</FieldLabel>
              <FieldDescription>Auto map colours follow it.</FieldDescription>
            </FieldContent>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[theme]} onValueChange={(v) => v[0] && setTheme(v[0])} aria-labelledby="layers-theme">
              {THEMES.map(({ id, label, icon: Icon }) => (
                <ToggleGroupItem key={id} value={id} aria-label={label} title={label}>
                  <Icon />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel id="layers-lang">Label language</FieldLabel>
              <FieldDescription>Map labels and search results. Indigenous names show in either.</FieldDescription>
            </FieldContent>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[prefs.lang]} onValueChange={(v) => v[0] && onChange({ lang: v[0] as Lang })} aria-labelledby="layers-lang">
              <ToggleGroupItem value="en">EN</ToggleGroupItem>
              <ToggleGroupItem value="fr">FR</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </section>
      </div>
    </SheetContent>
  );
}
