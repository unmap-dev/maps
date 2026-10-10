"use client";

import type { ReactNode } from "react";
import { ArrowLeftIcon, BlocksIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SheetSize = "peek" | "half" | "full";

export const nextSheet = (s: SheetSize): SheetSize => (s === "peek" ? "half" : s === "half" ? "full" : "peek");

/**
 * The left panel: a card beside the map on desktop, a bottom sheet on phones. Its content scrolls;
 * the header and footer stay put.
 */
export function SidePanel({
  label,
  header,
  footer,
  children,
  flush,
  sheet,
  onSheet,
}: {
  label: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Sit at the top edge (directions replaces the search box, as in Google Maps). */
  flush?: boolean;
  sheet: SheetSize;
  onSheet: () => void;
}) {
  return (
    <section
      aria-label={label}
      data-map-panel=""
      data-sheet={sheet}
      className={cn(
        "absolute z-20 flex flex-col overflow-hidden bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10",
        "inset-x-0 bottom-0 rounded-t-2xl",
        sheet === "peek" ? "max-h-36" : sheet === "full" ? (flush ? "max-h-[calc(100%-1rem)]" : "max-h-[calc(100%-7rem)]") : "max-h-[55%]",
        "lg:inset-x-auto lg:bottom-auto lg:left-4 lg:w-[400px] lg:rounded-xl",
        flush ? "lg:top-4 lg:max-h-[calc(100%-2rem)]" : "lg:top-[4.75rem] lg:max-h-[calc(100%-5.75rem)]",
      )}
    >
      <Button variant="ghost" onClick={onSheet} aria-label={sheet === "full" ? "Collapse panel" : "Expand panel"} className="h-8 w-full shrink-0 lg:hidden">
        <span className="h-1 w-10 rounded-full bg-border" />
      </Button>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer}
    </section>
  );
}

/** Which registry items a panel is built from: the showcase's whole point, said once per panel. */
export function BuiltFrom({ items }: { items: string[] }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
      <BlocksIcon className="size-3.5" aria-hidden />
      <span>Built from</span>
      {items.map((item) => (
        <code key={item} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          @unmap/{item}
        </code>
      ))}
    </div>
  );
}

/** A panel's title row with a close button. */
export function PanelHeader({ title, subtitle, onClose, onBack, children }: { title?: ReactNode; subtitle?: ReactNode; onClose: () => void; onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-2 px-4 pt-3 pb-2 lg:pt-4">
      {onBack ? <BackButton onClick={onBack} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <h2 className="text-base font-semibold text-balance">{title}</h2> : null}
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        {children}
      </div>
      <CloseButton onClick={onClose} />
    </div>
  );
}

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="ghost" size="icon-lg" onClick={onClick} aria-label={label}>
      <XIcon />
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label="Back">
      <ArrowLeftIcon />
    </Button>
  );
}
