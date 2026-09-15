// Row types and read-only loaders for the Supabase tables (SPEC.md section 5).
import { supabase } from './supabase'
import type { SiteGeometry } from './geo'

export interface Scene {
  scene_id: string
  product_name: string
  acq_start: string // ISO-8601, UTC
  acq_end: string
  acq_mid: string
  site_code: string
  bbox_w: number
  bbox_s: number
  bbox_e: number
  bbox_n: number
  n_positions: number
  n_vessels: number // vessels in the padded box, not the site
}

export interface Vessel {
  mmsi: string
  name: string | null
  imo: string | null
  callsign: string | null
  ship_type: string | null
  length_m: number | null
  width_m: number | null
  mobile_class: string | null
}

export interface Snapshot {
  scene_id: string
  mmsi: string
  lat: number
  lon: number
  sog: number | null
  cog: number | null
  method: 'interpolated' | 'nearest'
  dt_before_s: number | null
  dt_after_s: number | null
}

// Supabase returns at most 1000 rows per request regardless of `limit`.
// Page with a stable ordering until a short page comes back.
const PAGE = 1000

async function fetchAll<T>(table: string, orderBy: string[]): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*')
    for (const col of orderBy) q = q.order(col)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (data.length < PAGE) return rows
  }
}

export const loadScenes = () => fetchAll<Scene>('scenes', ['acq_mid'])
export const loadVessels = () => fetchAll<Vessel>('vessels', ['mmsi'])
// ~1,100 rows across all 12 scenes: small enough to hold in memory, and the
// scene picker needs every scene's snapshots to rank by fishing count.
export const loadSnapshots = () => fetchAll<Snapshot>('snapshots', ['scene_id', 'mmsi'])

export async function loadSite(): Promise<SiteGeometry> {
  const res = await fetch('/site.geojson')
  if (!res.ok) throw new Error(`site.geojson: HTTP ${res.status}`)
  const fc = await res.json()
  return fc.features[0].geometry as SiteGeometry
}

export const isFishing = (v: Vessel | undefined) => v?.ship_type === 'Fishing'
