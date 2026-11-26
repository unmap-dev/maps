"use client";

import { useEffect, useState } from "react";

export type AsyncState<T> = { status: "idle" } | { status: "loading" } | { status: "done"; data: T } | { status: "error"; error: unknown };

/**
 * Run `load` whenever `key` changes, cancelling the previous run. `key: null` means nothing to load.
 * A result is kept with the key it was loaded for, so a stale one is never shown for a new key:
 * until the new run settles the state reads as loading.
 */
export function useAsync<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [entry, setEntry] = useState<{ key: string; state: AsyncState<T> } | null>(null);
  useEffect(() => {
    if (key == null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => !controller.signal.aborted && setEntry({ key, state: { status: "done", data } }),
      (error: unknown) => !controller.signal.aborted && setEntry({ key, state: { status: "error", error } }),
    );
    return () => controller.abort();
    // `load` is a fresh closure every render; `key` is what identifies the work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key == null) return { status: "idle" };
  return entry?.key === key ? entry.state : { status: "loading" };
}

/**
 * A sentence for a failed call: the gateway's own message when it sent one. The US routing
 * refusals get a sentence a reader can act on: the gateway answers a US trip in a mode other than
 * car, and one across the border, with the same code (`outside_coverage`), and two US metros with
 * `no_route`, so each is told apart by its message.
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { status?: number; message?: string; code?: string };
    if (e.status === 401 || e.status === 403) return "The API key was refused. This build needs a key allowed on this site.";
    if (e.status === 429) return "Too many requests. Try again in a moment.";
    const message = e.message ?? "";
    if (e.code === "outside_coverage" && /car only/i.test(message)) {
      return "In the US, routing is by car only. Walking, cycling, truck and transit routes cover Canada.";
    }
    if (e.code === "outside_coverage" && /border/i.test(message)) {
      return "Routes do not cross the Canada-US border: both ends must be in the same country.";
    }
    if (e.code === "no_route" && /metro/i.test(message)) {
      return "In the US, a route stays inside one of the ten metro areas routing covers: both ends must be in the same one.";
    }
    if (e.message) return e.message;
  }
  return "Something went wrong reaching the unmap API.";
}
