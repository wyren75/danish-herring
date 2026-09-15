// Geometry helpers. No geo library — SPEC.md section 9.1.
// haversine and midFlag arrive with M4 / M5.

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
