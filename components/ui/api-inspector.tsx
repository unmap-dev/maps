"use client";

/**
 * <ApiInspector> - every unmap API call your page makes, with the SDK line and curl behind it.
 *
 * A development tool: it wraps `window.fetch` once (see `api-calls`) and lists each request to the
 * gateway as it happens, newest first, with its method, path, query, status and latency. Calls that
 * started together are grouped, with the wall time of the slowest. Open one to read the
 * `@unmap/sdk` call that makes it, the same request as curl (the key as a header, never in the
 * URL), or the response, trimmed. Tile, glyph and sprite bytes are not listed.
 *
 * `<ApiInspector>` is the inspector in your shadcn Sheet: pass an element as its child to open it,
 * or control it with `open` and `onOpenChange`. `<ApiInspectorPanel>` is the same content without
 * the Sheet, for a layout that docks it. `useApiCalls()` gives you the recorded calls to render your
 * own way. Each installs the recorder when it first renders; to see the style request a map makes
 * on creation, also call `installRecorder()` from `@/lib/api-calls` before the map mounts.
 *
 * Copied into your project by `npx shadcn add`. Edit freely.
 */

import { useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import { BlocksIcon, CheckIcon, CodeIcon, CopyIcon, InfoIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_GATEWAY,
  abridge,
  clearCalls,
  curlOf,
  describeCall,
  getCalls,
  groupCalls,
  installRecorder,
  subscribe,
  type ApiCall,
} from "@/lib/api-calls";
import { cn } from "@/lib/utils";

type Tab = "sdk" | "curl" | "result";

const NO_CALLS: readonly ApiCall[] = [];
const DESCRIPTION = "Explore map requests and copy the code behind them.";
// \u0027 is a quote: written so, the registry's import scanner does not take this text for an import.
const SETUP = "import { Unmap } from \u0027@unmap/sdk\u0027\n\nconst unmap = new Unmap({ key: 'um_live_…' })";

/**
 * The calls recorded so far, newest first, re-rendering on each change. Installs the recorder for
 * `gateway` on first use (once per page; on the server it records nothing and returns no calls).
 */
export function useApiCalls(gateway: string = DEFAULT_GATEWAY): readonly ApiCall[] {
  // During render rather than in an effect, so requests a sibling's effect makes (a map loading its
  // style) are recorded too. Idempotent, and a no-op on the server.
  installRecorder(gateway);
  return useSyncExternalStore(subscribe, getCalls, () => NO_CALLS);
}

/** Copies text, and says so for a moment. Says so too when the clipboard is refused. */
function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy. Select the text and copy it." : "Copy"}
      className="absolute top-1.5 right-1.5"
      onClick={async () => {
        let copied = false;
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          copied = false;
        }
        setState(copied ? "copied" : "failed");
        setTimeout(() => setState("idle"), 1500);
      }}
    >
      {state === "copied" ? <CheckIcon /> : state === "failed" ? <XIcon /> : <CopyIcon />}
    </Button>
  );
}

function CallBody({ call, tab, gateway }: { call: ApiCall; tab: Tab; gateway: string }) {
  const d = describeCall(call);
  const text =
    tab === "sdk"
      ? d.sdk
      : tab === "curl"
        ? curlOf(call, gateway)
        : call.error
          ? call.error
          : call.result === undefined
            ? call.status == null
              ? "Waiting for the response…"
              : "No JSON body."
            : JSON.stringify(abridge(call.result), null, 2);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 bg-muted/60 px-4 pt-2 pb-3">
      <div className="relative min-w-0 rounded-md border bg-background">
        <pre tabIndex={0} aria-label={`${tab} for ${call.path}`} className="max-h-72 overflow-auto p-2.5 pr-10 font-mono text-xs leading-relaxed">
          {text}
        </pre>
        <CopyButton text={text} />
      </div>
      {d.note ? (
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{d.note}</span>
        </p>
      ) : null}
      {d.item ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BlocksIcon className="size-3.5 shrink-0" aria-hidden />
          <span>
            UI: <code className="font-mono text-foreground">npx shadcn add @unmap/{d.item}</code>
          </span>
        </p>
      ) : null}
    </div>
  );
}

function statusClass(call: ApiCall) {
  if (call.error) return "text-destructive";
  if (call.status == null) return "text-muted-foreground";
  return call.status < 400 ? "text-foreground" : "text-destructive";
}

export interface ApiInspectorPanelProps {
  /** Gateway base URL whose calls are recorded and written into curl. */
  gateway?: string;
  /** Shows a close button in the header, which calls this. */
  onClose?: () => void;
  className?: string;
}

/**
 * The inspector without a Sheet: a column (header, calls, setup) that fills the box you give it.
 * Every request the page makes, newest first, grouped when they ran together, with the SDK call
 * behind each. It follows the newest call until the reader opens one.
 */
