import { describe, expect, it } from "vitest";
import type { ApiCall } from "@/lib/api-calls";
import { barOf, burstsOf } from "@/lib/timeline";

let seq = 0;
const call = (path: string, startedAt: number, ms: number | null, params: [string, string][] = []): ApiCall => ({
  id: ++seq,
  method: "GET",
  path,
  params,
  startedAt,
  status: ms == null ? null : 200,
  ms,
});

// Opening bike directions, as recorded live: a style and four reverse geocodes together, then the
// route, then the elevation profile along it. Newest first, as the recorder lists them.
const directions = [
  call("/elevation", 1005, 52, [["points", "-114.07,51.04"]]),
  call("/route", 305, 700, [["from", "-114.0719,51.0447"], ["to", "-114.0129,51.046"]]),
  call("/geocode/reverse", 4, 295),
  call("/geocode/reverse", 3, 297),
  call("/geocode/reverse", 2, 269),
  call("/geocode/reverse", 1, 299),
  call("/styles/base.json", 0, 217),
];

describe("request timeline", () => {
  it("keeps one action's calls in one burst, with the wall time end to end", () => {
    const bursts = burstsOf(directions);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.ms).toBe(1057);
  });

  it("puts parallel calls of one kind on one row", () => {
    const rows = burstsOf(directions)[0]!.rows;
    expect(rows.map((r) => r.calls.length)).toEqual([1, 4, 1, 1]);
    expect(rows[2]!.calls[0]!.path).toBe("/route");
  });

  it("starts a new burst after a pause, newest first", () => {
    const later = call("/places/nearby", 5000, 120, [["category", "food.cafe"]]);
    const bursts = burstsOf([later, ...directions]);
    expect(bursts.map((b) => b.rows[0]!.calls[0]!.path)).toEqual(["/places/nearby", "/styles/base.json"]);
  });

  it("does not let a hung call swallow what the page does next", () => {
    const hung = call("/elevation", 0, null);
    const next = call("/places/nearby", 30_000, 120);
    const bursts = burstsOf([next, hung]);
    expect(bursts).toHaveLength(2);
    expect(bursts[1]!.ms).toBeNull();
  });

  it("does not let a hung call that was later cancelled swallow it either", () => {
    const hung = { ...call("/elevation", 0, 275_000), status: null, error: "Cancelled" };
    const next = call("/places/nearby", 30_000, 120);
    expect(burstsOf([next, hung])).toHaveLength(2);
  });

  it("keeps a call that starts as soon as another finishes in the same burst", () => {
    const route = call("/route", 0, 700);
    const elevation = call("/elevation", 705, 50);
    expect(burstsOf([elevation, route])).toHaveLength(1);
  });

  it("draws a bar inside the burst's span", () => {
    const burst = burstsOf(directions)[0]!;
    const route = burst.rows[2]!.calls[0]!;
    const bar = barOf(route, burst, 0);
    expect(bar.left).toBeCloseTo(28.9, 1);
    expect(bar.width).toBeCloseTo(66.2, 1);
  });
});
