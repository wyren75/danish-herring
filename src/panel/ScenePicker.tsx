import { useMemo, type ReactNode } from 'react'
import type { Scene } from '../lib/data'
import { utcDate, utcTime, utcTimeSeconds } from '../lib/format'

interface Props {
  scenes: Scene[]
  selectedId: string | null
  onSelect: (sceneId: string) => void
  // Rendered under the selected scene's details: the confidence ratio,
  // shown once per scene (section 10).
  children?: ReactNode
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

// Activity glyph, up to four dots. Trawlers are counted twice — they are
// fishing vessels that are also working — which reproduces the spec's
// examples (6·4 → ●●●●, 5·4 → ●●●●, 7·0 → ●●●).
const dots = (scene: Scene) =>
  '●'.repeat(
    Math.min(4, Math.round((scene.n_fishing_in_site + scene.n_trawling_in_site) / 2.5)),
  )

export default function ScenePicker({ scenes, selectedId, onSelect, children }: Props) {
  const rows = useMemo(() => rankScenes(scenes), [scenes])
  const selected = rows.find((s) => s.scene_id === selectedId)

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
                  <span className="scene-dots" aria-hidden="true">
                    {dots(scene)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected && (
        <div className="scene-detail">
          <code className="scene-product">{selected.product_name}</code>
          <p className="muted">
            Radar acquired at {utcTimeSeconds(selected.acq_mid)}. AIS interpolated to this
            second.
          </p>
          {children}
        </div>
      )}
    </section>
  )
}
