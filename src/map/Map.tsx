import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate module and resolves it relative to
// its own URL at runtime, which bundlers don't see. Let Vite bundle it and
// tell MapLibre where it landed.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Scene } from '../lib/data'
import type { LonLat } from '../lib/geo'
import type { Verdict } from '../lib/verdict'
import { s1TileUrl } from '../lib/wms'
import {
  BASEMAP,
  COLORS,
  IDS,
  INITIAL_VIEW,
  MAX_BOUNDS,
  S1_ATTRIBUTION,
  SITE_LABEL,
  SITE_RECT,
  ZOOM,
} from './layers'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

interface Props {
  scene: Scene | null
  showRadar: boolean
  verdict: Verdict | null
  onClick: (lonLat: LonLat) => void
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

// Layer 7 data: the click marker, and a thin line to the matched snapshot.
function clickFeatures(verdict: Verdict | null): FeatureCollection {
  if (!verdict) return EMPTY
  const features: Feature[] = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: verdict.click }, properties: {} },
  ]
  if (verdict.matched && verdict.nearest) {
    const { lon, lat } = verdict.nearest.snapshot
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [verdict.click, [lon, lat]] },
      properties: {},
    })
  }
  return { type: 'FeatureCollection', features }
}

export default function Map({ scene, showRadar, verdict, onClick }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // The map is created once; the handler it calls must always be the latest.
  const onClickRef = useRef(onClick)
  useEffect(() => {
    onClickRef.current = onClick
  }, [onClick])
  // Set once the style and our static layers are in; scene-driven layers
  // can only be added after that.
  const [ready, setReady] = useState(false)
  const [radarLoading, setRadarLoading] = useState(false)

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

    // Radar tiles are the only slow thing (section 14): show a thin bar
    // from the first S1 tile request until the source reports loaded.
    map.on('sourcedataloading', (e) => {
      if (e.sourceId === IDS.s1) setRadarLoading(true)
    })
    map.on('sourcedata', (e) => {
      if (e.sourceId === IDS.s1 && e.isSourceLoaded) setRadarLoading(false)
    })
    map.on('idle', () => setRadarLoading(false))

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

      // Layer 7: click marker + match line, on top of everything. The source
      // stays; its data is replaced on every click.
      map.addSource(IDS.click, { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: IDS.clickLine,
        type: 'line',
        source: IDS.click,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': COLORS.text, 'line-width': 1.5 },
      })
      map.addLayer({
        id: IDS.clickMarker,
        type: 'circle',
        source: IDS.click,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 8,
          'circle-opacity': 0,
          'circle-stroke-color': COLORS.text,
          'circle-stroke-width': 2,
        },
      })

      setReady(true)
    })

    map.on('click', (e) => onClickRef.current([e.lngLat.lng, e.lngLat.lat]))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Layer 3: Sentinel-1 radar, pinned to the selected scene's two-minute
  // window. The source is rebuilt whenever the scene changes (7.1) and sits
  // just below the site boundary.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !scene) return

    map.addSource(IDS.s1, {
      type: 'raster',
      tiles: [s1TileUrl(scene)],
      tileSize: 256,
      maxzoom: ZOOM.max, // never request beyond the zoom cap (section 18)
      attribution: S1_ATTRIBUTION,
    })
    map.addLayer({ id: IDS.s1, type: 'raster', source: IDS.s1 }, IDS.site)

    return () => {
      // The map may already be gone if the component is unmounting.
      if (mapRef.current !== map) return
      map.removeLayer(IDS.s1)
      map.removeSource(IDS.s1)
      setRadarLoading(false)
    }
  }, [ready, scene])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer(IDS.s1)) return
    map.setLayoutProperty(IDS.s1, 'visibility', showRadar ? 'visible' : 'none')
  }, [ready, scene, showRadar])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(IDS.click) as maplibregl.GeoJSONSource | undefined
    source?.setData(clickFeatures(verdict))
  }, [ready, verdict])

  return (
    <>
      <div ref={container} className="map" />
      <div
        className={'loading-bar' + (radarLoading ? ' loading-bar--on' : '')}
        role="progressbar"
        aria-label="Loading radar tiles"
        aria-hidden={!radarLoading}
      />
    </>
  )
}
