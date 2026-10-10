import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./fixtures/registry-provenance.json";

// Hashes are generated only after the upstream exporter checks every copy against the registry.
describe("registry components match their verified snapshot", () => {
  for (const [file, digest] of Object.entries(manifest.files)) {
    it(file, () => {
      const bytes = readFileSync(join(__dirname, "..", file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
    });
  }
});
