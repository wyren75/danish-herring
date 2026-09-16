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
import type { LonLat, SiteGeometry } from './lib/geo'
import { eventsAroundPass, eventsOnSceneDay } from './lib/gfw'
import { clearS2Pass, type S2Pick } from './lib/s2'
import { computeVerdict, DEFAULT_RADIUS_M } from './lib/verdict'
import { aisFeatures, EMPTY_AIS } from './map/ais'
import { EMPTY_GFW, gfwFeatures } from './map/gfw'
import MapView from './map/Map'
import { BASEMAP } from './map/layers'
import Observation from './observation/Observation'
import Layers from './panel/Layers'
import Radius from './panel/Radius'
import SceneCounts from './panel/SceneCounts'
import ScenePicker, { rankScenes } from './panel/ScenePicker'
import VerdictPanel from './panel/Verdict'

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

  // Selecting a scene clears any click state (section 8).
  const selectScene = useCallback((id: string) => {
    setSelectedId(id)
    setClick(null)
  }, [])

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

  return (
    <div className="app">
      <header className="header">
        <span className="brand">{APP_NAME}</span>
        <span className="subtitle">Hirsholmene · Kattegat</span>
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
      </header>
      <aside className="panel">
        {loadError ? (
          <p className="error" role="alert">
            Could not load data: {loadError}
          </p>
        ) : data ? (
          <>
            <ScenePicker scenes={data.scenes} selectedId={selectedId} onSelect={selectScene}>
              {scene && (
                <SceneCounts
                  scene={scene}
                  sceneSnapshots={sceneSnapshots}
                  vessels={data.vessels}
                  events={data.events}
                  site={data.site}
                />
              )}
            </ScenePicker>
            <Layers
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
            <Radius radiusM={radiusM} onChange={setRadiusM} />
            {scene && (
              <VerdictPanel
                scene={scene}
                events={data.events}
                matchedEvents={matchedEvents}
                verdict={verdict}
                vessels={data.vessels}
              />
            )}
          </>
        ) : (
          <>
            <h2>Scenes</h2>
            <p className="muted">Loading…</p>
          </>
        )}
      </aside>
      <main className="map-area">
        <MapView
          scene={scene}
          showRadar={showRadar}
          s2Pass={s2.pass}
          showS2={showS2}
          gfw={gfw}
          ais={ais}
          showAis={showAis}
          revealKey={revealKey}
          verdict={verdict}
          onClick={setClick}
        />
      </main>
      {tab === 'observation' && data && (
        <Observation
          passes={data.passes}
          geometries={{ DK00FX113: data.site, BIJAGOS: data.bijagos }}
        />
      )}
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
    </div>
  )
}
