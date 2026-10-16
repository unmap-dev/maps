"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SheetSize = "peek" | "half" | "full";

export const nextSheet = (s: SheetSize): SheetSize => (s === "peek" ? "half" : s === "half" ? "full" : "peek");

/**
 * The header of the card a panel is a tab of (a place, a dropped pin). Inside it, a panel shows
 * that card's name and tabs above its own content and keeps only its own subtitle: the card
 * already says what the screen is and has the close button.
 */
export const PanelSlot = createContext<ReactNode>(null);

/**
 * A screen's panel. On a phone it is a bottom sheet over the map; on a desktop it fills the
 * sidebar under the search box. Its content scrolls; the header and footer stay put.
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
  /** Covers the search box on a phone (directions replaces it, as in Google Maps). */
  flush?: boolean;
  sheet: SheetSize;
  onSheet: () => void;
}) {
  const card = useContext(PanelSlot);
  return (
    <section
      aria-label={label}
      data-map-panel=""
      data-sheet={sheet}
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10",
        sheet === "peek" ? "max-h-36" : sheet === "full" ? (flush ? "max-h-[calc(100%-1rem)]" : "max-h-[calc(100%-5rem)]") : "max-h-[55%]",
        "lg:static lg:max-h-none lg:min-h-0 lg:flex-1 lg:rounded-none lg:bg-transparent lg:shadow-none lg:ring-0",
      )}
    >
      <Button variant="ghost" onClick={onSheet} aria-label={sheet === "full" ? "Collapse panel" : "Expand panel"} className="h-8 w-full shrink-0 lg:hidden">
        <span className="h-1 w-10 rounded-full bg-border" />
      </Button>
      {card}
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer}
    </section>
  );
}

/** A panel's title row with a close button; inside a card's tab, its subtitle alone. */
export function PanelHeader({ title, subtitle, onClose, onBack, children }: { title?: ReactNode; subtitle?: ReactNode; onClose: () => void; onBack?: () => void; children?: ReactNode }) {
  const inCard = useContext(PanelSlot) != null;
  if (inCard) {
    return subtitle || children ? (
      <div className="shrink-0 px-4 pt-3 pb-1">
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        {children}
      </div>
    ) : null;
  }
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
