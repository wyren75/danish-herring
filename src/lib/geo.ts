// Geometry helpers. No geo library — SPEC.md section 9.1.
// midFlag arrives with M5.

export type LonLat = [number, number]
export type Ring = LonLat[]

// The subset of GeoJSON geometry site.geojson can carry. DK00FX113 is a
// MultiPolygon of two polygons (see DECISIONS.md, M1).
export type SiteGeometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }

// Ray casting over one ring: count crossings of a ray cast east from the point.
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

// "Is this inside the protected area?" — the legal question (section 3.1).
// Tests the outer ring of every polygon; holes are ignored (the site has none).
export function pointInPolygon(lon: number, lat: number, geom: SiteGeometry): boolean {
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  return polygons.some((rings) => pointInRing(lon, lat, rings[0]))
}

const EARTH_RADIUS_M = 6_371_000
const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres between two lon/lat points. */
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}
