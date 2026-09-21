import type { Scene } from '../lib/data'
import { s2PassLabel, s2Reason, type S2Pick } from '../lib/s2'
import Tip from './Tip'

interface Props {
  showRadar: boolean
  onShowRadar: (on: boolean) => void
  // Layer 2 (section 7): enabled only when a clear Sentinel-2 pass lies
  // within a day of the scene; otherwise disabled, with the reason.
  scene: Scene | null
  s2: S2Pick
  showS2: boolean
  onShowS2: (on: boolean) => void
  showAis: boolean
  onShowAis: (on: boolean) => void
  showGfw: boolean
  onShowGfw: (on: boolean) => void
}

// Layer toggles (SPEC.md section 7 table). Radar and optical are mutually
// exclusive — one imagery layer at a time; App owns that rule. AIS is off by
// default: the user should try a blind click first. GFW is context, also off.
// Lives in the floating Layers card on the map (13.4), which carries the
// heading.
export default function Layers({
  showRadar,
  onShowRadar,
  scene,
  s2,
  showS2,
  onShowS2,
  showAis,
  onShowAis,
  showGfw,
  onShowGfw,
}: Props) {
  return (
    <section className="layers">
      <label className="layer-toggle">
        <input
          type="checkbox"
          checked={showRadar}
          onChange={(e) => onShowRadar(e.target.checked)}
        />
        Radar Sentinel-1
      </label>
      <div className="layer-row has-tip">
        <label className="layer-toggle" title={s2.pass ? undefined : s2Reason(s2)}>
          <input
            type="checkbox"
            checked={showS2 && !!s2.pass}
            disabled={!s2.pass}
            onChange={(e) => onShowS2(e.target.checked)}
          />
          Optical Sentinel-2
        </label>
        {!s2.pass && <Tip text={s2Reason(s2)} />}
      </div>
      {s2.pass && scene && <p className="layer-note">{s2PassLabel(s2.pass, scene)}</p>}
      <label className="layer-toggle">
        <input type="checkbox" checked={showAis} onChange={(e) => onShowAis(e.target.checked)} />
        AIS fishing vessels
      </label>
      <label className="layer-toggle">
        <input type="checkbox" checked={showGfw} onChange={(e) => onShowGfw(e.target.checked)} />
        GFW fishing events
      </label>
    </section>
  )
}
