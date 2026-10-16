/**
 * The requests drawer's timeline: the recorded calls cut into bursts (what one action on the page
 * set off), and each burst into rows (calls of the same kind that started together share a row).
 * Pure functions over `ApiCall`, so the drawer only draws.
 */
import { describeCall, type ApiCall } from "@/lib/api-calls";

/**
 * A call starting this long after the last one started, and after every finished call before it
 * ended, begins a new burst. A call still in flight does not hold its burst open: one that hangs
 * would otherwise swallow everything the page does next.
 */
export const BURST_GAP_MS = 1000;
/** Calls of one kind starting within this window are drawn on one row, as the inspector groups them. */
const ROW_WINDOW_MS = 80;

export interface TimelineRow {
  title: string;
  /** Oldest first. */
  calls: ApiCall[];
}

export interface Burst {
  /** `performance.now()` of the first call. */
  start: number;
  /** Wall time from the first start to the last finish; null while a call is in flight. */
  ms: number | null;
  rows: TimelineRow[];
}

/**
 * Where a call stops counting: its finish, or its start while it is in flight or once the page
 * cancelled it (its time then says when it was given up, not how long the API took).
 */
const endOf = (call: ApiCall) => (call.ms == null || call.error === "Cancelled" ? call.startedAt : call.startedAt + call.ms);

/** `calls` newest first, as `useApiCalls()` gives them. Returns bursts newest first. */
export function burstsOf(calls: readonly ApiCall[]): Burst[] {
  const oldestFirst = [...calls].sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
  const groups: ApiCall[][] = [];
  let reach = -Infinity;
  for (const call of oldestFirst) {
    const end = endOf(call);
    const current = groups[groups.length - 1];
    if (current && call.startedAt - reach <= BURST_GAP_MS) {
      current.push(call);
      reach = Math.max(reach, end);
    } else {
      groups.push([call]);
      reach = end;
    }
  }
  return groups
    .map((group) => {
      const start = group[0]!.startedAt;
      const done = group.every((c) => c.ms != null);
      const rows: TimelineRow[] = [];
      for (const call of group) {
        const title = describeCall(call).title;
        const row = rows[rows.length - 1];
        if (row && row.title === title && call.startedAt - row.calls[0]!.startedAt <= ROW_WINDOW_MS) row.calls.push(call);
        else rows.push({ title, calls: [call] });
      }
      return { start, ms: done ? Math.round(Math.max(...group.map(endOf)) - start) : null, rows };
    })
    .reverse();
}

/** A bar's left edge and width as percentages of the burst's span. */
export function barOf(call: ApiCall, burst: Burst, now: number): { left: number; width: number } {
  const span = Math.max(1, burst.ms ?? now - burst.start);
  const left = ((call.startedAt - burst.start) / span) * 100;
  const width = (((call.ms ?? now - call.startedAt) || 1) / span) * 100;
  return { left: Math.min(100, Math.max(0, left)), width: Math.max(0.6, Math.min(100 - left, width)) };
}
