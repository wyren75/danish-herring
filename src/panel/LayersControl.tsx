import type { ComponentProps } from 'react'
import Layers from './Layers'
import type { Control } from './MapControls'

// Three offset rhombi, the layers glyph every map product uses.
const layersGlyph = (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 3 L17 6.5 L10 10 L3 6.5 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M3 10 L10 13.5 L17 10" />
      <path d="M3 13.5 L10 17 L17 13.5" />
    </g>
  </svg>
)

// The Layers control (13.8): the stacked-squares "layers" glyph; expanded,
// the Layers section as it was — toggles and Reveal all, nothing more. The
// legend is its own control (13.9).
export const layersControl = (props: ComponentProps<typeof Layers>): Control => ({
  name: 'Layers',
  storageKey: 'layers-open',
  glyph: layersGlyph,
  children: <Layers {...props} />,
})
