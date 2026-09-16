import { useEffect, type ComponentProps } from 'react'
import Radius from './Radius'
import VerdictPanel from './Verdict'

interface Props extends Omit<ComponentProps<typeof VerdictPanel>, 'children'> {
  open: boolean
  radiusM: number
  onRadius: (radiusM: number) => void
  onClose: () => void
}

// The inspector (13.5): the result, on the right, only when there is one.
// Slides in on the first click; ✕ and Esc clear the click and close it.
// Contents are the verdict panel, its GFW section, then the radius slider
// (which only modifies this verdict), then the "no contact" block. The
// footer names the exact image — the scene's product name (13.8).
export default function Inspector({ open, radiusM, onRadius, onClose, ...verdict }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside className={'inspector' + (open ? ' inspector--open' : '')} aria-hidden={!open}>
      <div className="inspector-head">
        <h2>Verdict</h2>
        <button
          type="button"
          className="inspector-close"
          aria-label="Close verdict"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="inspector-body">
        <VerdictPanel {...verdict}>
          <Radius radiusM={radiusM} onChange={onRadius} />
        </VerdictPanel>
      </div>
      <footer className="inspector-foot mono" title="Sentinel-1 product name">
        scene {verdict.scene.product_name}
      </footer>
    </aside>
  )
}
