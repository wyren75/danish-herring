// AIS snapshot layer (SPEC.md section 7.3): the features drawn for a scene
// and the marker image they use.
import type { FeatureCollection, Point } from 'geojson'
import { isFishing, type Snapshot, type Vessel } from '../lib/data'
import { haversine, pointInPolygon, type SiteGeometry } from '../lib/geo'
import type { Verdict } from '../lib/verdict'

// Below this a vessel's course over ground is meaningless (7.3): draw a dot.
export const MOVING_KN = 0.5

export interface AisProps {
  mmsi: string
  // Exact AIS position, for the marker-click shortcut. Geometry coordinates
  // that come back from queryRenderedFeatures are tile-quantised.
  lon: number
  lat: number
  fishing: boolean
  inSite: boolean // white ring — the site polygon, not the box (3.1)
  moving: boolean // triangle rotated to cog if true, else a circle
  cog: number
  matched: boolean // always drawn, larger, white outline
  order: number // position in the reveal sweep, 0-based
}

export type AisFeatures = FeatureCollection<Point, AisProps>

export const EMPTY_AIS: AisFeatures = { type: 'FeatureCollection', features: [] }

// One feature per snapshot of the scene. The sweep order for "Reveal all"
// runs outward from the click when there is one, else west to east.
export function aisFeatures(
  snapshots: Snapshot[],
  vessels: Map<string, Vessel>,
  site: SiteGeometry,
  verdict: Verdict | null,
): AisFeatures {
  const matchedMmsi = verdict?.matched ? verdict.nearest?.snapshot.mmsi : undefined
  const key = (s: Snapshot) =>
    verdict ? haversine(verdict.click, [s.lon, s.lat]) : s.lon
  const ordered = [...snapshots].sort((a, b) => key(a) - key(b))

  return {
    type: 'FeatureCollection',
    features: ordered.map((s, order) => {
      // A moving vessel with no course reported still gets a dot: there is
      // no heading to show.
      const moving = s.sog != null && s.sog >= MOVING_KN && s.cog != null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          mmsi: s.mmsi,
          lon: s.lon,
          lat: s.lat,
          fishing: isFishing(vessels.get(s.mmsi)),
          inSite: pointInPolygon(s.lon, s.lat, site),
          moving,
          cog: moving ? (s.cog as number) : 0,
          matched: s.mmsi === matchedMmsi,
          order,
        },
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// The triangle marker, as a signed-distance-field image. One SDF image lets
// MapLibre set colour, halo (the white ring) and size per feature; a plain
// bitmap would need one image per combination.
//
// Encoding follows MapLibre's glyph convention: alpha = 0.75 − d / 8, where d
// is the signed distance in CSS pixels (positive outside the shape). The
// shader draws the fill where alpha ≥ 0.75 and a halo of w px where
// alpha ≥ (6 − w) / 8, so the image needs about 6 px of padding.
// ---------------------------------------------------------------------------

const ICON_PX = 28 // CSS pixels, square
export const ICON_PIXEL_RATIO = 2

// Apex up (north = cog 0°), 10 px tall, 7 px wide, centroid at the image
// centre so `icon-rotate` turns it about its own middle.
const TRI: [number, number][] = [
  [14, 14 - 6.67],
  [17.5, 14 + 3.33],
  [10.5, 14 + 3.33],
]

function segmentDistance(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)
}

function signedDistance(px: number, py: number): number {
  let d = Infinity
  let inside = true
  for (let i = 0; i < 3; i++) {
    const a = TRI[i]
    const b = TRI[(i + 1) % 3]
    d = Math.min(d, segmentDistance(px, py, a, b))
    // TRI is wound clockwise in image space (y down); inside is to the right.
    if ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) < 0) inside = false
  }
  return inside ? -d : d
}

export function triangleIcon(): { width: number; height: number; data: Uint8ClampedArray } {
  const size = ICON_PX * ICON_PIXEL_RATIO
  const data = new Uint8ClampedArray(size * size * 4)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = signedDistance((i + 0.5) / ICON_PIXEL_RATIO, (j + 0.5) / ICON_PIXEL_RATIO)
      const alpha = Math.max(0, Math.min(1, 0.75 - d / 8))
      // RGB stays 0: MapLibre reads only the alpha channel of an SDF image.
      data[(j * size + i) * 4 + 3] = Math.round(alpha * 255)
    }
  }
  return { width: size, height: size, data }
}
