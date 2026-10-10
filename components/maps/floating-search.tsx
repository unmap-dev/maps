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
 * The search box: the registry geocoder in a floating card, as in Google Maps. A place result
 * opens its card; any other result (an address, a street, a town) opens "what's here" on it.
 */
export function FloatingSearch({ lang, onResult, onDirections }: { lang: Lang; onResult: (r: GeocodeResult) => void; onDirections: () => void }) {
  return (
    <div className="absolute inset-x-4 top-4 z-30 lg:right-auto lg:w-[400px]">
      <Card data-search-card="" className="gap-0 py-1.5">
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
    </div>
  );
}

/** Category chips: one tap is a `places.nearby` call around the map centre. */
export function CategoryChips({ active, onPick, className }: { active: string | null; onPick: (category: string) => void; className?: string }) {
  return (
    <div className={cn("absolute z-20 overflow-x-auto p-1 [scrollbar-width:none]", className)}>
      <Card className="w-max gap-0 py-1">
      <CardHeader className="sr-only"><CardTitle>Nearby categories</CardTitle></CardHeader>
      <CardContent className="px-1">
      <ToggleGroup value={active ? [active] : []} onValueChange={(values) => onPick(values[0] ?? active!)} aria-label="Nearby categories">
      {CHIPS.map(({ id, label, icon: Icon }) => (
        <ToggleGroupItem key={id} value={id} className="shrink-0">
          <Icon data-icon="inline-start" />
          {label}
        </ToggleGroupItem>
      ))}
      </ToggleGroup>
      </CardContent>
      </Card>
    </div>
  );
}
