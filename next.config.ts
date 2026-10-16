import type { NextConfig } from "next";

// `BASE_PATH` is empty when the app runs on its own (`pnpm dev`, your own deploy) and `/maps` when
// apps/apps-host builds it into apps.unmap.dev. It is also handed to the browser, which reads and
// writes the URL state inside it and loads the MapLibre worker from under it.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Static export served by Workers static assets (wrangler.jsonc). The app is one client page:
  // every path (/place/…, /dir/…, /@lat,lng,z) is the same document, and the URL is parsed in
  // the browser, so no server runtime is needed.
  output: "export",
  basePath: basePath || undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ["@unmap/sdk", "@unmap/maps", "@unmap/geocoding", "@unmap/routing", "@unmap/elevation", "@unmap/themes", "@unmap/core"],
};

export default nextConfig;
