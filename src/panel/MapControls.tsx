import { useState, type ReactNode } from 'react'

export interface Control {
  // Tooltip, accessible name and card heading — "Layers" or "Legend".
  name: string
  storageKey: string
  glyph: ReactNode
  children: ReactNode
}

// Which card is open is remembered for the browser session (13.4, 13.9);
// nothing open by default.
const OPEN_KEY = 'map-control-open'
const remembered = (controls: Control[]) => {
  try {
    const i = controls.findIndex((c) => c.storageKey === sessionStorage.getItem(OPEN_KEY))
    return i === -1 ? null : i
  } catch {
    return null
  }
}
const remember = (key: string | null) => {
  try {
    if (key === null) sessionStorage.removeItem(OPEN_KEY)
    else sessionStorage.setItem(OPEN_KEY, key)
  } catch {
    // Storage blocked: the card still works, it just forgets.
  }
}

// Height of one icon plus the gap beneath it, so a card can line up with
// its own icon. Matches .control-icon and .control-icons in index.css.
const ICON_PITCH = 42

interface Props {
  controls: Control[]
}

// Map furniture (13.8, 13.9, 13.11): a column of 36 px icon buttons
// top-left of the map. Collapsed, a control is its icon only, with a
// tooltip. Expanded, its 220 px card opens to the right, level with its
// icon. Only one card is open at a time: clicking another icon closes the
// open card and opens that one; clicking the open card's icon closes it.
export default function MapControls({ controls }: Props) {
  const [open, setOpen] = useState<number | null>(() => remembered(controls))
  const toggle = (i: number) => {
    const next = open === i ? null : i
    setOpen(next)
    remember(next === null ? null : controls[next].storageKey)
  }
  const current = open === null ? null : controls[open]
  return (
    <div className="map-controls">
      <div className="control-icons">
        {controls.map((c, i) => (
          <button
            key={c.name}
            type="button"
            className={'control-icon' + (open === i ? ' control-icon--open' : '')}
            title={c.name}
            aria-label={c.name}
            aria-expanded={open === i}
            aria-controls={`control-${c.storageKey}`}
            onClick={() => toggle(i)}
          >
            {c.glyph}
          </button>
        ))}
      </div>
      {current && open !== null && (
        <section
          id={`control-${current.storageKey}`}
          className="control-panel"
          style={{ marginTop: open * ICON_PITCH }}
        >
          <h2>{current.name}</h2>
          {current.children}
        </section>
      )}
    </div>
  )
}
