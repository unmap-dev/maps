import { describe, expect, it } from "vitest";
import { bboxOf, contains, geometryArea } from "@/lib/geo";

// A ~1 km square near Calgary, with a hole in the middle.
const square = {
  type: "Polygon",
  coordinates: [
    [
      [-114.07, 51.04],
      [-114.0557, 51.04],
      [-114.0557, 51.049],
      [-114.07, 51.049],
      [-114.07, 51.04],
    ],
    [
      [-114.064, 51.0435],
      [-114.0617, 51.0435],
      [-114.0617, 51.0455],
      [-114.064, 51.0455],
      [-114.064, 51.0435],
    ],
  ],
};

describe("geo", () => {
  it("measures a city-scale polygon in square metres, holes removed", () => {
    expect(geometryArea(square) / 1e6).toBeCloseTo(0.96, 1);
  });

  it("tests points against the polygon and its hole", () => {
    expect(contains(square, [-114.068, 51.042])).toBe(true);
    expect(contains(square, [-114.063, 51.0445])).toBe(false);
    expect(contains(square, [-114.08, 51.042])).toBe(false);
  });

  it("reads MultiPolygons", () => {
    const multi = { type: "MultiPolygon", coordinates: [square.coordinates] };
    expect(contains(multi, [-114.068, 51.042])).toBe(true);
    expect(bboxOf([multi])).toEqual([-114.07, 51.04, -114.0557, 51.049]);
  });

  it("is empty for anything that is not an area", () => {
    expect(geometryArea({ type: "Point", coordinates: [0, 0] })).toBe(0);
    expect(bboxOf([null])).toBeNull();
  });
});
