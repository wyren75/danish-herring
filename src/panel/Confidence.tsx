import { useMemo } from 'react'
import { computeConfidence, MIN_REFERENCE, type ConfidenceGeometry } from '../lib/confidence'
import type { GfwEvent, Scene, Snapshot } from '../lib/data'
import Tip from './Tip'

// Owner's flag (SPEC.md section 17): count GFW reference vessels inside the
// site polygon (default) or anywhere in the padded box.
export const CONFIDENCE_GEOMETRY: ConfidenceGeometry = 'site'

// What the figure measures, fixed copy (section 10).
const CONFIDENCE_TIP =
  'Agreement between two independent AIS sources — Denmark’s shore network and ' +
  'GFW’s satellite feed — not absolute truth. A low figure means apparent dark ' +
  'vessels here are likely reception gaps.'

interface Props {
  scene: Scene
  sceneSnapshots: Snapshot[]
  events: GfwEvent[]
}

// The confidence ratio (section 10): shown once per scene under the scene
// details, and repeated under every verdict.
export default function Confidence({ scene, sceneSnapshots, events }: Props) {
  const c = useMemo(
    () => computeConfidence(events, sceneSnapshots, scene, CONFIDENCE_GEOMETRY),
    [events, sceneSnapshots, scene],
  )

  if (c.ratio === null) {
    return (
      <div className="confidence">
        <p className="has-tip">
          AIS coverage: not measurable for this scene (fewer than {MIN_REFERENCE} GFW reference
          vessels). <Tip text={CONFIDENCE_TIP} />
        </p>
      </div>
    )
  }

  return (
    <div className="confidence">
      <p className="has-tip confidence-headline">
        AIS coverage for this scene: {Math.round(c.ratio * 100)}% <Tip text={CONFIDENCE_TIP} />
      </p>
      <p className="muted">
        {c.found} of {c.reference} vessels that Global Fishing Watch recorded as fishing here at
        this moment appear in the Danish AIS record.
      </p>
    </div>
  )
}
