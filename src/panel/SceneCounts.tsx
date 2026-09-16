import { useMemo } from 'react'
import type { GfwEvent, Scene, Snapshot, Vessel } from '../lib/data'
import { utcTimeSeconds } from '../lib/format'
import type { SiteGeometry } from '../lib/geo'
import { sceneCounts } from '../lib/gfw'
import Tip from './Tip'

// What the two figures are, fixed copy (section 10.1), split across the two
// (i)s that sit on the words "Danish AIS" and "GFW" (13.8).
const DANISH_TIP =
  'Two independent records of the same moment. The Danish figure is every fishing ' +
  'vessel broadcasting AIS inside the boundary at that second, received by shore ' +
  'stations.'
const GFW_TIP =
  'The GFW figure is how many of those were, at that second, inside a fishing event ' +
  'that Global Fishing Watch’s classifier recognised from its satellite AIS. GFW sees ' +
  'fewer because it counts only sustained, recognised fishing behaviour, from a ' +
  'sparser feed.'

interface Props {
  scene: Scene
  sceneSnapshots: Snapshot[]
  vessels: Map<string, Vessel>
  events: GfwEvent[]
  site: SiteGeometry
}

// Two independent counts at the instant, inside the site — no ratio (10.1).
// The top bar's second row, as one readable sentence with the numbers
// prominent (13.8). Zero is a result, not an error.
export default function SceneCounts({ scene, sceneSnapshots, vessels, events, site }: Props) {
  const c = useMemo(
    () => sceneCounts(scene, sceneSnapshots, vessels, events, site),
    [scene, sceneSnapshots, vessels, events, site],
  )
  return (
    <span className="counts">
      Radar {utcTimeSeconds(scene.acq_mid)}
      <span className="topbar-sep">·</span>
      inside the site:{' '}
      <strong className="count">
        {c.danish} fishing {c.danish === 1 ? 'vessel' : 'vessels'}
      </strong>{' '}
      <span className="has-tip">
        (Danish AIS <Tip text={DANISH_TIP} />)
      </span>
      <span className="topbar-sep">·</span>
      <strong className="count">{c.gfw}</strong> in a fishing event{' '}
      <span className="has-tip">
        (GFW <Tip text={GFW_TIP} />)
      </span>
    </span>
  )
}
