interface Props {
  showRadar: boolean
  onShowRadar: (on: boolean) => void
}

// Layer toggles (SPEC.md section 7 table). Only the radar exists yet; S2,
// AIS and GFW arrive with their milestones.
export default function Layers({ showRadar, onShowRadar }: Props) {
  return (
    <section className="layers">
      <h2>Layers</h2>
      <label className="layer-toggle">
        <input
          type="checkbox"
          checked={showRadar}
          onChange={(e) => onShowRadar(e.target.checked)}
        />
        Radar S1
      </label>
    </section>
  )
}
