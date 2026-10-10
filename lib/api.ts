import { Unmap } from "@unmap/sdk";
import { API_KEY, GATEWAY } from "@/lib/config";

/**
 * The app's one SDK instance. No `container`: the map is the registry `<Map>`, which makes its
 * own. Every call goes through `window.fetch`, so the inspector sees it.
 */
export const unmap = new Unmap({ key: API_KEY, gateway: GATEWAY, fetch: (input, init) => window.fetch(input, init) });
