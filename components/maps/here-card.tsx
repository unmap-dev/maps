"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Marker } from "@/components/ui/marker-popup";
import { LandRows, landContext } from "@/components/maps/place-panel";
import { SidePanel, type SheetSize } from "@/components/maps/side-panel";
import { addressLine } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { Lang, LngLat } from "@/lib/url-state";

/**
 * "What's here", the Overview tab of a dropped pin. The same parallel calls the place card makes:
 * a reverse geocode names the spot and brings treaty context, the rest add elevation, time zone
 * and land. The name it finds is handed up, so the pin's other tabs can show it too.
 */
export function PointOverview({ at, lang, sheet, onSheet, onLabel }: { at: LngLat; lang: Lang; sheet: SheetSize; onSheet: () => void; onLabel: (label: string | null) => void }) {
  const ctxState = useAsync(`${at.join(",")}|${lang}`, (signal) => landContext(at, lang, signal));
  const ctx = ctxState.status === "done" ? ctxState.data : null;
  const top = ctx?.near;
  const label = top ? (addressLine(top.address) ?? top.name) : null;

  useEffect(() => {
    if (ctxState.status === "done") onLabel(label);
    // Report once per result, not on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxState.status, label]);

  return (
    <SidePanel label="What's here" sheet={sheet} onSheet={onSheet}>
      <Marker lngLat={at} />
      <div className="px-4 py-3">{ctx ? <LandRows ctx={ctx} /> : <Skeleton className="h-24" />}</div>
    </SidePanel>
  );
}
