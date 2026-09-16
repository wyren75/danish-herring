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

// The Layers card (13.4): map furniture on the map, top-right under the
// zoom control. Collapsed it is one word; expanded it is the Layers section
// as it was, legend included, nothing more.
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
      <summary>
        Layers <span aria-hidden="true">▾</span>
      </summary>
      <Layers {...props} />
    </details>
  )
}
