import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadBijagos,
  loadGfwEvents,
  loadPasses,
  loadScenes,
  loadSite,
  loadSnapshots,
  loadVessels,
  type GfwEvent,
  type SatellitePass,
  type Scene,
  type Snapshot,
  type Vessel,
} from './lib/data'
import { bounds, type LonLat, type SiteGeometry } from './lib/geo'
import { eventsAroundPass, eventsOnSceneDay } from './lib/gfw'
import { clearS2Pass, type S2Pick } from './lib/s2'
import { computeVerdict, DEFAULT_RADIUS_M } from './lib/verdict'
import { aisFeatures, EMPTY_AIS } from './map/ais'
import { EMPTY_GFW, gfwFeatures } from './map/gfw'
import MapView from './map/Map'
import { BASEMAP } from './map/layers'
import Observation from './observation/Observation'
import Inspector from './panel/Inspector'
import LayersCard from './panel/LayersCard'
import SceneCounts from './panel/SceneCounts'
import { rankScenes } from './panel/ScenePicker'
import TopBar from './panel/TopBar'

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

const NO_S2: S2Pick = { pass: null, best: null }

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Layer 3 is on by default (section 7 table).
  const [showRadar, setShowRadar] = useState(true)
  // Layer 2 is off by default and only offered when a clear Sentinel-2 pass
  // exists within a day of the scene (section 7).
  const [showS2, setShowS2] = useState(false)
  // Layer 6 is off by default — the user looks at the radar first (7.3).
  const [showAis, setShowAis] = useState(false)
  // Layer 5 is context, not the subject — also off (7.4).
  const [showGfw, setShowGfw] = useState(false)
  const [revealKey, setRevealKey] = useState(0)
  // Click state (section 9): where the user clicked, and the matching radius.
  const [click, setClick] = useState<LonLat | null>(null)
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M)
  // The first-visit hint (13.4) goes on the first map click and stays gone.
  const [hint, setHint] = useState(true)

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

  // Selecting a scene clears any click state (section 8), which also closes
  // the inspector (13.5).
  const selectScene = useCallback((id: string) => {
    setSelectedId(id)
    setClick(null)
  }, [])
  const clearClick = useCallback(() => setClick(null), [])
  const mapClick = useCallback((lonLat: LonLat) => {
    setHint(false)
    setClick(lonLat)
  }, [])

  // What the map fits to (13.4): the site polygon's bounds.
  const siteBounds = useMemo(() => (data ? bounds(data.site) : null), [data])

  const verdict = useMemo(
    () => (data && click ? computeVerdict(click, sceneSnapshots, radiusM, data.site) : null),
    [data, click, sceneSnapshots, radiusM],
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

  // "Reveal all" is the toggle plus an animation (7.3).
  const reveal = useCallback(() => {
    setShowAis(true)
    setRevealKey((k) => k + 1)
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
          <LayersCard
            showRadar={showRadar}
            onShowRadar={setShowRadar}
            scene={scene}
            s2={s2}
            showS2={showS2}
            onShowS2={setShowS2}
            showAis={showAis}
            onShowAis={setShowAis}
            onReveal={reveal}
            showGfw={showGfw}
            onShowGfw={setShowGfw}
          />
          {hint && (
            <p className="hint">
              Pick a scene above, then click a bright dot inside the orange line.
            </p>
          )}
        </main>
        {data && scene && (
          <Inspector
            open={click !== null}
            onClose={clearClick}
            radiusM={radiusM}
            onRadius={setRadiusM}
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
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
    </div>
  )
}
