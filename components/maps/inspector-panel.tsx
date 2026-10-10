"use client";

import { useEffect, useMemo, useState } from "react";
import { BlocksIcon, CheckIcon, CodeIcon, CopyIcon, InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { copyText } from "@/lib/clipboard";
import { CloseButton } from "@/components/maps/side-panel";
import { GATEWAY } from "@/lib/config";
import { abridge, clearCalls, curlOf, describeCall, groupCalls, subscribe, type ApiCall } from "@/lib/inspector";
import { cn } from "@/lib/utils";

type Tab = "sdk" | "curl" | "result";

/** Copies text, and says so for a moment. Falls back to doing nothing visible when the clipboard is refused. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon-xs"
      aria-label={copied ? "Copied" : "Copy"}
      className="absolute top-1.5 right-1.5"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

function CallBody({ call, tab }: { call: ApiCall; tab: Tab }) {
  const d = describeCall(call);
  const text =
    tab === "sdk"
      ? d.sdk
      : tab === "curl"
        ? curlOf(call, GATEWAY)
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
        <pre tabIndex={0} aria-label={`${tab} for ${call.path}`} className="max-h-72 overflow-auto p-2.5 pr-9 font-mono text-[11.5px] leading-relaxed">{text}</pre>
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

/**
 * Every request the page makes, newest first, grouped when they ran together, with the SDK call
 * behind each. Desktop: a drawer on the right. Phones: a sheet over the lower part of the map.
 */
export function InspectorPanel({ onClose, docked }: { onClose: () => void; docked: boolean }) {
  const [calls, setCalls] = useState<readonly ApiCall[]>([]);
  const [tab, setTab] = useState<Tab>("sdk");
  const [openId, setOpenId] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => subscribe(setCalls), []);

  // Follow the newest call until the reader opens one themselves.
  const newest = calls[0]?.id ?? null;
  const shownId = pinned ? openId : newest;
  const groups = useMemo(() => groupCalls(calls), [calls]);

  const content = (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <CodeIcon className="size-4" aria-hidden />
        {docked ? <h2 className="text-base font-medium">API inspector</h2> : <SheetTitle>API inspector</SheetTitle>}
        <Badge variant="secondary" className="tabular-nums">
          {calls.length} {calls.length === 1 ? "call" : "calls"}
        </Badge>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={clearCalls} disabled={!calls.length}>
          Clear
        </Button>
        <CloseButton onClick={onClose} label="Close inspector" />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-xs text-muted-foreground">Explore map requests and copy the code behind them.</p>
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[tab]} onValueChange={(v) => v[0] && setTab(v[0] as Tab)} aria-label="Show">
          <ToggleGroupItem value="sdk">SDK</ToggleGroupItem>
          <ToggleGroupItem value="curl">curl</ToggleGroupItem>
          <ToggleGroupItem value="result">Result</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>No requests yet</EmptyTitle><EmptyDescription>Search, click the map or choose a nearby category to see its requests.</EmptyDescription></EmptyHeader></Empty>
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
                        className={cn(
                          "grid h-auto w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left",
                          open && "bg-muted",
                        )}
                      >
                        <Badge variant="outline">{call.method}</Badge>
                        <span className="truncate font-mono text-xs">
                          {call.path}
                          {query ? <span className="text-muted-foreground">?{query}</span> : null}
                        </span>
                        <span className="flex gap-2 text-xs tabular-nums text-muted-foreground">
                          <span className={statusClass(call)}>{call.error ? "ERR" : (call.status ?? "…")}</span>
                          {call.ms != null ? `${call.ms} ms` : ""}
                        </span>
                      </Button>
                      {open ? <CallBody call={call} tab={tab} /> : null}
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
        <pre className="overflow-x-auto rounded-md border bg-muted/60 p-2.5 font-mono text-[11.5px] leading-relaxed">{`import { Unmap } from '@unmap/sdk'\n\nconst unmap = new Unmap({ key: 'um_live_…' })`}</pre>
        <p className="text-xs text-muted-foreground">Tiles, glyphs and sprites come from R2 through the edge cache and are not listed.</p>
      </div>
    </>
  );
  if (docked) return (
    <aside aria-label="API inspector" className="absolute top-4 right-4 bottom-4 z-30 flex w-[380px] flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-lg ring-1 ring-foreground/10">
      {content}
    </aside>
  );
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="h-[80dvh] gap-0">
        <SheetDescription className="sr-only">Explore map requests and copy the code behind them.</SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  );
}
