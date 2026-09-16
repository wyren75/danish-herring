import { RADIUS_RANGE_M } from '../lib/verdict'

interface Props {
  radiusM: number
  onChange: (radiusM: number) => void
}

// Matching radius, 200–1500 m (SPEC.md section 9.1). Dragging it and
// watching a verdict flip is the point; it never clears the click. Sits in
// the inspector because it only modifies this verdict (13.5).
export default function Radius({ radiusM, onChange }: Props) {
  return (
    <section className="radius">
      <h2>
        <label htmlFor="radius">matching radius</label>
      </h2>
      <div className="radius-row">
        <input
          id="radius"
          type="range"
          min={RADIUS_RANGE_M.min}
          max={RADIUS_RANGE_M.max}
          step={10}
          value={radiusM}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output htmlFor="radius" className="radius-value">
          {radiusM} m
        </output>
      </div>
    </section>
  )
}
