import { useEffect, useMemo, useRef, useState } from 'react'
import type { Scene } from '../lib/data'
import { utcDate, utcTime } from '../lib/format'
import ScenePicker, { rankScenes } from './ScenePicker'
import SceneDots from './SceneDots'
import TrawlingCount from './TrawlingCount'

interface Props {
  scenes: Scene[]
  selectedId: string | null
  onSelect: (sceneId: string) => void
}

// Keys must not step scenes while the user is typing or dragging a slider.
const inField = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, select, textarea, [contenteditable]')

// The scene stepper (13.3): ◀, the current scene in the section-8 row
// format, ▶. The text is a button that drops the full ScenePicker list
// down; ← / → step through the same order. The user chooses once. Its
// tooltip is the product name — the exact image's identifier (13.8).
export default function SceneStepper({ scenes, selectedId, onSelect }: Props) {
  const rows = useMemo(() => rankScenes(scenes), [scenes])
  const index = rows.findIndex((s) => s.scene_id === selectedId)
  const scene = index >= 0 ? rows[index] : null
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const step = (by: number) => {
    const next = rows[index + by]
    if (next) onSelect(next.scene_id)
  }

  // ← / → anywhere on the page, except inside a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || inField(e.target)) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // The dropdown closes on Esc, on a click outside, and on a choice. Esc is
  // caught before it reaches the inspector's own Esc handler.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="stepper" ref={root}>
      <button
        type="button"
        className="stepper-arrow"
        aria-label="Previous scene"
        disabled={index <= 0}
        onClick={() => step(-1)}
      >
        ◀
      </button>
      <button
        type="button"
        className="stepper-scene"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!scene}
        title={scene?.product_name}
        onClick={() => setOpen((o) => !o)}
      >
        {scene ? (
          <>
            {utcDate(scene.acq_mid)} · {utcTime(scene.acq_mid)} · {scene.n_fishing_in_site}{' '}
            fishing · <TrawlingCount n={scene.n_trawling_in_site} />{' '}
            <SceneDots scene={scene} />
          </>
        ) : (
          <span className="muted">Loading scenes…</span>
        )}
        <span className="stepper-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <button
        type="button"
        className="stepper-arrow"
        aria-label="Next scene"
        disabled={index < 0 || index >= rows.length - 1}
        onClick={() => step(1)}
      >
        ▶
      </button>
      {open && (
        <div className="stepper-menu">
          <ScenePicker
            scenes={scenes}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelect(id)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
