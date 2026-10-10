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

/** A sentence for a failed call: the gateway's own message when it sent one. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { status?: number; message?: string; code?: string };
    if (e.status === 401 || e.status === 403) return "The API key was refused. This build needs a key allowed on this site.";
    if (e.status === 429) return "Too many requests. Try again in a moment.";
    if (e.message) return e.message;
  }
  return "Something went wrong reaching the unmap API.";
}
