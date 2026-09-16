// Geometry helpers. No geo library — SPEC.md section 9.1.

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

// Flag from the MMSI's first three digits, the Maritime Identification
// Digits (SPEC.md 9.2). The spec's list plus every MID that occurs in the
// snapshots table; anything else shows the digits themselves.
const MID: Record<string, string> = {
  '219': 'DNK', '220': 'DNK',
  '265': 'SWE', '266': 'SWE',
  '257': 'NOR', '258': 'NOR', '259': 'NOR',
  '331': 'GRL',
  '211': 'DEU', '218': 'DEU',
  '244': 'NLD', '245': 'NLD', '246': 'NLD',
  '232': 'GBR', '233': 'GBR', '234': 'GBR', '235': 'GBR',
  '227': 'FRA', '228': 'FRA',
  '230': 'FIN',
  '250': 'IRL',
  '247': 'ITA',
  '241': 'GRC',
  '255': 'PRT',
  '209': 'CYP', '210': 'CYP', '212': 'CYP',
  '215': 'MLT', '229': 'MLT', '248': 'MLT', '249': 'MLT', '256': 'MLT',
  '304': 'ATG', '305': 'ATG',
  '311': 'BHS',
  '314': 'BRB',
  '352': 'PAN', '353': 'PAN',
  '538': 'MHL',
  '563': 'SGP', '565': 'SGP', '566': 'SGP',
  '636': 'LBR',
  '664': 'SYC',
  '740': 'FLK',
}

/** "DNK" for 219012345; the digits ("999") when the MID is not in the table. */
export function midFlag(mmsi: string): string {
  const mid = mmsi.slice(0, 3)
  return MID[mid] ?? mid
}
