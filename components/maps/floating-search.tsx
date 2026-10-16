"use client";

import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, NavigationIcon, SunIcon } from "lucide-react";
import type { GeocodeResult } from "@unmap/geocoding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Geocoder } from "@/components/ui/geocoder";
import { CHIPS } from "@/lib/categories";
import { API_KEY, GATEWAY } from "@/lib/config";
import type { Lang } from "@/lib/url-state";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "system", label: "Use system theme", icon: MonitorIcon },
  { id: "light", label: "Light theme", icon: SunIcon },
  { id: "dark", label: "Dark theme", icon: MoonIcon },
] as const;

/** Cycles system → light → dark, so the one button covers what a menu would. */
function ThemeButton() {
  const { theme = "system", setTheme } = useTheme();
  const index = Math.max(0, THEMES.findIndex((t) => t.id === theme));
  const current = THEMES[index]!;
  const next = THEMES[(index + 1) % THEMES.length]!;
  const Icon = current.icon;
  return (
    <Button variant="ghost" size="icon-lg" aria-label={`${current.label}. Switch to ${next.label.toLowerCase()}`} title={current.label} onClick={() => setTheme(next.id)}>
      <Icon />
    </Button>
  );
}

/**
 * The search box: the registry geocoder, as in Google Maps. On a phone it floats over the top of
 * the map; on a desktop it heads the sidebar. A place result opens its card; any other result (an
 * address, a street, a town) opens "what's here" on it.
 */
export function SearchBox({ lang, onResult, onDirections }: { lang: Lang; onResult: (r: GeocodeResult) => void; onDirections: () => void }) {
  return (
    <Card data-search-card="" className="absolute inset-x-3 top-3 z-30 gap-0 py-1.5 shadow-lg lg:static lg:shrink-0 lg:rounded-none lg:border-b lg:py-2 lg:shadow-none lg:ring-0">
      <CardHeader className="sr-only"><CardTitle>Search the map</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-1 px-1.5">
        <Geocoder
          apiKey={API_KEY}
          gateway={GATEWAY}
          lang={lang}
          proximity="map"
          placeholder="Search places and addresses"
          onSelect={onResult}
          className="min-w-0 flex-1"
        />
        <Button variant="ghost" size="icon-lg" aria-label="Directions" title="Directions" onClick={onDirections}>
          <NavigationIcon />
        </Button>
        <ThemeButton />
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
