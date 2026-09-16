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
  // Counted inside the site polygon at the acquisition instant, at ingestion
  // (SPEC.md section 8). The browser reads these; it never recomputes them.
  n_in_site: number
  n_fishing_in_site: number
  n_trawling_in_site: number
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

// Global Fishing Watch apparent-fishing events (section 5.1). `inside_site`
// was tested against the site polygon at ingestion; the events themselves
// were fetched for the box. `bbox_*` is the rectangle the vessel stayed
// inside during the event; `lat`/`lon` is its centre point.
export interface GfwEvent {
  event_id: string
  start: string // ISO-8601, UTC
  end: string
  lat: number
  lon: number
  bbox_w: number
  bbox_s: number
  bbox_e: number
  bbox_n: number
  inside_site: boolean
  mmsi: string
  vessel_name: string | null
  flag: string | null
  gfw_vessel_id: string | null
  avg_speed_kn: number | null
  distance_km: number | null
  dist_port_km: number | null
  dist_shore_km: number | null
  mpa_tags: string | null
  site_code: string
}

// One row per pass over one site (section 5.1), from the Copernicus
// catalogue. `cloud_pct` is the catalogue's tile-wide cloud cover for
// Sentinel-2 and null for Sentinel-1.
export interface SatellitePass {
  site_code: string
  site_label: string
  mission: 'S1' | 'S2'
  product_name: string
  acq_start: string // ISO-8601, UTC
  cloud_pct: number | null
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
// ~1,400 rows across all 14 scenes: small enough to hold in memory, so
// switching scene never waits on the network.
export const loadSnapshots = () => fetchAll<Snapshot>('snapshots', ['scene_id', 'mmsi'])
// ~2,200 rows over 18 months, loaded once at startup (section 5.3).
export const loadGfwEvents = () => fetchAll<GfwEvent>('gfw_fishing_events', ['start', 'event_id'])
// ~500 rows, both sites, both missions. Section 5.3 has it loaded when the
// Observation tab opens; the map needs it too, to decide whether a clear
// Sentinel-2 pass exists near the scene (M7), so it is read once at startup.
export const loadPasses = () =>
  fetchAll<SatellitePass>('satellite_passes', ['acq_start', 'product_name'])

export async function loadSite(): Promise<SiteGeometry> {
  const res = await fetch('/site.geojson')
  if (!res.ok) throw new Error(`site.geojson: HTTP ${res.status}`)
  const fc = await res.json()
  return fc.features[0].geometry as SiteGeometry
}

export const isFishing = (v: Vessel | undefined) => v?.ship_type === 'Fishing'
