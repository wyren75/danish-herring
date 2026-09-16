import { useMemo } from 'react'
import type { GfwEvent, Scene, Snapshot, Vessel } from '../lib/data'
import type { SiteGeometry } from '../lib/geo'
import { sceneCounts } from '../lib/gfw'
import Tip from './Tip'

// What the two figures are, fixed copy (section 10.1).
const COUNTS_TIP =
  'Two independent records of the same moment. The Danish figure is every fishing ' +
  'vessel broadcasting AIS inside the boundary, received by shore stations. The GFW ' +
  'figure is how many of those were, at that second, inside a fishing event that ' +
  'Global Fishing Watch’s classifier recognised from its satellite AIS. GFW sees ' +
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
// Shown once, on the top bar's second row, as one line (13.3). Zero is a
// result, not an error.
export default function SceneCounts({ scene, sceneSnapshots, vessels, events, site }: Props) {
  const c = useMemo(
    () => sceneCounts(scene, sceneSnapshots, vessels, events, site),
    [scene, sceneSnapshots, vessels, events, site],
  )
  return (
    <span className="counts has-tip">
      in site: Danish AIS {c.danish} fishing · GFW {c.gfw} in event <Tip text={COUNTS_TIP} />
    </span>
  )
}
