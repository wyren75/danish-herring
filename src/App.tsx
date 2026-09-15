import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadScenes,
  loadSite,
  loadSnapshots,
  loadVessels,
  type Scene,
  type Snapshot,
  type Vessel,
} from './lib/data'
import type { SiteGeometry } from './lib/geo'
import MapView from './map/Map'
import { BASEMAP } from './map/layers'
import ScenePicker, { rankScenes } from './panel/ScenePicker'

export const APP_NAME = 'Danish Herring'

interface Data {
  scenes: Scene[]
  snapshots: Snapshot[]
  vessels: Map<string, Vessel>
  site: SiteGeometry
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Everything the browser needs is read once, in parallel (SPEC.md 5.3).
  useEffect(() => {
    let cancelled = false
    Promise.all([loadScenes(), loadSnapshots(), loadVessels(), loadSite()])
      .then(([scenes, snapshots, vesselRows, site]) => {
        if (cancelled) return
        const vessels = new Map(vesselRows.map((v) => [v.mmsi, v]))
        setData({ scenes, snapshots, vessels, site })
        // Open on the busiest scene so the map is never empty.
        setSelectedId(rankScenes(scenes, snapshots, vessels, site)[0]?.scene.scene_id ?? null)
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

  // The selected scene and its snapshots — what M3 pins the radar to and
  // what M4 matches clicks against.
  const scene = useMemo(
    () => data?.scenes.find((s) => s.scene_id === selectedId) ?? null,
    [data, selectedId],
  )
  const sceneSnapshots = useMemo(
    () => (data && selectedId ? data.snapshots.filter((s) => s.scene_id === selectedId) : []),
    [data, selectedId],
  )

  useEffect(() => {
    if (scene) console.log(`scene ${scene.scene_id}: ${sceneSnapshots.length} snapshots`)
  }, [scene, sceneSnapshots])

  const selectScene = useCallback((id: string) => setSelectedId(id), [])

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
          <ScenePicker
            scenes={data.scenes}
            snapshots={data.snapshots}
            vessels={data.vessels}
            site={data.site}
            selectedId={selectedId}
            onSelect={selectScene}
          />
        ) : (
          <>
            <h2>Scenes</h2>
            <p className="muted">Loading…</p>
          </>
        )}
      </aside>
      <main className="map-area">
        <MapView />
      </main>
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
    </div>
  )
}
