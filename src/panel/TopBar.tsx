import type { ReactNode } from 'react'
import type { Scene } from '../lib/data'
import SceneStepper from './SceneStepper'

interface Props {
  title: string
  scenes: Scene[]
  scene: Scene | null
  onSelect: (sceneId: string) => void
  tabs: ReactNode
  // The one-sentence second row (10.1 as worded in 13.8); null while loading.
  counts: ReactNode
  loadError: string | null
}

// The top bar (13.3): setup. Row 1 — title, the scene stepper, the tabs.
// Row 2 — the acquisition instant and the two counts at it, as one sentence.
// The product name is not here (13.8): it is the stepper's tooltip and the
// inspector's footer.
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
          counts
        ) : (
          <span>Loading…</span>
        )}
      </div>
    </header>
  )
}
