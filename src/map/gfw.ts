// GFW fishing-events layer (SPEC.md section 7.4): one small orange square per
// event whose [start, end] overlaps the selected scene's day, and the square
// image itself.
import type { FeatureCollection, Point } from 'geojson'
import type { GfwEvent } from '../lib/data'
import { hours } from '../lib/format'
import { ICON_PX, sdfIcon } from './ais'

export interface GfwProps {
  // The tooltip's four facts (7.4), preformatted so the hover handler only
  // reads strings off the feature.
  vessel: string // "FN 422 LINA T · DNK"
  detail: string // "12.3 h fishing · inside the site"
}

export type GfwFeatures = FeatureCollection<Point, GfwProps>

export const EMPTY_GFW: GfwFeatures = { type: 'FeatureCollection', features: [] }

export function gfwFeatures(events: GfwEvent[]): GfwFeatures {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: {
        vessel: `${e.vessel_name || '(no name)'} · ${e.flag || 'flag unknown'}`,
        detail: `${hours(e.start, e.end)} fishing · ${e.inside_site ? 'inside' : 'outside'} the site`,
      },
    })),
  }
}

// A 6 px square centred in the icon image; smaller than the AIS triangle so
// context never outweighs the subject.
const HALF = 3
const squareDistance = (x: number, y: number) =>
  Math.max(Math.abs(x - ICON_PX / 2), Math.abs(y - ICON_PX / 2)) - HALF

export const squareIcon = () => sdfIcon(squareDistance)
