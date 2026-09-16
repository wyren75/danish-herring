import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate module and resolves it relative to
// its own URL at runtime, which bundlers don't see. Let Vite bundle it and
// tell MapLibre where it landed.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { SatellitePass, Scene } from '../lib/data'
import type { LonLat } from '../lib/geo'
import type { Verdict } from '../lib/verdict'
import { s1TileUrl, s2TileUrl } from '../lib/wms'
import {
  EMPTY_AIS,
  ICON_PIXEL_RATIO,
  triangleIcon,
  type AisFeatures,
  type AisProps,
} from './ais'
import { EMPTY_GFW, squareIcon, type GfwFeatures, type GfwProps } from './gfw'
import {
  BASEMAP,
  COLORS,
  IDS,
  INITIAL_VIEW,
  MAX_BOUNDS,
  SENTINEL_ATTRIBUTION,
  SITE_LABEL,
  SITE_RECT,
  ZOOM,
} from './layers'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

interface Props {
  scene: Scene | null
  showRadar: boolean
  // Layer 2 exists only when a clear Sentinel-2 pass lies within a day of
  // the scene (section 7); null means no source is added at all.
  s2Pass: SatellitePass | null
  showS2: boolean
  gfw: GfwFeatures
  ais: AisFeatures
  showAis: boolean
  // Bumped by "Reveal all": the markers sweep in instead of just appearing.
  revealKey: number
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

// Layer 6 visibility is a paint opacity rather than layout visibility, so the
// matched vessel can stay on screen while the rest are hidden (7.3), and so
// "Reveal all" can fade the markers in one after another. `t` is the sweep
// time in ms; Infinity shows everything, null hides all but the match.
const REVEAL_MS = 700
const FADE_MS = 200
type Opacity = maplibregl.ExpressionSpecification | number
function aisOpacity(t: number | null, n: number): Opacity {
  if (t === null) return ['case', ['get', 'matched'], 1, 0]
  if (t === Infinity) return 1
  const stagger = (REVEAL_MS - FADE_MS) / Math.max(1, n - 1)
  return [
    'case',
    ['get', 'matched'],
    1,
    ['min', 1, ['max', 0, ['/', ['-', t, ['*', ['get', 'order'], stagger]], FADE_MS]]],
  ]
}

const AIS_HIT_PX = 6

// The marker under a screen point, if any. Both layers are queried within a
// small box so a 10 px triangle is not a pixel-perfect target.
function markerAt(map: maplibregl.Map, p: maplibregl.Point): AisProps | null {
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [p.x - AIS_HIT_PX, p.y - AIS_HIT_PX],
    [p.x + AIS_HIT_PX, p.y + AIS_HIT_PX],
  ]
  const hits = map.queryRenderedFeatures(box, { layers: [IDS.aisTri, IDS.aisDot] })
  return hits.length ? (hits[0].properties as AisProps) : null
}

