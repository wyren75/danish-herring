import type { ReactNode } from 'react'
import type { Scene } from '../lib/data'
import { utcTimeSeconds } from '../lib/format'
import SceneStepper from './SceneStepper'

interface Props {
  title: string
  scenes: Scene[]
  scene: Scene | null
  onSelect: (sceneId: string) => void
  tabs: ReactNode
  // The two-count line (10.1) for the second row; null while loading.
  counts: ReactNode
  loadError: string | null
}

// The top bar (13.3): setup. Row 1 — title, the scene stepper, the tabs.
// Row 2 — the selected scene's product name, its acquisition instant and
// the two counts at that instant, in one muted line.
export default function TopBar({ title, scenes, scene, onSelect, tabs, counts, loadError }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-row1">
        <span className="brand">{title}</span>
        <span className="subtitle">Hirsholmene · Kattegat</span>
        <SceneStepper scenes={scenes} selectedId={scene?.scene_id ?? null} onSelect={onSelect} />
        {tabs}
      </div>
      <div className="topbar-row2">
        {loadError ? (
          <span className="error" role="alert">
            Could not load data: {loadError}
          </span>
        ) : scene ? (
          <>
            <code className="scene-product" title={scene.product_name}>
              {scene.product_name}
            </code>
            <span className="topbar-sep">·</span>
            <span>acquired {utcTimeSeconds(scene.acq_mid)} — AIS interpolated to this second</span>
            <span className="topbar-sep">·</span>
            {counts}
          </>
        ) : (
          <span>Loading…</span>
        )}
      </div>
    </header>
  )
}
