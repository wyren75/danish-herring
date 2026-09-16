// Click → verdict (SPEC.md section 9.1). Pure: the same click on the same
// scene with the same radius always gives the same answer (section 14).
import type { Snapshot } from './data'
import { haversine, pointInPolygon, type LonLat, type SiteGeometry } from './geo'

export const DEFAULT_RADIUS_M = 500
export const RADIUS_RANGE_M = { min: 200, max: 1500 }

export interface Nearest {
  snapshot: Snapshot
  distanceM: number // from the click to the AIS position
}

export interface Verdict {
  click: LonLat
  radiusM: number
  // "Is the click inside the protected area?" — the site polygon (3.1).
  inSite: boolean
  // Closest snapshot of the scene, inside the radius or not. Every snapshot
  // in the box is a candidate; null only if the scene has no snapshots.
  nearest: Nearest | null
  matched: boolean
}

export function computeVerdict(
  click: LonLat,
  snapshots: Snapshot[],
  radiusM: number,
  site: SiteGeometry,
): Verdict {
  let nearest: Nearest | null = null
  for (const snapshot of snapshots) {
    const distanceM = haversine(click, [snapshot.lon, snapshot.lat])
    if (!nearest || distanceM < nearest.distanceM) nearest = { snapshot, distanceM }
  }
  return {
    click,
    radiusM,
    inSite: pointInPolygon(click[0], click[1], site),
    nearest,
    matched: nearest !== null && nearest.distanceM <= radiusM,
  }
}
