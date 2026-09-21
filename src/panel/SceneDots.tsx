import type { Scene } from '../lib/data'

// Activity glyph, up to four dots. Trawlers are counted twice — they are
// fishing vessels that are also working — which reproduces the spec's
// examples (6·4 → ●●●●, 5·4 → ●●●●, 7·0 → ●●●). The divisor is fitted to
// those examples, not derived; see DECISIONS.md.
const dots = (scene: Scene) =>
  '●'.repeat(Math.min(4, Math.round((scene.n_fishing_in_site + scene.n_trawling_in_site) / 2.5)))

// The glyph, in the stepper (13.3) and in every row of its dropdown.
// Nothing on screen said what the dots count, so they carry a native
// tooltip — not a fourth (i). Still aria-hidden: they summarise the two
// counts printed beside them, which a screen reader already reads.
export default function SceneDots({ scene }: { scene: Scene }) {
  return (
    <span
      className="scene-dots"
      title="Activity: fishing vessels inside the site, trawlers counted twice"
      aria-hidden="true"
    >
      {dots(scene)}
    </span>
  )
}
