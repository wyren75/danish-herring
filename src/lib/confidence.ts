// Confidence ratio (SPEC.md section 10) and the GFW events of a scene's day
// (section 7.4). Pure functions over the tables already in memory.
import type { GfwEvent, Scene, Snapshot } from './data'
import { parseUtc, utcDay } from './format'

// Which GFW vessels count as reference: those fishing inside the SITE
// polygon (the legal question, 3.1) or anywhere in the padded box. Section 17
// leaves this to the owner; the default is the site.
export type ConfidenceGeometry = 'site' | 'box'

// Below this many reference vessels a ratio is noise; the UI says so instead.
export const MIN_REFERENCE = 3

export interface Confidence {
  reference: number // distinct GFW vessels fishing here at the instant
  found: number // ... of which the Danish record has a snapshot
  ratio: number | null // found / reference, or null when not measurable
}

/** GFW events whose [start, end] contains the acquisition instant. */
export function eventsAtInstant(
  events: GfwEvent[],
  scene: Scene,
  geometry: ConfidenceGeometry,
): GfwEvent[] {
  const mid = parseUtc(scene.acq_mid)
  return events.filter(
    (e) =>
      (geometry === 'box' || e.inside_site) &&
      parseUtc(e.start) <= mid &&
      mid <= parseUtc(e.end),
  )
}

export function computeConfidence(
  events: GfwEvent[],
  sceneSnapshots: Snapshot[],
  scene: Scene,
  geometry: ConfidenceGeometry,
): Confidence {
  const gfwMmsi = new Set(eventsAtInstant(events, scene, geometry).map((e) => e.mmsi))
  const present = new Set(sceneSnapshots.map((s) => s.mmsi))
  let found = 0
  for (const mmsi of gfwMmsi) if (present.has(mmsi)) found++
  const reference = gfwMmsi.size
  return {
    reference,
    found,
    ratio: reference >= MIN_REFERENCE ? found / reference : null,
  }
}

/** GFW events whose [start, end] overlaps the scene's UTC calendar day (7.4). */
export function eventsOnSceneDay(events: GfwEvent[], scene: Scene): GfwEvent[] {
  const [dayStart, dayEnd] = utcDay(scene.acq_mid)
  return events.filter((e) => parseUtc(e.start) < dayEnd && parseUtc(e.end) >= dayStart)
}
