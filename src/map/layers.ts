// ---------------------------------------------------------------------------
// Basemap — owner's choice, one constant (SPEC.md section 6.3 / 17).
// OpenFreeMap "dark": a free vector style with no key. Carto Dark Matter was
// the original default but required an API key as of September 2026.
// The style carries its own on-map attribution; `attribution` below is the
// plain-text form for the footer.
// ---------------------------------------------------------------------------
export const BASEMAP = {
  style: 'https://tiles.openfreemap.org/styles/dark',
  attribution: '© OpenFreeMap © OpenMapTiles · Data from OpenStreetMap',
  labelFont: 'Noto Sans Regular', // a glyph stack the style provides
}

// ---------------------------------------------------------------------------
// Geometries (SPEC.md section 3.1). The BOX is the padded ingestion rectangle;
// it decides what data to load and where the map may go. The SITE polygon
// (public/site.geojson) is the legal boundary and is never approximated by
// this rectangle.
// ---------------------------------------------------------------------------
export const BOX = { w: 10.321, s: 57.23, e: 10.767, n: 57.686 } as const

// The site polygon's tightest enclosing rectangle — places the boundary label
// at its north-east corner (7.2) and is the first-paint view before the
// polygon itself has loaded (13.4).
export const SITE_RECT = { w: 10.441, s: 57.35, e: 10.647, n: 57.566 } as const
export const SITE_LABEL = 'Natura 2000 · DK00FX113 · Hirsholmene'

// ---------------------------------------------------------------------------
// View (sections 7 and 13.4): the initial view fits the site polygon's bounds
// with this padding — never a fixed centre and zoom (v1, 16 Sept 2026). Zoom
// range and pan limits ≈ box + 30 km stay; at 57.5° N, 30 km ≈ 0.27°
// latitude ≈ 0.50° longitude.
// ---------------------------------------------------------------------------
export const FIT_PADDING_PX = 60
export const ZOOM = { min: 9, max: 14 }
export const MAX_BOUNDS: [[number, number], [number, number]] = [
  [BOX.w - 0.5, BOX.s - 0.27],
  [BOX.e + 0.5, BOX.n + 0.27],
]

export const COLORS = {
  accent: '#f5a524', // fishing vessels and the site outline
  other: '#4fb3ff', // every other vessel — light blue (owner's call, M5b)
  white: '#ffffff', // in-site ring and the matched vessel's outline
  bg: '#0b0e14',
  text: '#e6e8ee',
}

// Layer / source ids, so other modules can insert layers in the right order
// (section 7 table: basemap → S2 → S1 → site → GFW → AIS → click marker).
// Everything of ours goes on top of the basemap style's own layers.
export const IDS = {
  s2: 's2', // layer 2: optical, only when a clear pass exists near the scene
  s1: 's1',
  site: 'site',
  siteLabel: 'site-label',
  gfw: 'gfw', // layer 5: one source, a rectangle and a centre square per GFW event
  gfwBox: 'gfw-box',
  gfwIcon: 'gfw-square',
  ais: 'ais', // layer 6: one source, triangles for moving vessels, dots for the rest
  aisTri: 'ais-tri',
  aisDot: 'ais-dot',
  aisIcon: 'ais-triangle', // the SDF image the triangle layer uses
  click: 'click', // layer 7: one source, a line layer and a marker layer
  clickLine: 'click-line',
  clickMarker: 'click-marker',
}

// Both Sentinel layers carry the same notice.
export const SENTINEL_ATTRIBUTION = 'Contains modified Copernicus Sentinel data'
