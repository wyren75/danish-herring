interface Props {
  showRadar: boolean
  onShowRadar: (on: boolean) => void
  showAis: boolean
  onShowAis: (on: boolean) => void
  onReveal: () => void
}

// Layer toggles (SPEC.md section 7 table). S2 and GFW arrive with their
// milestones. AIS is off by default and "Reveal all" is deliberately
// discreet (open question 19.3): the user should try a blind click first.
export default function Layers({ showRadar, onShowRadar, showAis, onShowAis, onReveal }: Props) {
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
      <label className="layer-toggle">
        <input type="checkbox" checked={showAis} onChange={(e) => onShowAis(e.target.checked)} />
        AIS vessels
      </label>
      <button type="button" className="reveal" onClick={onReveal} disabled={showAis}>
        Reveal all
      </button>
    </section>
  )
}
