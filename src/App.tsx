import { useEffect } from 'react'
import { supabase } from './lib/supabase'
import Map from './map/Map'
import { BASEMAP } from './map/layers'

export const APP_NAME = 'Danish Herring'

export default function App() {
  // M0 check: the console shows `scenes: 12`. Replaced by real loading in M2.
  useEffect(() => {
    supabase
      .from('scenes')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) console.error('scenes query failed:', error.message)
        else console.log(`scenes: ${count}`)
      })
  }, [])

  return (
    <div className="app">
      <header className="header">
        <span className="brand">{APP_NAME}</span>
        <span className="subtitle">Hirsholmene · Kattegat</span>
      </header>
      <aside className="panel">
        <h2>Scenes</h2>
        <p className="muted">Scene picker arrives in M2.</p>
      </aside>
      <main className="map-area">
        <Map />
      </main>
      <footer className="footer">
        Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global Fishing Watch ·
        EEA Natura 2000 · {BASEMAP.attribution}
      </footer>
    </div>
  )
}
