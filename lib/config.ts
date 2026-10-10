/** Browser keys are included in the bundle. Scope yours to your app's origins. */
export const GATEWAY = process.env.NEXT_PUBLIC_UNMAP_GATEWAY || "https://api.unmap.dev";
export const API_KEY = process.env.NEXT_PUBLIC_UNMAP_KEY || "";
export const DEFAULT_CAMERA = { lng: -114.0631, lat: 51.0443, zoom: 13 } as const;
