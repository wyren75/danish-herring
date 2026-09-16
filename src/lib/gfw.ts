// What Global Fishing Watch says, alongside the Danish record (SPEC.md
// section 10, as rewritten 16 Sept): two counts per scene, and for a matched
// vessel its events around the pass and over the whole table. Pure functions
// over the tables already in memory.
import { isFishing, type GfwEvent, type Scene, type Snapshot, type Vessel } from './data'
import { parseUtc, utcDay } from './format'
import { haversine, pointInPolygon, type SiteGeometry } from './geo'

const HOUR_MS = 3_600_000

/** GFW events whose [start, end] contains the acquisition instant. */
export const eventsAtInstant = (events: GfwEvent[], scene: Scene) => {
  const mid = parseUtc(scene.acq_mid)
  return events.filter((e) => parseUtc(e.start) <= mid && mid <= parseUtc(e.end))
}

/** GFW events whose [start, end] overlaps the scene's UTC calendar day (7.4). */
export function eventsOnSceneDay(events: GfwEvent[], scene: Scene): GfwEvent[] {
  const [dayStart, dayEnd] = utcDay(scene.acq_mid)
  return events.filter((e) => parseUtc(e.start) < dayEnd && parseUtc(e.end) >= dayStart)
}

// ---------------------------------------------------------------------------
// 10.1 — two independent counts at the instant, inside the site. No ratio.
// ---------------------------------------------------------------------------

export interface SceneCounts {
  danish: number // fishing vessels broadcasting AIS inside the polygon
  gfw: number // ... vessels inside a recognised fishing event at that second
}

export function sceneCounts(
  scene: Scene,
  sceneSnapshots: Snapshot[],
  vessels: Map<string, Vessel>,
  events: GfwEvent[],
  site: SiteGeometry,
): SceneCounts {
  const danish = sceneSnapshots.filter(
    (s) => isFishing(vessels.get(s.mmsi)) && pointInPolygon(s.lon, s.lat, site),
  ).length
  const gfw = new Set(eventsAtInstant(events, scene).filter((e) => e.inside_site).map((e) => e.mmsi))
    .size
  return { danish, gfw }
}

// ---------------------------------------------------------------------------
// 10.2 — what GFW says a matched vessel did.
// ---------------------------------------------------------------------------

// ±6 h, not ±90 min: the fleet leaves harbour 17:00–18:00 and fishes through
// the night, so an evening pass's event often starts hours later (10.2).
export const AROUND_PASS_H = 6

/** The vessel's events whose window overlaps acq_mid ± 6 h, earliest first. */
export function eventsAroundPass(events: GfwEvent[], mmsi: string, scene: Scene): GfwEvent[] {
  const mid = parseUtc(scene.acq_mid)
  const from = mid - AROUND_PASS_H * HOUR_MS
  const to = mid + AROUND_PASS_H * HOUR_MS
  return events
    .filter((e) => e.mmsi === mmsi && parseUtc(e.start) <= to && parseUtc(e.end) >= from)
    .sort((a, b) => parseUtc(a.start) - parseUtc(b.start))
}

export interface EventRelation {
  event: GfwEvent
  inProgress: boolean // the instant falls inside the event
  elapsedMs: number // since the event started, when in progress
  distanceM: number // from the snapshot to the event's centre point
  compass: string // 8-point, "north-east"
}

export function relateEvent(event: GfwEvent, snapshot: Snapshot, scene: Scene): EventRelation {
  const mid = parseUtc(scene.acq_mid)
  const start = parseUtc(event.start)
  return {
    event,
    inProgress: start <= mid && mid <= parseUtc(event.end),
    elapsedMs: mid - start,
    distanceM: haversine([snapshot.lon, snapshot.lat], [event.lon, event.lat]),
    compass: compass8(snapshot, event),
  }
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

// Initial bearing from a to b, snapped to eight points. Longitude is scaled
// by cos(lat) so a degree east is not stretched against a degree north.
function compass8(a: { lat: number; lon: number }, b: { lat: number; lon: number }): string {
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180)
  const dy = b.lat - a.lat
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  return POINTS[Math.round(deg / 45) % 8]
}

export interface History {
  total: number // every event for the MMSI in the table
  insideSite: number
  spanMonths: number // the table's overall span, so the line says "in 18 months"
}

/** All of the vessel's events in the table, and how long the table covers. */
export function history(events: GfwEvent[], mmsi: string): History {
  let total = 0
  let insideSite = 0
  let first = Infinity
  let last = -Infinity
  for (const e of events) {
    first = Math.min(first, parseUtc(e.start))
    last = Math.max(last, parseUtc(e.end))
    if (e.mmsi !== mmsi) continue
    total++
    if (e.inside_site) insideSite++
  }
  const spanMonths = events.length ? Math.round((last - first) / (30.44 * 24 * HOUR_MS)) : 0
  return { total, insideSite, spanMonths }
}
