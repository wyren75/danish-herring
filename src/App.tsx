import { useCallback, useEffect, useMemo, useState } from 'react'
import { eventsOnSceneDay } from './lib/confidence'
import {
  loadGfwEvents,
  loadScenes,
  loadSite,
  loadSnapshots,
  loadVessels,
  type GfwEvent,
  type Scene,
  type Snapshot,
  type Vessel,
} from './lib/data'
import type { LonLat, SiteGeometry } from './lib/geo'
import { computeVerdict, DEFAULT_RADIUS_M } from './lib/verdict'
import { aisFeatures, EMPTY_AIS } from './map/ais'
import { EMPTY_GFW, gfwFeatures } from './map/gfw'
import MapView from './map/Map'
import { BASEMAP } from './map/layers'
import Confidence from './panel/Confidence'
import Layers from './panel/Layers'
import Radius from './panel/Radius'
import ScenePicker, { rankScenes } from './panel/ScenePicker'
import VerdictPanel from './panel/Verdict'

export const APP_NAME = 'Danish Herring'

interface Data {
  scenes: Scene[]
  snapshots: Snapshot[]
  vessels: Map<string, Vessel>
  events: GfwEvent[]
  site: SiteGeometry
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Layer 3 is on by default (section 7 table).
  const [showRadar, setShowRadar] = useState(true)
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
    Promise.all([loadScenes(), loadSnapshots(), loadVessels(), loadGfwEvents(), loadSite()])
      .then(([scenes, snapshots, vesselRows, events, site]) => {
        if (cancelled) return
        const vessels = new Map(vesselRows.map((v) => [v.mmsi, v]))
        setData({ scenes, snapshots, vessels, events, site })
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

  // Layer 5: the GFW events overlapping the scene's UTC day (7.4).
  const gfw = useMemo(
    () => (data && scene ? gfwFeatures(eventsOnSceneDay(data.events, scene)) : EMPTY_GFW),
    [data, scene],
  )

  // Selecting a scene clears any click state (section 8).
  const selectScene = useCallback((id: string) => {
    setSelectedId(id)
    setClick(null)
  }, [])

  const verdict = useMemo(
    () => (data && click ? computeVerdict(click, sceneSnapshots, radiusM, data.site) : null),
    [data, click, sceneSnapshots, radiusM],
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
                <Confidence scene={scene} sceneSnapshots={sceneSnapshots} events={data.events} />
              )}
            </ScenePicker>
            <Layers
              showRadar={showRadar}
              onShowRadar={setShowRadar}
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
                sceneSnapshots={sceneSnapshots}
                events={data.events}
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
          gfw={gfw}
          showGfw={showGfw}
          ais={ais}
          showAis={showAis}
          revealKey={revealKey}
          verdict={verdict}
          onClick={setClick}
        />
      </main>
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
    </div>
  )
}
