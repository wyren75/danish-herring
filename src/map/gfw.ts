// GFW fishing-events layer (SPEC.md 7.4 and 10.3): for each event a thin
// dashed rectangle — the bounding box the vessel stayed inside — with a small
// square at its centre point, and the square image itself.
import type { FeatureCollection, Point, Polygon } from 'geojson'
import type { GfwEvent } from '../lib/data'
import { hours } from '../lib/format'
import { ICON_PX, sdfIcon } from './ais'

export interface GfwProps {
  // The tooltip's four facts (7.4), preformatted so the hover handler only
  // reads strings off the feature.
  vessel: string // "FN 422 LINA T · DNK"
  detail: string // "12.3 h fishing · inside the site"
  // 1 for the matched vessel's own events and for everything when there is
  // no match; ~0.4 for the rest once a vessel is matched (10.3).
  opacity: number
}

export type GfwFeatures = FeatureCollection<Point | Polygon, GfwProps>

export const EMPTY_GFW: GfwFeatures = { type: 'FeatureCollection', features: [] }

export const DIMMED = 0.4

// What the layer shows (10.3): with the layer off, only the matched vessel's
// events around the pass; with it on, every event of the scene's day too, the
// matched vessel's at full opacity and the rest dimmed. Each event yields two
// features — the rectangle and its centre square — sharing one property set.
export function gfwFeatures(
  dayEvents: GfwEvent[],
  matchedEvents: GfwEvent[],
  showAll: boolean,
): GfwFeatures {
  const mine = new Set(matchedEvents.map((e) => e.event_id))
  const events = showAll
    ? [...matchedEvents, ...dayEvents.filter((e) => !mine.has(e.event_id))]
    : matchedEvents
  const dimOthers = showAll && mine.size > 0
  return {
    type: 'FeatureCollection',
    features: events.flatMap((e) => {
      const properties: GfwProps = {
        vessel: `${e.vessel_name || '(no name)'} · ${e.flag || 'flag unknown'}`,
        detail: `${hours(e.start, e.end)} fishing · ${e.inside_site ? 'inside' : 'outside'} the site`,
        opacity: dimOthers && !mine.has(e.event_id) ? DIMMED : 1,
      }
      // The table stores the rectangle's corners in whichever order GFW gave
      // them — half the rows have west > east. Normalise; the centre point
      // always falls inside the min/max box.
      const w = Math.min(e.bbox_w, e.bbox_e)
      const east = Math.max(e.bbox_w, e.bbox_e)
      const s = Math.min(e.bbox_s, e.bbox_n)
      const n = Math.max(e.bbox_s, e.bbox_n)
      return [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[w, s], [east, s], [east, n], [w, n], [w, s]]],
          },
          properties,
        },
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
          properties,
        },
      ]
    }),
  }
}

// A 6 px square centred in the icon image; smaller than the AIS triangle so
// context never outweighs the subject.
const HALF = 3
const squareDistance = (x: number, y: number) =>
  Math.max(Math.abs(x - ICON_PX / 2), Math.abs(y - ICON_PX / 2)) - HALF

export const squareIcon = () => sdfIcon(squareDistance)
