import { useMemo } from 'react'
import type { Scene } from '../lib/data'
import { utcDate, utcTime } from '../lib/format'
import SceneDots from './SceneDots'

interface Props {
  scenes: Scene[]
  selectedId: string | null
  onSelect: (sceneId: string) => void
}

// Counts are precomputed at ingestion inside the SITE polygon (SPEC.md
// section 8): vessels at trawling speed first — the strongest opening —
// then fishing vessels, then date so the order is deterministic.
export function rankScenes(scenes: Scene[]): Scene[] {
  return [...scenes].sort(
    (a, b) =>
      b.n_trawling_in_site - a.n_trawling_in_site ||
      b.n_fishing_in_site - a.n_fishing_in_site ||
      a.acq_mid.localeCompare(b.acq_mid),
  )
}

// The list of scenes in section-8 order, one row each. In v1 (13.3) it is
// the scene stepper's dropdown rather than a permanent panel.
export default function ScenePicker({ scenes, selectedId, onSelect }: Props) {
  const rows = useMemo(() => rankScenes(scenes), [scenes])

  return (
    <section>
      <h2>Scenes</h2>
      <ul className="scene-list">
        {rows.map((scene) => {
          const active = scene.scene_id === selectedId
          return (
            <li key={scene.scene_id}>
              <button
                type="button"
                className={'scene' + (active ? ' scene--active' : '')}
                aria-pressed={active}
                onClick={() => onSelect(scene.scene_id)}
              >
                <span className="scene-when">
                  {utcDate(scene.acq_mid)}
                  <span className="scene-time">{utcTime(scene.acq_mid)}</span>
                </span>
                <span className="scene-counts">
                  {scene.n_fishing_in_site} fishing inside · {scene.n_trawling_in_site} trawling
                  <SceneDots scene={scene} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
