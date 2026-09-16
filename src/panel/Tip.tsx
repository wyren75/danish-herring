import { useId } from 'react'

// A small (i) with a tooltip on hover or keyboard focus. Used for the offset
// note (SPEC.md 9.4) and, from M6, the confidence note (section 10).
export default function Tip({ text }: { text: string }) {
  const id = useId()
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-label="More information" aria-describedby={id}>
        i
      </button>
      <span id={id} role="tooltip" className="tip-text">
        {text}
      </span>
    </span>
  )
}
