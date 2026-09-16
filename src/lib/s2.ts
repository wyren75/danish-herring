// Whether a Sentinel-2 photo can honestly sit under a scene's radar (SPEC.md
// section 7, layer 2): only when the catalogue has a clear pass within a day
// of the acquisition. Pure functions over `satellite_passes`.
import type { SatellitePass, Scene } from './data'
import { parseUtc, utcDate, utcTime } from './format'

const HOUR_MS = 3_600_000

/** "Clear" is the Observation tab's threshold (11.1): under 20 % cloud. */
export const CLEAR_CLOUD_PCT = 20
/** How far from the acquisition instant a pass may be: ±1 day (section 7). */
export const NEAR_SCENE_MS = 24 * HOUR_MS

export interface S2Pick {
  /** The nearest clear pass within a day, or null — the toggle is enabled iff set. */
  pass: SatellitePass | null
  /** The least cloudy Sentinel-2 pass within a day, clear or not; explains a null `pass`. */
  best: SatellitePass | null
}

const NONE: S2Pick = { pass: null, best: null }

/** Sentinel-2 passes over the scene's site within ±1 day of its instant. */
function passesNearScene(passes: SatellitePass[], scene: Scene): SatellitePass[] {
  const mid = parseUtc(scene.acq_mid)
  return passes.filter(
    (p) =>
      p.site_code === scene.site_code &&
      p.mission === 'S2' &&
      Math.abs(parseUtc(p.acq_start) - mid) <= NEAR_SCENE_MS,
  )
}

const isClear = (p: SatellitePass) => p.cloud_pct !== null && p.cloud_pct < CLEAR_CLOUD_PCT

export function clearS2Pass(passes: SatellitePass[], scene: Scene): S2Pick {
  const near = passesNearScene(passes, scene)
  if (!near.length) return NONE
  const mid = parseUtc(scene.acq_mid)
  const gap = (p: SatellitePass) => Math.abs(parseUtc(p.acq_start) - mid)
  const cloud = (p: SatellitePass) => p.cloud_pct ?? Infinity
  const pass = near.filter(isClear).sort((a, b) => gap(a) - gap(b))[0] ?? null
  const best = near.slice().sort((a, b) => cloud(a) - cloud(b))[0]
  return { pass, best }
}

/** "26 Aug 2026 10:30 UTC · 2% cloud · 19 h before the radar" */
export function s2PassLabel(pass: SatellitePass, scene: Scene): string {
  const dt = parseUtc(pass.acq_start) - parseUtc(scene.acq_mid)
  const h = Math.round(Math.abs(dt) / HOUR_MS)
  const when = h === 0 ? 'within the hour of the radar' : `${h} h ${dt < 0 ? 'before' : 'after'} the radar`
  return `${utcDate(pass.acq_start)} ${utcTime(pass.acq_start)} · ${cloudPct(pass)} cloud · ${when}`
}

/** Why the toggle is disabled — the text of its tooltip. */
export function s2Reason(pick: S2Pick): string {
  if (pick.pass) return ''
  if (!pick.best) return 'No Sentinel-2 pass within a day of this scene.'
  return (
    `No clear Sentinel-2 image within a day of this scene: the best pass, ` +
    `${utcDate(pick.best.acq_start)} ${utcTime(pick.best.acq_start)}, was ` +
    `${cloudPct(pick.best)} cloud (the limit is ${CLEAR_CLOUD_PCT}%).`
  )
}

const cloudPct = (p: SatellitePass) =>
  p.cloud_pct === null ? 'unknown' : `${Math.round(p.cloud_pct)}%`
