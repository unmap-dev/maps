import { describe, expect, it } from "vitest";
import { ESSENTIALS, bandOf, checkEssentials, quickest, scoreOf, type Band, type Candidate } from "@/lib/score";
import type { LngLat } from "@/lib/url-state";

/** A square band around the origin, `d` degrees each way. */
const square = (minutes: number, d: number): Band => ({
  minutes,
  geometry: { type: "Polygon", coordinates: [[[-d, -d], [d, -d], [d, d], [-d, d], [-d, -d]]] },
});
// Out of order on purpose: the API returns the largest band first.
const bands = [square(15, 0.03), square(5, 0.01), square(10, 0.02)];
const origin: LngLat = [0, 0];
const place = (id: string, coordinates: LngLat): Candidate => ({ kind: "place", id, name: id, coordinates });

describe("15-minute check", () => {
  it("puts a point in the smallest band that contains it", () => {
    expect(bandOf(bands, [0.005, 0])).toBe(5);
    expect(bandOf(bands, [0.015, 0])).toBe(10);
    expect(bandOf(bands, [0, 0.025])).toBe(15);
    expect(bandOf(bands, [0.05, 0])).toBeNull();
  });

  it("prefers the quicker band over the straight-line nearest", () => {
    // `near` is closer in a straight line but sits in a hole of the 5-minute band (a river, say).
    const holed: Band[] = [
      square(15, 0.03),
      { minutes: 5, geometry: { type: "Polygon", coordinates: [[[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01], [-0.01, -0.01]], [[0.002, -0.001], [0.004, -0.001], [0.004, 0.001], [0.002, 0.001], [0.002, -0.001]]] } },
    ];
    const best = quickest(holed, origin, [place("near", [0.003, 0]), place("far", [-0.008, 0])]);
    expect(best).toMatchObject({ id: "far", minutes: 5 });
  });

  it("breaks a tie inside a band by distance", () => {
    expect(quickest(bands, origin, [place("b", [0.009, 0]), place("a", [0.002, 0])])).toMatchObject({ id: "a", minutes: 5 });
  });

  it("ignores candidates outside every band", () => {
    expect(quickest(bands, origin, [place("x", [0.2, 0.2])])).toBeNull();
  });

  it("scores met against the essentials it could check", () => {
    const candidates: Record<string, Candidate[] | null> = Object.fromEntries(ESSENTIALS.map((e) => [e.id, []]));
    candidates.groceries = [place("g", [0.001, 0.001])];
    candidates.transit = [{ kind: "stop", id: "s", name: "s", coordinates: [0.015, 0] }];
    candidates.library = null;
    const results = checkEssentials(bands, origin, candidates);
    expect(results.map((r) => r.status)).toEqual(ESSENTIALS.map((e) => (e.id === "groceries" || e.id === "transit" ? "met" : e.id === "library" ? "error" : "missing")));
    expect(scoreOf(results)).toEqual({ met: 2, total: ESSENTIALS.length - 1 });
  });
});
