"use client";

import { useEffect, useState, type RefObject } from "react";

/** Use the panel's rendered height: loading, errors and results all cover different amounts. */
export function useChromeLayout(root: RefObject<HTMLDivElement | null>, viewKey: string, sheet: string) {
  const [layout, setLayout] = useState(() => ({ width: window.innerWidth, height: window.innerHeight, panelHeight: 0 }));
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const panel = element.querySelector<HTMLElement>("[data-map-panel]");
    const measure = () => setLayout({ width: element.clientWidth, height: element.clientHeight, panelHeight: panel?.offsetHeight ?? 0 });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (panel) observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [root, viewKey, sheet]);
  return { ...layout, desktop: layout.width >= 1024, dockInspector: layout.width >= 1280 };
}