export function ApiInspectorPanel({ gateway = DEFAULT_GATEWAY, onClose, className }: ApiInspectorPanelProps) {
  const calls = useApiCalls(gateway);
  const [tab, setTab] = useState<Tab>("sdk");
  const [openId, setOpenId] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  // Follow the newest call until the reader opens one themselves.
  const newest = calls[0]?.id ?? null;
  const shownId = pinned ? openId : newest;
  const groups = useMemo(() => groupCalls(calls), [calls]);

  return (
    <aside aria-label="API inspector" data-slot="api-inspector" className={cn("flex flex-col overflow-hidden bg-card text-card-foreground", className)}>
      <div data-slot="api-inspector-header" className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <CodeIcon className="size-4" aria-hidden />
        <h2 className="text-base font-medium">API inspector</h2>
        <Badge variant="secondary" className="tabular-nums">
          {calls.length} {calls.length === 1 ? "call" : "calls"}
        </Badge>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={clearCalls} disabled={!calls.length}>
          Clear
        </Button>
        {onClose ? (
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close inspector">
            <XIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-xs text-muted-foreground">{DESCRIPTION}</p>
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[tab]} onValueChange={(v: unknown[]) => v[0] && setTab(v[0] as Tab)} aria-label="Show">
          <ToggleGroupItem value="sdk">SDK</ToggleGroupItem>
          <ToggleGroupItem value="curl">curl</ToggleGroupItem>
          <ToggleGroupItem value="result">Result</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No requests yet</EmptyTitle>
              <EmptyDescription>Use the map: each request it makes to unmap is listed here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => {
            const title = describeCall(group.calls[0]!).title;
            return (
              <div key={group.calls[0]!.id} className="border-b">
                <div className="flex justify-between gap-2 px-4 pt-2 pb-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{group.calls.length > 1 ? `${group.calls.length} calls in parallel` : title}</span>
                  <span className="tabular-nums">{group.ms != null ? `${group.ms} ms` : "…"}</span>
                </div>
                {group.calls.map((call) => {
                  const open = shownId === call.id;
                  const query = call.params.map(([k, v]) => `${k}=${v}`).join("&");
                  return (
                    <div key={call.id}>
                      <Button
                        variant="ghost"
                        aria-expanded={open}
                        onClick={() => {
                          setPinned(true);
                          setOpenId(open ? -1 : call.id);
                        }}
                        className={cn("grid h-auto w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left", open && "bg-muted")}
                      >
                        <Badge variant="outline">{call.method}</Badge>
                        <span className="truncate font-mono text-xs">
                          {call.path}
                          {query ? <span className="text-muted-foreground">?{query}</span> : null}
                        </span>
                        <span className="flex gap-2 text-xs text-muted-foreground tabular-nums">
                          <span className={statusClass(call)}>{call.error ? "ERR" : (call.status ?? "…")}</span>
                          {call.ms != null ? `${call.ms} ms` : ""}
                        </span>
                      </Button>
                      {open ? <CallBody call={call} tab={tab} gateway={gateway} /> : null}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1.5 border-t px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Setup</p>
        <pre className="overflow-x-auto rounded-md border bg-muted/60 p-2.5 font-mono text-xs leading-relaxed">{SETUP}</pre>
        <p className="text-xs text-muted-foreground">Tiles, glyphs and sprites come from R2 through the edge cache and are not listed.</p>
      </div>
    </aside>
  );
}

export interface ApiInspectorProps {
  /** Gateway base URL whose calls are recorded and written into curl. */
  gateway?: string;
  /** Open state, when you control it. */
  open?: boolean;
  /** Called when the Sheet asks to open or close. */
  onOpenChange?: (open: boolean) => void;
  /** The edge the Sheet slides in from. */
  side?: "top" | "right" | "bottom" | "left";
  /** The element that opens it, such as your Button. */
  children?: ReactElement;
  /** Classes for the Sheet's content. */
  className?: string;
}

/**
 * The inspector in your shadcn Sheet. Recording starts when this renders, open or not, so the
 * calls made before it opens are listed when it does.
 */
export function ApiInspector({ gateway = DEFAULT_GATEWAY, open, onOpenChange, side = "right", children, className }: ApiInspectorProps) {
  // Record while closed too. Idempotent, a no-op on the server, and in render for the same reason
  // as useApiCalls; the panel subscribes once it is open.
  installRecorder(gateway);
  return (
    <Sheet open={open} onOpenChange={(next: boolean) => onOpenChange?.(next)}>
      {children ? <SheetTrigger render={children} /> : null}
      <SheetContent side={side} className={cn("gap-0", side === "top" || side === "bottom" ? "h-[80dvh]" : "w-full", className)}>
        <SheetTitle className="sr-only">API inspector</SheetTitle>
        <SheetDescription className="sr-only">{DESCRIPTION}</SheetDescription>
        {/* Room on the right of the header for the Sheet's own close button. */}
        <ApiInspectorPanel gateway={gateway} className="min-h-0 flex-1 bg-transparent text-popover-foreground [&_[data-slot=api-inspector-header]]:pr-12" />
      </SheetContent>
    </Sheet>
  );
}
