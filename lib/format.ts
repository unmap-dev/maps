export const fmtDistance = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`);

export function fmtDuration(s: number): string {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}

export const fmtCoord = ([lng, lat]: [number, number]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/** One line of address from the API's parts. */
export function addressLine(a: { housenumber?: string; street?: string; city?: string; region?: string; postcode?: string } | undefined): string | null {
  if (!a) return null;
  const street = [a.housenumber, a.street].filter(Boolean).join(" ");
  const line = [street, a.city, [a.region, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return line || null;
}

/** Straight-line distance in metres. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
