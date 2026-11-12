// Captures the style thumbnails the Layers button and the style picker show: every style in light
// and dark, over the same downtown Calgary camera, with no overlays and every control hidden.
//
//   pnpm --filter @unmap/maps-app build
//   pnpm --filter @unmap/maps-app capture-style-thumbnails [style ...]
//
// Writes public/style-thumbnails/<style>-<light|dark>.jpg. Serves out/ itself (any path that is
// not a file gets index.html, as the Worker does) so the URL carries the camera and the style.
// Tiles come from the production gateway with the build's key. Run it again when a style changes.
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { STYLE_NAMES } from "@unmap/maps";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(app, "out");
const target = join(app, "public", "style-thumbnails");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
/** The camera every thumbnail shares: the Bow, Chinatown and the downtown grid. */
const CAMERA = "@51.045,-114.065,12.5z";
/** 5:4, the picker's tile shape, at about twice the largest size a tile draws at. */
const VIEW = { width: 296, height: 237 };
/** Time for tiles, which the MapLibre worker fetches out of Playwright's sight, to land and draw. */
const SETTLE_MS = 7000;

if (!existsSync(join(root, "index.html"))) {
  console.error("out/ is missing: run `pnpm --filter @unmap/maps-app build` first.");
  process.exit(1);
}
const wanted = process.argv.slice(2);
const unknown = wanted.filter((s) => !STYLE_NAMES.includes(s));
if (unknown.length) {
  console.error(`not a style: ${unknown.join(", ")}`);
  process.exit(1);
}
const styles = wanted.length ? wanted : STYLE_NAMES;

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

mkdirSync(target, { recursive: true });
// SwiftShader gives headless Chromium the WebGL MapLibre needs.
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const mode of ["light", "dark"]) {
    for (const style of styles) {
      const page = await browser.newPage({ viewport: VIEW });
      await page.goto(`${origin}/${CAMERA}?map=${style}-${mode}&inspect=0`);
      // Everything but the map's canvas: search, chips, controls, buttons and attribution.
      await page.addStyleTag({ content: "body * { visibility: hidden !important } .maplibregl-canvas { visibility: visible !important }" });
      await page.locator(".maplibregl-canvas").waitFor();
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({ path: join(target, `${style}-${mode}.jpg`), type: "jpeg", quality: 80 });
      await page.close();
      console.log(`captured ${style}-${mode}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
