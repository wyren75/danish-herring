import { useState, type ComponentProps } from 'react'
import Layers from './Layers'

// Collapsed by default; remembered for the browser session (13.4).
const KEY = 'layers-open'
const remembered = () => {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const remember = (open: boolean) => {
  try {
    sessionStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // Storage blocked: the card still works, it just forgets.
  }
}

// The Layers control (13.8): map furniture on the map, top-left. Collapsed
// it is a 36 px icon button — the stacked-squares "layers" glyph — with the
// tooltip "Layers". Expanded, the 220 px card opens to the right of the
// icon: the Layers section as it was, legend included, nothing more.
export default function LayersCard(props: ComponentProps<typeof Layers>) {
  const [open, setOpen] = useState(remembered)
  return (
    <details
      className="layers-card"
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        remember(e.currentTarget.open)
      }}
    >
      <summary className="layers-icon" title="Layers" aria-label="Layers">
        <LayersGlyph />
      </summary>
      <div className="layers-panel">
        <h2>Layers</h2>
        <Layers {...props} />
      </div>
    </details>
  )
}

// Three offset rhombi, the layers glyph every map product uses.
const LayersGlyph = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 3 L17 6.5 L10 10 L3 6.5 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M3 10 L10 13.5 L17 10" />
      <path d="M3 13.5 L10 17 L17 13.5" />
    </g>
  </svg>
)
