import { useState, type ReactNode } from 'react'

export interface Control {
  // Tooltip, accessible name and card heading — "Layers" or "Legend".
  name: string
  storageKey: string
  glyph: ReactNode
  children: ReactNode
}

// Collapsed by default; remembered for the browser session (13.4, 13.9).
const remembered = (key: string) => {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const remember = (key: string, open: boolean) => {
  try {
    sessionStorage.setItem(key, open ? '1' : '0')
  } catch {
    // Storage blocked: the card still works, it just forgets.
  }
}

interface Props {
  controls: Control[]
}

// Map furniture (13.8, 13.9): a column of 36 px icon buttons top-left of
// the map. Collapsed, a control is its icon only, with a tooltip. Expanded,
// its 220 px card opens to the right of the icon. Controls open and close
// independently; the cards flow in one column beside the icons, so when
// two are open the second sits under the first rather than over it.
export default function MapControls({ controls }: Props) {
  const [open, setOpen] = useState<boolean[]>(() => controls.map((c) => remembered(c.storageKey)))
  const toggle = (i: number) => {
    const next = open.with(i, !open[i])
    setOpen(next)
    remember(controls[i].storageKey, next[i])
  }
  return (
    <div className="map-controls">
      <div className="control-icons">
        {controls.map((c, i) => (
          <button
            key={c.name}
            type="button"
            className={'control-icon' + (open[i] ? ' control-icon--open' : '')}
            title={c.name}
            aria-label={c.name}
            aria-expanded={open[i]}
            aria-controls={`control-${c.storageKey}`}
            onClick={() => toggle(i)}
          >
            {c.glyph}
          </button>
        ))}
      </div>
      <div className="control-panels">
        {controls.map(
          (c, i) =>
            open[i] && (
              <section
                key={c.name}
                id={`control-${c.storageKey}`}
                className="control-panel"
                style={{ marginTop: firstOpenOffset(open, i) }}
              >
                <h2>{c.name}</h2>
                {c.children}
              </section>
            ),
        )}
      </div>
    </div>
  )
}

// The first open card lines up with its own icon (36 px icon + 6 px gap
// per control above it); the ones after flow under it.
const firstOpenOffset = (open: boolean[], i: number) =>
  open.slice(0, i).some(Boolean) ? undefined : i * 42
