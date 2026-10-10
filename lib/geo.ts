import type { LngLat } from "@/lib/url-state";

type Ring = LngLat[];
type Geometry = { type: string; coordinates: unknown };

/** Outer and inner rings of a Polygon or MultiPolygon, as polygons (outer ring first). */
export function polygonsOf(geometry: Geometry | null | undefined): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

/** Planar area of a ring in square metres, on a local equirectangular projection. Good to a few percent at city scale. */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const mx = 111320 * Math.cos(lat0), my = 110540;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    a += p[0] * mx * (q[1] * my) - q[0] * mx * (p[1] * my);
  }
  return Math.abs(a) / 2;
}

/** Area of a (Multi)Polygon in square metres: outer rings minus holes. */
export function geometryArea(geometry: Geometry | null | undefined): number {
  return polygonsOf(geometry).reduce((sum, rings) => sum + ringArea(rings[0] ?? []) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

function inRing(pt: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Point in a (Multi)Polygon, holes respected. */
export function contains(geometry: Geometry | null | undefined, pt: LngLat): boolean {
  return polygonsOf(geometry).some((rings) => rings[0] != null && inRing(pt, rings[0]) && !rings.slice(1).some((hole) => inRing(pt, hole)));
}

/** [west, south, east, north] of every position in a geometry. */
export function bboxOf(geometries: (Geometry | null | undefined)[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const g of geometries)
    for (const rings of polygonsOf(g))
      for (const ring of rings)
        for (const [x, y] of ring) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < s) s = y;
          if (y > n) n = y;
        }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}
