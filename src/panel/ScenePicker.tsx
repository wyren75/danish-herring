import { useMemo } from 'react'
import { isFishing, type Scene, type Snapshot, type Vessel } from '../lib/data'
import { pointInPolygon, type SiteGeometry } from '../lib/geo'
import { utcDate, utcTime, utcTimeSeconds } from '../lib/format'

interface SceneRow {
  scene: Scene
  nVessels: number // snapshots inside the site polygon
  nFishing: number // ...of which ship_type = Fishing
}

interface Props {
  scenes: Scene[]
  snapshots: Snapshot[]
  vessels: Map<string, Vessel>
  site: SiteGeometry
  selectedId: string | null
  onSelect: (sceneId: string) => void
}

// Counts use the SITE polygon, not the box: the box holds Frederikshavn
// harbour and would make every scene look equally busy (SPEC.md section 8).
export function rankScenes(
  scenes: Scene[],
  snapshots: Snapshot[],
  vessels: Map<string, Vessel>,
  site: SiteGeometry,
): SceneRow[] {
  const rows = new Map<string, SceneRow>(
    scenes.map((scene) => [scene.scene_id, { scene, nVessels: 0, nFishing: 0 }]),
  )
  for (const s of snapshots) {
    const row = rows.get(s.scene_id)
    if (!row || !pointInPolygon(s.lon, s.lat, site)) continue
    row.nVessels++
    if (isFishing(vessels.get(s.mmsi))) row.nFishing++
  }
  // Busiest first; ties broken by date so the order is deterministic.
  return [...rows.values()].sort(
    (a, b) => b.nFishing - a.nFishing || a.scene.acq_mid.localeCompare(b.scene.acq_mid),
  )
}

// One dot per ~4 fishing vessels, up to four.
const dots = (n: number) => '●'.repeat(Math.min(4, Math.ceil(n / 4)))

export default function ScenePicker({
  scenes,
  snapshots,
  vessels,
  site,
  selectedId,
  onSelect,
}: Props) {
  const rows = useMemo(
    () => rankScenes(scenes, snapshots, vessels, site),
    [scenes, snapshots, vessels, site],
  )
  const selected = rows.find((r) => r.scene.scene_id === selectedId)?.scene

  return (
    <section>
      <h2>Scenes</h2>
      <ul className="scene-list">
        {rows.map(({ scene, nVessels, nFishing }) => {
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
                  {nVessels} vessels · {nFishing} fishing
                  <span className="scene-dots" aria-hidden="true">
                    {dots(nFishing)}
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
        </div>
      )}
    </section>
  )
}
