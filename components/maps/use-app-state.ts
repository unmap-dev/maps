"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUrl, parseUrl, sameView, type AppState, type Camera, type Prefs, type View } from "@/lib/url-state";

/**
 * App state, kept in the URL.
 *
 * Moving to a new screen pushes a history entry, so Back works the way it does in Google Maps.
 * Preference changes and camera moves replace the current entry instead: nobody wants Back to
 * undo a pan. The camera is kept out of React state because it changes on every frame of a drag;
 * the map owns it, and this only writes it into the URL when the map settles.
 */
export function useAppState() {
  const [state, setState] = useState<AppState>(() => parseUrl(window.location.pathname, window.location.search));
  const stateRef = useRef(state);
  const cameraRef = useRef<Camera | null>(state.camera);

  const write = useCallback((next: AppState, push: boolean) => {
    const url = formatUrl({ ...next, camera: cameraRef.current });
    if (url === window.location.pathname + window.location.search) return;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const go = useCallback(
    (view: View) => {
      const prev = stateRef.current;
      const next = { ...prev, view };
      stateRef.current = next;
      setState(next);
      write(next, !sameView(prev.view, view));
    },
    [write],
  );

  /** Change the current view without a new history entry (a slider, a mode toggle). */
  const replaceView = useCallback(
    (view: View) => {
      const next = { ...stateRef.current, view };
      stateRef.current = next;
      setState(next);
      write(next, false);
    },
    [write],
  );

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => {
      const next = { ...stateRef.current, prefs: { ...stateRef.current.prefs, ...patch } };
      stateRef.current = next;
      setState(next);
      write(next, false);
    },
    [write],
  );

  const setCamera = useCallback(
    (camera: Camera) => {
      cameraRef.current = camera;
      write(stateRef.current, false);
    },
    [write],
  );

  useEffect(() => {
    const onPop = () => {
      const next = parseUrl(window.location.pathname, window.location.search);
      stateRef.current = next;
      if (next.camera) cameraRef.current = next.camera;
      setState(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** The shareable URL of what is on screen now. */
  const shareUrl = useCallback(() => window.location.origin + formatUrl({ ...stateRef.current, camera: cameraRef.current }), []);

  return { state, go, replaceView, setPrefs, setCamera, cameraRef, shareUrl };
}

export type AppActions = Omit<ReturnType<typeof useAppState>, "state" | "cameraRef">;
