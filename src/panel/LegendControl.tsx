import type { ReactNode } from 'react'
import { COLORS } from '../map/layers'
import type { Control } from './MapControls'

// Three short rows, each preceded by a dot — a key, not a question mark.
const keyGlyph = (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <g fill="currentColor">
      <circle cx="4.5" cy="5" r="1.6" />
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="4.5" cy="15" r="1.6" />
    </g>
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8.5 5 H16" />
      <path d="M8.5 10 H16" />
      <path d="M8.5 15 H16" />
    </g>
  </svg>
)

// Legend glyphs are inline SVG drawn to match the map markers.
const glyph = (children: ReactNode) => (
  <svg className="legend-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    {children}
  </svg>
)

// The Legend control (13.9): directly below Layers, same size and style,
// the conventional "key" glyph. Expanded: the six lines of 13.8 — a glyph
// and a label of at most four words, nothing else.
export const legendControl: Control = {
  name: 'Legend',
  storageKey: 'legend-open',
  glyph: keyGlyph,
  children: (
    <ul className="legend">
      <li>
        {glyph(<polygon points="8,3 11.5,13 4.5,13" fill={COLORS.accent} />)}
        Fishing vessel, under way
      </li>
      <li>
        {glyph(<circle cx="8" cy="8" r="3" fill={COLORS.accent} />)}
        Fishing vessel, stopped
      </li>
      <li>
        {glyph(<polygon points="8,3 11.5,13 4.5,13" fill={COLORS.other} />)}
        Other vessel
      </li>
      <li>
        {glyph(
          <circle cx="8" cy="8" r="3" fill={COLORS.accent} stroke={COLORS.white} strokeWidth="2" />,
        )}
        Inside the protected site
      </li>
      <li>
        {glyph(
          <polygon
            points="8,1 13,15 3,15"
            fill={COLORS.accent}
            stroke={COLORS.white}
            strokeWidth="2"
            strokeLinejoin="round"
          />,
        )}
        Your match
      </li>
      <li>
        {glyph(
          <>
            <rect
              x="1.5"
              y="3.5"
              width="13"
              height="9"
              fill="none"
              stroke={COLORS.accent}
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <rect x="7" y="7" width="2" height="2" fill={COLORS.accent} />
          </>,
        )}
        GFW fishing event area
      </li>
    </ul>
  ),
}
