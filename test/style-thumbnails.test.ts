import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { STYLE_NAMES } from "@unmap/maps";

// The Layers button and the style picker show these: one capture per style and mode, written by
// scripts/capture-style-thumbnails.mjs. A style added to @unmap/maps without its captures shows a
// broken image; run the script for it.
it("has a light and a dark capture for every style, and nothing else", () => {
  const files = readdirSync(join(__dirname, "..", "public", "style-thumbnails")).filter((f) => f.endsWith(".jpg")).sort();
  expect(files).toEqual(STYLE_NAMES.flatMap((s) => [`${s}-dark.jpg`, `${s}-light.jpg`]).sort());
});
