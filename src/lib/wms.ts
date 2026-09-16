// Sentinel Hub WMS URL builders (SPEC.md sections 6.2 and 7.1).
import type { SatellitePass, Scene } from './data'
import { parseUtc, utcDay } from './format'

const INSTANCE_ID = import.meta.env.VITE_SH_INSTANCE_ID
const LAYER_S1 = import.meta.env.VITE_SH_LAYER_S1
const LAYER_S2 = import.meta.env.VITE_SH_LAYER_S2

if (!INSTANCE_ID || !LAYER_S1 || !LAYER_S2) {
  throw new Error(
    'VITE_SH_INSTANCE_ID, VITE_SH_LAYER_S1 and VITE_SH_LAYER_S2 must be set — see .env.example',
  )
}

const WMS_BASE = `https://sh.dataspace.copernicus.eu/ogc/wms/${INSTANCE_ID}`

// The window is ±60 s around the acquisition. Over Denmark two passes can
// fall on one day twelve hours apart; only one can fall inside two minutes.
const WINDOW_MS = 60_000

/** ISO-8601 UTC without milliseconds: "2026-05-26T05:31:10Z". */
const isoZ = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** "{acq_start − 60 s}/{acq_end + 60 s}" — the TIME parameter of section 7.1. */
export function sceneTimeWindow(scene: Scene): string {
  const start = parseUtc(scene.acq_start) - WINDOW_MS
  const end = parseUtc(scene.acq_end) + WINDOW_MS
  return `${isoZ(start)}/${isoZ(end)}`
}

/** The whole UTC calendar day of a pass: "2026-08-26T00:00:00Z/2026-08-26T23:59:59Z". */
export function passDayWindow(pass: SatellitePass): string {
  const [start, end] = utcDay(pass.acq_start)
  return `${isoZ(start)}/${isoZ(end - 1000)}`
}

// Built by hand rather than with URLSearchParams: MapLibre substitutes
// `{bbox-epsg-3857}` at request time and the braces must stay literal.
function tileUrl(layer: string, time: string, extra: string[] = []): string {
  const params = [
    'SERVICE=WMS',
    'REQUEST=GetMap',
    'VERSION=1.3.0',
    `LAYERS=${layer}`,
    'FORMAT=image/png',
    'TRANSPARENT=true',
    'CRS=EPSG:3857',
    'WIDTH=256',
    'HEIGHT=256',
    'BBOX={bbox-epsg-3857}',
    `TIME=${time}`,
    ...extra,
  ]
  return `${WMS_BASE}?${params.join('&')}`
}

/** Layer 3: radar, pinned to the scene's two-minute window (7.1). */
export const s1TileUrl = (scene: Scene) => tileUrl(LAYER_S1, sceneTimeWindow(scene))

// Layer 2: true colour over the whole calendar day of the nearest clear
// Sentinel-2 pass, MAXCC=30 as section 7.1 specifies. Sentinel-2 passes
// Denmark once around 10:30 UTC, so a day holds one pass.
export const s2TileUrl = (pass: SatellitePass) =>
  tileUrl(LAYER_S2, passDayWindow(pass), ['MAXCC=30'])
