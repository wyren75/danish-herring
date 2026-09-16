import type { ReactNode } from 'react'
import type { Scene } from '../lib/data'
import { s2PassLabel, s2Reason, type S2Pick } from '../lib/s2'
import { COLORS } from '../map/layers'
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
  onReveal: () => void
  showGfw: boolean
  onShowGfw: (on: boolean) => void
}

// Layer toggles (SPEC.md section 7 table). AIS is off by default and
// "Reveal all" is deliberately discreet (open question 19.3): the user should
// try a blind click first. GFW is context, also off.
export default function Layers({
  showRadar,
  onShowRadar,
  scene,
  s2,
  showS2,
  onShowS2,
  showAis,
  onShowAis,
  onReveal,
  showGfw,
  onShowGfw,
}: Props) {
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
      <div className="layer-row has-tip">
        <label className="layer-toggle" title={s2.pass ? undefined : s2Reason(s2)}>
          <input
            type="checkbox"
            checked={showS2 && !!s2.pass}
            disabled={!s2.pass}
            onChange={(e) => onShowS2(e.target.checked)}
          />
          Optical S2
        </label>
        {!s2.pass && <Tip text={s2Reason(s2)} />}
      </div>
      {s2.pass && scene && <p className="layer-note">{s2PassLabel(s2.pass, scene)}</p>}
      <label className="layer-toggle">
        <input type="checkbox" checked={showAis} onChange={(e) => onShowAis(e.target.checked)} />
        AIS vessels
      </label>
      <button type="button" className="reveal" onClick={onReveal} disabled={showAis}>
        Reveal all
      </button>
      <label className="layer-toggle">
        <input type="checkbox" checked={showGfw} onChange={(e) => onShowGfw(e.target.checked)} />
        GFW fishing events
      </label>
      <Legend />
    </section>
  )
}

// The Symbols legend (7.3): collapsible, closed by default, five lines and
// nothing else. Glyphs are inline SVG drawn to match the map markers.
function Legend() {
  return (
    <details className="legend">
      <summary>Symbols</summary>
      <ul>
        <li>
          <Glyph>
            <polygon points="8,3 11.5,13 4.5,13" fill={COLORS.accent} />
          </Glyph>
          orange triangle — fishing vessel under way
        </li>
        <li>
          <Glyph>
            <circle cx="8" cy="8" r="3" fill={COLORS.accent} />
          </Glyph>
          orange dot — fishing vessel stopped
        </li>
        <li>
          <Glyph>
            <polygon points="8,3 11.5,13 4.5,13" fill={COLORS.other} />
          </Glyph>
          blue — any other vessel
        </li>
        <li>
          <Glyph>
            <circle cx="8" cy="8" r="3" fill={COLORS.accent} stroke={COLORS.white} strokeWidth="2" />
          </Glyph>
          white ring — inside the protected site
        </li>
        <li>
          <Glyph>
            <polygon
              points="8,1 13,15 3,15"
              fill={COLORS.accent}
              stroke={COLORS.white}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </Glyph>
          large with white edge — your match
        </li>
      </ul>
    </details>
  )
}

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg className="legend-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    {children}
  </svg>
)
