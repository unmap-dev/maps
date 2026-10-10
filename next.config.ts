import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export served by Workers static assets (wrangler.jsonc). The app is one client page:
  // every path (/place/…, /dir/…, /@lat,lng,z) is the same document, and the URL is parsed in
  // the browser, so no server runtime is needed.
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@unmap/sdk", "@unmap/maps", "@unmap/geocoding", "@unmap/routing", "@unmap/elevation", "@unmap/themes", "@unmap/core"],
};

export default nextConfig;
