// Sentinel Hub WMS URL builders (SPEC.md sections 6.2 and 7.1).
import type { Scene } from './data'
import { parseUtc } from './format'

const INSTANCE_ID = import.meta.env.VITE_SH_INSTANCE_ID
const LAYER_S1 = import.meta.env.VITE_SH_LAYER_S1

if (!INSTANCE_ID || !LAYER_S1) {
  throw new Error('VITE_SH_INSTANCE_ID and VITE_SH_LAYER_S1 must be set — see .env.example')
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

// Built by hand rather than with URLSearchParams: MapLibre substitutes
// `{bbox-epsg-3857}` at request time and the braces must stay literal.
export function s1TileUrl(scene: Scene): string {
  const params = [
    'SERVICE=WMS',
    'REQUEST=GetMap',
    'VERSION=1.3.0',
    `LAYERS=${LAYER_S1}`,
    'FORMAT=image/png',
    'TRANSPARENT=true',
    'CRS=EPSG:3857',
    'WIDTH=256',
    'HEIGHT=256',
    'BBOX={bbox-epsg-3857}',
    `TIME=${sceneTimeWindow(scene)}`,
  ]
  return `${WMS_BASE}?${params.join('&')}`
}
