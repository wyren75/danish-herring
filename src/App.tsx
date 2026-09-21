import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadBijagos,
  loadGfwEvents,
  loadPasses,
  loadScenes,
  loadSite,
  loadSnapshots,
  loadVessels,
  isFishing,
  type GfwEvent,
  type SatellitePass,
  type Scene,
  type Snapshot,
  type Vessel,
} from './lib/data'
import { bounds, pointInPolygon, type LonLat, type SiteGeometry } from './lib/geo'
import { eventsAroundPass, eventsOnSceneDay } from './lib/gfw'
import { clearS2Pass, type S2Pick } from './lib/s2'
import { computeVerdict, DEFAULT_RADIUS_M, type Verdict } from './lib/verdict'
import { aisFeatures, EMPTY_AIS } from './map/ais'
import { EMPTY_GFW, gfwFeatures } from './map/gfw'
import MapView from './map/Map'
import { BASEMAP } from './map/layers'
import Observation from './observation/Observation'
import Inspector from './panel/Inspector'
import { layersControl } from './panel/LayersControl'
import { legendControl } from './panel/LegendControl'
import MapControls from './panel/MapControls'
import Progress from './panel/Progress'
import SceneCounts from './panel/SceneCounts'
import { rankScenes } from './panel/ScenePicker'
import TopBar from './panel/TopBar'
import { Analytics } from '@vercel/analytics/react'
import Welcome, { AboutButton, welcomeDismissed } from './panel/Welcome'

export const APP_NAME = 'Danish Herring'

interface Data {
  scenes: Scene[]
  snapshots: Snapshot[]
  vessels: Map<string, Vessel>
  events: GfwEvent[]
  passes: SatellitePass[]
  site: SiteGeometry
  bijagos: SiteGeometry
}

// Two tabs are a useState (section 4).
type Tab = 'map' | 'observation'

// The imagery layers (2 and 3) are one choice, not two toggles: radar,
// optical, or neither. They can never stack.
type Imagery = 'radar' | 'optical' | null