export default function Map({
  scene,
  showRadar,
  s2Pass,
  showS2,
  gfw,
  ais,
  showAis,
  revealKey,
  verdict,
  onClick,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // The map is created once; the handler it calls must always be the latest.
  const onClickRef = useRef(onClick)
  useEffect(() => {
    onClickRef.current = onClick
  }, [onClick])
  // Hidden markers are still "rendered" as far as hit-testing goes; the
  // click and hover handlers need to know whether they are visible.
  const showAisRef = useRef(showAis)
  useEffect(() => {
    showAisRef.current = showAis
  }, [showAis])
  // Set once the style and our static layers are in; scene-driven layers
  // can only be added after that.
  const [ready, setReady] = useState(false)
  // Imagery sources with tiles in flight — the loading bar shows while any.
  const loadingSources = useRef(new Set<string>())
  const [tilesLoading, setTilesLoading] = useState(false)

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

    // Sentinel tiles are the only slow thing (section 14): show a thin bar
    // from the first tile request until every imagery source reports loaded.
    const imagery = new Set<string>([IDS.s2, IDS.s1])
    const loading = loadingSources.current
    map.on('sourcedataloading', (e) => {
      if (!imagery.has(e.sourceId)) return
      loading.add(e.sourceId)
      setTilesLoading(true)
    })
    map.on('sourcedata', (e) => {
      if (!imagery.has(e.sourceId) || !e.isSourceLoaded) return
      loading.delete(e.sourceId)
      if (!loading.size) setTilesLoading(false)
    })
    map.on('idle', () => {
      loading.clear()
      setTilesLoading(false)
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

      // Layer 5: GFW fishing events (7.4, 10.3) — a thin dashed rectangle per
      // event (the box the vessel stayed inside) with a small orange square at
      // its centre. Context, not the subject: drawn under the AIS markers.
      // What is in the source decides what shows: nothing until a vessel is
      // matched, then that vessel's events; the whole day only when the
      // layer is ticked. Opacity is per feature (map/gfw.ts).
      map.addImage(IDS.gfwIcon, squareIcon(), { sdf: true, pixelRatio: ICON_PIXEL_RATIO })
      map.addSource(IDS.gfw, { type: 'geojson', data: EMPTY_GFW })
      map.addLayer({
        id: IDS.gfwBox,
        type: 'line',
        source: IDS.gfw,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': COLORS.accent,
          'line-width': 1,
          'line-dasharray': [3, 2],
          'line-opacity': ['get', 'opacity'],
        },
      })
      map.addLayer({
        id: IDS.gfw,
        type: 'symbol',
        source: IDS.gfw,
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'icon-image': IDS.gfwIcon,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': COLORS.accent,
          'icon-halo-color': COLORS.bg,
          'icon-halo-width': 1,
          'icon-opacity': ['get', 'opacity'],
        },
      })
      // GFW tooltip (7.4, unchanged): vessel, flag, duration, inside/outside
      // the site — on the square and on the rectangle's edge alike.
      const gfwTip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'gfw-tip',
        offset: 8,
      })
      for (const layer of [IDS.gfw, IDS.gfwBox]) {
        map.on('mousemove', layer, (e) => {
          const hit = e.features?.[0]
          if (!hit) return
          const { vessel, detail } = hit.properties as GfwProps
          const el = document.createElement('div')
          el.append(Object.assign(document.createElement('strong'), { textContent: vessel }))
          el.append(document.createElement('br'))
          el.append(detail)
          gfwTip.setLngLat(e.lngLat).setDOMContent(el).addTo(map)
        })
        map.on('mouseleave', layer, () => gfwTip.remove())
      }

      // Layer 6: AIS snapshots (7.3). Triangles rotated to cog for moving
      // vessels, dots for the rest; orange if fishing, blue otherwise; a white
      // ring inside the site; the matched vessel larger with a white outline.
      // The source stays; its data is replaced per scene and per verdict.
      map.addImage(IDS.aisIcon, triangleIcon(), { sdf: true, pixelRatio: ICON_PIXEL_RATIO })
      map.addSource(IDS.ais, { type: 'geojson', data: EMPTY_AIS })
      const fill: maplibregl.ExpressionSpecification = [
        'case', ['get', 'fishing'], COLORS.accent, COLORS.other,
      ]
      const ring: maplibregl.ExpressionSpecification = [
        'case', ['any', ['get', 'matched'], ['get', 'inSite']], 2, 0,
      ]
      map.addLayer({
        id: IDS.aisTri,
        type: 'symbol',
        source: IDS.ais,
        filter: ['==', ['get', 'moving'], true],
        layout: {
          'icon-image': IDS.aisIcon,
          'icon-rotate': ['get', 'cog'],
          'icon-rotation-alignment': 'map',
          'icon-size': ['case', ['get', 'matched'], 1.6, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': fill,
          'icon-halo-color': COLORS.white,
          'icon-halo-width': ring,
          'icon-opacity': aisOpacity(null, 0),
          'icon-opacity-transition': { duration: 0 },
        },
      })
      map.addLayer({
        id: IDS.aisDot,
        type: 'circle',
        source: IDS.ais,
        filter: ['==', ['get', 'moving'], false],
        paint: {
          'circle-radius': ['case', ['get', 'matched'], 5, 3],
          'circle-color': fill,
          'circle-stroke-color': COLORS.white,
          'circle-stroke-width': ring,
          'circle-opacity': aisOpacity(null, 0),
          'circle-opacity-transition': { duration: 0 },
          'circle-stroke-opacity': aisOpacity(null, 0),
          'circle-stroke-opacity-transition': { duration: 0 },
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

    // A visible marker is a shortcut to the matched panel (7.3): the click
    // lands on the vessel's AIS position, so the verdict is that vessel.
    const visibleMarkerAt = (p: maplibregl.Point) => {
      if (!map.getLayer(IDS.aisTri)) return null
      const hit = markerAt(map, p)
      return hit && (showAisRef.current || hit.matched) ? hit : null
    }
    map.on('click', (e) => {
      const hit = visibleMarkerAt(e.point)
      onClickRef.current(hit ? [hit.lon, hit.lat] : [e.lngLat.lng, e.lngLat.lat])
    })
    map.on('mousemove', (e) => {
      map.getCanvas().style.cursor = visibleMarkerAt(e.point) ? 'pointer' : ''
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // A Sentinel Hub raster source and layer, inserted below `beforeId`.
  // Returns the cleanup that removes both.
  const addImagery = (map: maplibregl.Map, id: string, url: string, beforeId: string) => {
    map.addSource(id, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      maxzoom: ZOOM.max, // never request beyond the zoom cap (section 18)
      attribution: SENTINEL_ATTRIBUTION,
    })
    map.addLayer({ id, type: 'raster', source: id }, beforeId)
    return () => {
      // The map may already be gone if the component is unmounting.
      if (mapRef.current !== map) return
      map.removeLayer(id)
      map.removeSource(id)
      // A removed source never reports loaded; drop it from the bar.
      loadingSources.current.delete(id)
      if (!loadingSources.current.size) setTilesLoading(false)
    }
  }

  // Layer 3: Sentinel-1 radar, pinned to the selected scene's two-minute
  // window. The source is rebuilt whenever the scene changes (7.1) and sits
  // just below the site boundary — which puts it above layer 2 whenever
  // both exist, whichever was added first.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !scene) return
    return addImagery(map, IDS.s1, s1TileUrl(scene), IDS.site)
  }, [ready, scene])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer(IDS.s1)) return
    map.setLayoutProperty(IDS.s1, 'visibility', showRadar ? 'visible' : 'none')
  }, [ready, scene, showRadar])

  // Layer 2: Sentinel-2 true colour over the whole day of the nearest clear
  // pass (7.1). Only added when such a pass exists; rebuilt when it changes
  // (two scenes a day apart can share one). Sits under the radar.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !s2Pass) return
    const beforeId = map.getLayer(IDS.s1) ? IDS.s1 : IDS.site
    return addImagery(map, IDS.s2, s2TileUrl(s2Pass), beforeId)
  }, [ready, s2Pass])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer(IDS.s2)) return
    map.setLayoutProperty(IDS.s2, 'visibility', showS2 ? 'visible' : 'none')
  }, [ready, s2Pass, showS2])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(IDS.click) as maplibregl.GeoJSONSource | undefined
    source?.setData(clickFeatures(verdict))
  }, [ready, verdict])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(IDS.ais) as maplibregl.GeoJSONSource | undefined
    source?.setData(ais)
  }, [ready, ais])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(IDS.gfw) as maplibregl.GeoJSONSource | undefined
    source?.setData(gfw)
  }, [ready, gfw])

  // Show / hide, and the "Reveal all" sweep. Each new revealKey runs the
  // opacity expression forward over REVEAL_MS; a plain toggle jumps to the end.
  const revealedKey = useRef(0)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const n = ais.features.length
    const apply = (t: number | null) => {
      const expr = aisOpacity(t, n)
      map.setPaintProperty(IDS.aisTri, 'icon-opacity', expr)
      map.setPaintProperty(IDS.aisDot, 'circle-opacity', expr)
      map.setPaintProperty(IDS.aisDot, 'circle-stroke-opacity', expr)
    }
    if (!showAis) {
      apply(null)
      return
    }
    if (revealKey === revealedKey.current) {
      apply(Infinity)
      return
    }
    revealedKey.current = revealKey
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = now - start
      if (t >= REVEAL_MS) {
        apply(Infinity)
        return
      }
      apply(t)
      frame = requestAnimationFrame(tick)
    }
    apply(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ready, ais, showAis, revealKey])

  return (
    <>
      <div ref={container} className="map" />
      <div
        className={'loading-bar' + (tilesLoading ? ' loading-bar--on' : '')}
        role="progressbar"
        aria-label="Loading imagery tiles"
        aria-hidden={!tilesLoading}
      />
    </>
  )
}
