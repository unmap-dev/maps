import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MapLibre's worker, copied in by scripts/copy-maplibre-worker.mjs.
    "public/maplibre/**",
    // Copied in unmodified by scripts/sync-registry.mjs and held identical by
    // test/registry-sync.test.ts: the registry items and stock shadcn primitives are linted and
    // tested in apps/registry, and a lint fix here would be a drift the test then fails on.
    "components/ui/**",
    "lib/map-context.tsx",
    "lib/map-layers.ts",
    "lib/api-calls.ts",
  ]),
]);

export default eslintConfig;
