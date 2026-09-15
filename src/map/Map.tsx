import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate module and resolves it relative to
// its own URL at runtime, which bundlers don't see. Let Vite bundle it and
// tell MapLibre where it landed.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  BASEMAP,
  COLORS,
  IDS,
  INITIAL_VIEW,
  MAX_BOUNDS,
  SITE_LABEL,
  SITE_RECT,
  ZOOM,
} from './layers'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

export default function Map() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!container.current) return

    const map = new maplibregl.Map({
      container: container.current,
      style: BASEMAP.style,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      minZoom: ZOOM.min,
      maxZoom: ZOOM.max,
      maxBounds: MAX_BOUNDS,
      // Attribution must be visible at all times (section 6.3 / 14).
      attributionControl: { compact: false },
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // The basemap style references a sprite image it doesn't ship
    // ("wood-pattern"). Supply a transparent pixel so the console stays clean.
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) })
      }
    })

    map.on('load', () => {
      // Layer 4: site boundary — outline only, 2 px, accent, no fill (7.2).
      map.addSource(IDS.site, { type: 'geojson', data: '/site.geojson' })
      map.addLayer({
        id: IDS.site,
        type: 'line',
        source: IDS.site,
        paint: {
          'line-color': COLORS.accent,
          'line-width': 2,
        },
      })

      // Label anchored at the polygon's north-east corner.
      map.addSource(IDS.siteLabel, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [SITE_RECT.e, SITE_RECT.n] },
          properties: { label: SITE_LABEL },
        },
      })
      map.addLayer({
        id: IDS.siteLabel,
        type: 'symbol',
        source: IDS.siteLabel,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': [BASEMAP.labelFont],
          'text-size': 12,
          'text-anchor': 'bottom-left',
          'text-offset': [0.4, -0.4],
          'text-max-width': 40,
        },
        paint: {
          'text-color': COLORS.accent,
          'text-halo-color': COLORS.bg,
          'text-halo-width': 1.5,
        },
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={container} className="map" />
}
