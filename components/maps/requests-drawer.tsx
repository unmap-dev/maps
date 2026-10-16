"use client";

import { useMemo, useState } from "react";
import { BlocksIcon, ChevronDownIcon, ChevronUpIcon, CodeIcon, CopyIcon, InfoIcon, PanelRightOpenIcon } from "lucide-react";
import { ApiInspector, useApiCalls } from "@/components/ui/api-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { abridge, clearCalls, curlOf, describeCall, type ApiCall } from "@/lib/api-calls";
import { copyText } from "@/lib/clipboard";
import { barOf, burstsOf, type Burst } from "@/lib/timeline";
import { cn } from "@/lib/utils";

type Show = "sdk" | "curl" | "result";

/** The error the recorder writes for a request the page aborted. */
const CANCELLED = "Cancelled";

const fmtMs = (ms: number | null) => (ms == null ? "…" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

function textOf(call: ApiCall, show: Show, gateway: string) {
  if (show === "sdk") return describeCall(call).sdk;
  if (show === "curl") return curlOf(call, gateway);
  if (call.error) return call.error;
  if (call.result === undefined) return call.status == null ? "Waiting for the response…" : "No JSON body.";
  return JSON.stringify(abridge(call.result), null, 2);
}

/** One burst: what a single action set off, drawn against its own wall time. */
function BurstTimeline({ burst, selected, onSelect, now }: { burst: Burst; selected: number | null; onSelect: (id: number) => void; now: number }) {
  const count = burst.rows.reduce((n, r) => n + r.calls.length, 0);
  return (
    <div className="border-b pb-2">
      <p className="px-4 pt-2.5 pb-1 text-xs text-muted-foreground">
        {count} {count === 1 ? "call" : "calls"}, {burst.ms == null ? "still running" : `${fmtMs(burst.ms)} end to end`}
      </p>
      {burst.rows.map((row) => {
        const ms = row.calls.every((c) => c.ms != null) ? Math.max(...row.calls.map((c) => c.ms!)) : null;
        const active = row.calls.some((c) => c.id === selected);
        // A call the page cancelled (it moved on, or React re-ran an effect) is not a failure.
        const cancelled = row.calls.every((c) => c.error === CANCELLED);
        const failed = !cancelled && row.calls.some((c) => (c.error && c.error !== CANCELLED) || (c.status != null && c.status >= 400));
        return (
          <Button
            key={row.calls[0]!.id}
            variant="ghost"
            aria-pressed={active}
            onClick={() => onSelect(row.calls[0]!.id)}
            className={cn("grid h-auto w-full grid-cols-[9rem_4.5rem_minmax(0,1fr)] items-center gap-3 rounded-none px-4 py-1.5 text-left text-xs font-normal", active && "bg-muted")}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.title}</span>
              {row.calls.length > 1 ? <span className="block text-muted-foreground">{row.calls.length} in parallel</span> : null}
            </span>
            <span className={cn("font-mono tabular-nums", failed ? "text-destructive" : "text-muted-foreground")}>{cancelled ? "cancelled" : failed ? "failed" : fmtMs(ms)}</span>
            <span className="relative h-full min-h-5" aria-hidden>
              {row.calls.map((call, i) => {
                const bar = barOf(call, burst, now);
                const h = row.calls.length > 1 ? Math.max(3, 16 / row.calls.length) : 8;
                return (
                  <span
                    key={call.id}
                    className={cn("absolute rounded-sm", active ? "bg-primary" : "bg-muted-foreground/50", call.ms == null && "animate-pulse")}
                    style={{ left: `${bar.left}%`, width: `${bar.width}%`, height: h, top: row.calls.length > 1 ? 2 + i * (h + 1) : `calc(50% - ${h / 2}px)` }}
                  />
                );
              })}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/** The selected call: its SDK line, curl or response, and the registry item behind it. */
function CallDetail({ call, siblings, gateway, show, onShow, onSelect }: { call: ApiCall; siblings: ApiCall[]; gateway: string; show: Show; onShow: (show: Show) => void; onSelect: (id: number) => void }) {
  const d = describeCall(call);
  const text = textOf(call, show, gateway);
  const query = call.params.map(([k, v]) => `${k}=${v}`).join("&");
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 truncate text-sm font-semibold">{d.title}</h3>
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[show]} onValueChange={(v: unknown[]) => v[0] && onShow(v[0] as Show)} aria-label="Show">
          <ToggleGroupItem value="sdk">SDK</ToggleGroupItem>
          <ToggleGroupItem value="curl">curl</ToggleGroupItem>
          <ToggleGroupItem value="result">Response</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground" title={`${call.path}${query ? `?${query}` : ""}`}>
        <Badge variant="outline" className="mr-1.5">{call.method}</Badge>
        {call.path}
        {query ? `?${query}` : ""}
        <span className={cn("ml-2", call.error || (call.status ?? 0) >= 400 ? "text-destructive" : "text-foreground")}>{call.error ? "ERR" : (call.status ?? "…")}</span>
        <span className="ml-2">{fmtMs(call.ms)}</span>
      </p>
      {siblings.length > 1 ? (
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[String(call.id)]} onValueChange={(v: unknown[]) => v[0] && onSelect(Number(v[0]))} aria-label="Parallel calls">
          {siblings.map((s, i) => (
            <ToggleGroupItem key={s.id} value={String(s.id)} aria-label={`Call ${i + 1} of ${siblings.length}`}>
              {i + 1}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <div className="relative min-h-0 flex-1 rounded-md border bg-muted/60">
        <pre tabIndex={0} aria-label={`${show} for ${call.path}`} className="h-full overflow-auto p-2.5 pr-10 font-mono text-xs leading-relaxed">
          {text}
        </pre>
        <Button variant="outline" size="icon-sm" aria-label="Copy" className="absolute top-1.5 right-1.5" onClick={() => copyText(text, "Copied")}>
          <CopyIcon />
        </Button>
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

/**
 * Every request the page makes, along the bottom of the map. Closed, it is one line: the count and
 * the SDK call behind the newest request. Open, it draws each action's calls on a timeline, so
 * calls that ran together read as parallel bars, with the SDK line, curl or response of the one you
 * pick. Built on the `api-inspector` item's `useApiCalls()`; the item itself opens as the full
 * inspector beside it.
 */
export function RequestsDrawer({ gateway, open, onOpenChange, height, className }: { gateway: string; open: boolean; onOpenChange: (open: boolean) => void; height: number; className?: string }) {
  const calls = useApiCalls(gateway);
  const bursts = useMemo(() => burstsOf(calls), [calls]);
  const [picked, setPicked] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [show, setShow] = useState<Show>("sdk");
  const newest = calls[0] ?? null;
  // Follow the newest call until the reader picks one.
  const selected = (picked != null ? calls.find((c) => c.id === picked) : null) ?? newest;
  const siblings = selected ? (bursts.flatMap((b) => b.rows).find((r) => r.calls.some((c) => c.id === selected.id))?.calls ?? [selected]) : [];
  // Bars for calls still in flight run to now; this is read when the calls change.
  // eslint-disable-next-line react-hooks/purity
  const now = typeof performance === "undefined" ? 0 : performance.now();
  // The newest SDK call on one line: multi-line calls fold their arguments in.
  const latest = newest ? describeCall(newest).sdk.replace(/\s*\n\s*/g, " ").replace(/\(\s+/g, "(").replace(/,?\s+\)/g, ")") : null;

  return (
    <section
      aria-label="Requests"
      data-requests-drawer=""
      className={cn("flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10", className)}
      style={{ height: open ? height : 40 }}
    >
      <div className={cn("flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-4", open && "border-b")}>
        <CodeIcon className="size-4" aria-hidden />
        <h2 className="text-sm font-medium">Requests</h2>
        <Badge variant="secondary" className="tabular-nums">{calls.length}</Badge>
        {open ? (
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Every call this page made to unmap. Tiles, glyphs and sprites are not listed.</p>
        ) : (
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{latest ?? "No requests yet"}</p>
        )}
        {open ? (
          <>
            <Button variant="ghost" size="sm" onClick={clearCalls} disabled={!calls.length}>Clear</Button>
            <Button variant="ghost" size="sm" onClick={() => setFull(true)}>
              <PanelRightOpenIcon data-icon="inline-start" />
              Full inspector
            </Button>
          </>
        ) : latest ? (
          <Button variant="ghost" size="sm" onClick={() => copyText(describeCall(newest!).sdk, "SDK call copied")}>
            <CopyIcon data-icon="inline-start" />
            Copy SDK call
          </Button>
        ) : null}
        <Button variant="outline" size="sm" aria-expanded={open} onClick={() => onOpenChange(!open)}>
          {open ? "Close" : "Open"}
          {open ? <ChevronDownIcon data-icon="inline-end" /> : <ChevronUpIcon data-icon="inline-end" />}
        </Button>
      </div>
      {open ? (
        bursts.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No requests yet</EmptyTitle>
              <EmptyDescription>Search, open a place or ask for directions: each request it makes to unmap is listed here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="min-h-0 overflow-y-auto border-r">
              {bursts.map((burst) => (
                <BurstTimeline key={burst.rows[0]!.calls[0]!.id} burst={burst} selected={selected?.id ?? null} onSelect={setPicked} now={now} />
              ))}
            </div>
            {selected ? <CallDetail call={selected} siblings={siblings} gateway={gateway} show={show} onShow={setShow} onSelect={setPicked} /> : null}
          </div>
        )
      ) : null}
      <ApiInspector gateway={gateway} open={full} onOpenChange={setFull} side="right" className="sm:max-w-md" />
    </section>
  );
}