const NO_S2: S2Pick = { pass: null, best: null }

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Radar is the layer the app opens on (section 7 table); optical is only
  // offered when a clear Sentinel-2 pass exists within a day of the scene.
  const [imagery, setImagery] = useState<Imagery>('radar')
  // Layer 6 is off by default — the user looks at the radar first (7.3).
  const [showAis, setShowAis] = useState(false)
  // Layer 5 is context, not the subject — also off (7.4).
  const [showGfw, setShowGfw] = useState(false)
  const [revealKey, setRevealKey] = useState(0)
  // Click state (section 9): where the user clicked, and the matching radius.
  const [click, setClick] = useState<LonLat | null>(null)
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M)
  // The quest (13.14): the distinct MMSIs found in the scene on screen.
  const [found, setFound] = useState<ReadonlySet<string>>(() => new Set())
  // The welcome (13.10) shows once per browser; the book icon reopens it.
  const [welcome, setWelcome] = useState(() => !welcomeDismissed())

  // Everything the browser needs is read once, in parallel (SPEC.md 5.3).
  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadScenes(),
      loadSnapshots(),
      loadVessels(),
      loadGfwEvents(),
      loadPasses(),
      loadSite(),
      loadBijagos(),
    ])
      .then(([scenes, snapshots, vesselRows, events, passes, site, bijagos]) => {
        if (cancelled) return
        const vessels = new Map(vesselRows.map((v) => [v.mmsi, v]))
        setData({ scenes, snapshots, vessels, events, passes, site, bijagos })
        // Open on the busiest scene so the map is never empty.
        setSelectedId(rankScenes(scenes)[0]?.scene_id ?? null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        console.error('data load failed:', e.message)
        setLoadError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The selected scene and its snapshots — what the radar is pinned to and
  // what clicks are matched against.
  const scene = useMemo(
    () => data?.scenes.find((s) => s.scene_id === selectedId) ?? null,
    [data, selectedId],
  )
  const sceneSnapshots = useMemo(
    () => (data && selectedId ? data.snapshots.filter((s) => s.scene_id === selectedId) : []),
    [data, selectedId],
  )

  // The Sentinel-2 pass the scene may show, if a clear one is within a day.
  const s2 = useMemo(() => (data && scene ? clearS2Pass(data.passes, scene) : NO_S2), [data, scene])

  // What the map draws: optical only where the scene offers a clear pass, and
  // radar standing in for it where it does not, so choosing optical and then
  // stepping to a cloudy scene never leaves the map bare.
  const showS2 = imagery === 'optical' && !!s2.pass
  const showRadar = imagery === 'radar' || (imagery === 'optical' && !s2.pass)

  // Selecting a scene clears any click state (section 8), which also closes
  // the inspector (13.5), and starts the quest again (13.14): each scene is
  // its own hunt.
  const selectScene = useCallback((id: string) => {
    setSelectedId(id)
    setClick(null)
    setFound(new Set())
  }, [])
  const clearClick = useCallback(() => setClick(null), [])
  const openWelcome = useCallback(() => setWelcome(true), [])
  const closeWelcome = useCallback(() => setWelcome(false), [])

  // What the map fits to (13.4): the site polygon's bounds.
  const siteBounds = useMemo(() => (data ? bounds(data.site) : null), [data])

  const verdict = useMemo(
    () => (data && click ? computeVerdict(click, sceneSnapshots, radiusM, data.site) : null),
    [data, click, sceneSnapshots, radiusM],
  )

  // A find (13.14) is any match on a Fishing vessel whose AIS position is
  // inside the site polygon — the two conditions of `n_fishing_in_site`, so
  // numerator and denominator count the same fleet. How the match was
  // reached does not matter: a blind click on the radar and a click on a
  // revealed AIS marker arrive here by the same path.
  const record = useCallback(
    (v: Verdict) => {
      const snapshot = v.matched ? v.nearest?.snapshot : undefined
      if (!data || !snapshot) return
      if (!isFishing(data.vessels.get(snapshot.mmsi))) return
      if (!pointInPolygon(snapshot.lon, snapshot.lat, data.site)) return
      setFound((prev) => (prev.has(snapshot.mmsi) ? prev : new Set(prev).add(snapshot.mmsi)))
    },
    [data],
  )

  // Both actions that can produce a match record it where it happens: the
  // click, and a drag of the radius that pulls a vessel inside the circle.
  const mapClick = useCallback(
    (lonLat: LonLat) => {
      setClick(lonLat)
      if (data) record(computeVerdict(lonLat, sceneSnapshots, radiusM, data.site))
    },
    [data, sceneSnapshots, radiusM, record],
  )
  const changeRadius = useCallback(
    (m: number) => {
      setRadiusM(m)
      if (data && click) record(computeVerdict(click, sceneSnapshots, m, data.site))
    },
    [data, click, sceneSnapshots, record],
  )

  // The matched vessel's GFW events around the pass (10.2): the verdict
  // panel tells their story and the map draws them, layer on or off (10.3).
  const matchedEvents = useMemo(() => {
    const mmsi = verdict?.matched ? verdict.nearest?.snapshot.mmsi : undefined
    return data && scene && mmsi ? eventsAroundPass(data.events, mmsi, scene) : []
  }, [data, scene, verdict])

  // Layer 5: the matched vessel's events always; every event overlapping the
  // scene's UTC day (7.4) only when the layer is on.
  const gfw = useMemo(
    () =>
      data && scene
        ? gfwFeatures(showGfw ? eventsOnSceneDay(data.events, scene) : [], matchedEvents, showGfw)
        : EMPTY_GFW,
    [data, scene, matchedEvents, showGfw],
  )

  const ais = useMemo(
    () => (data ? aisFeatures(sceneSnapshots, data.vessels, data.site, verdict) : EMPTY_AIS),
    [data, sceneSnapshots, verdict],
  )

  // Ticking one imagery layer unticks the other; unticking leaves neither.
  const toggleRadar = useCallback((on: boolean) => setImagery(on ? 'radar' : null), [])
  const toggleS2 = useCallback((on: boolean) => setImagery(on ? 'optical' : null), [])

  // Showing AIS is still the reveal moment (7.3): each time the layer comes
  // on, the markers sweep in rather than appearing all at once.
  const toggleAis = useCallback((on: boolean) => {
    setShowAis(on)
    if (on) setRevealKey((k) => k + 1)
  }, [])

  const tabs = (
    <nav className="tabs" aria-label="Tabs">
      {(['map', 'observation'] as const).map((t) => (
        <button
          key={t}
          type="button"
          className={`tab${tab === t ? ' tab--active' : ''}`}
          aria-pressed={tab === t}
          onClick={() => setTab(t)}
        >
          {t === 'map' ? 'Map' : 'Observation'}
        </button>
      ))}
    </nav>
  )

  // v1 layout (section 13): setup in the top bar, the map full width with
  // its furniture on it, the result in an inspector that exists only once
  // there is one.
  return (
    <div className="app">
      <TopBar
        title={APP_NAME}
        scenes={data?.scenes ?? []}
        scene={scene}
        onSelect={selectScene}
        tabs={tabs}
        loadError={loadError}
        counts={
          data && scene ? (
            <SceneCounts
              scene={scene}
              sceneSnapshots={sceneSnapshots}
              vessels={data.vessels}
              events={data.events}
              site={data.site}
            />
          ) : null
        }
      />
      <div className="main">
        <main className="map-area">
          <MapView
            fit={siteBounds}
            scene={scene}
            showRadar={showRadar}
            s2Pass={s2.pass}
            showS2={showS2}
            gfw={gfw}
            ais={ais}
            showAis={showAis}
            revealKey={revealKey}
            verdict={verdict}
            onClick={mapClick}
          />
          <MapControls
            controls={[
              layersControl({
                showRadar,
                onShowRadar: toggleRadar,
                scene,
                s2,
                showS2,
                onShowS2: toggleS2,
                showAis,
                onShowAis: toggleAis,
                showGfw,
                onShowGfw: setShowGfw,
              }),
              legendControl,
            ]}
          />
          <Progress found={found.size} total={scene?.n_fishing_in_site ?? 0} />
          <AboutButton onClick={openWelcome} />
          <Welcome open={welcome} onClose={closeWelcome} />
        </main>
        {data && scene && (
          <Inspector
            open={click !== null}
            onClose={clearClick}
            radiusM={radiusM}
            onRadius={changeRadius}
            scene={scene}
            events={data.events}
            matchedEvents={matchedEvents}
            verdict={verdict}
            vessels={data.vessels}
          />
        )}
        {tab === 'observation' && data && (
          <Observation
            passes={data.passes}
            geometries={{ DK00FX113: data.site, BIJAGOS: data.bijagos }}
          />
        )}
      </div>
      {/* Vercel Web Analytics: page views and referrer, cookieless, no
          personal data, no custom events. Nothing to consent to. */}
      <Analytics />
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
      <Analytics />
    </div>
  )
}
