/**
 * Point MapLibre at the worker this app serves from `public/maplibre/`.
 *
 * MapLibre GL JS 6 runs a module worker resolved from `import.meta.url`, which does not survive
 * Turbopack's module graph (maplibre-gl-js#8126): without this the worker fails to load, no tile
 * is ever parsed and the map never fires `load`. `scripts/copy-maplibre-worker.mjs` copies the
 * worker there before `dev` and `build`; apps/web does the same.
 *
 * Imported for its side effect before the first map is created.
 */
import { maplibregl } from "@unmap/maps";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
