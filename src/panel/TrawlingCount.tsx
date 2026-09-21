import { TRAWLING_TIP } from '../lib/trawling'

// "4 at trawling speed" — the scene counts in the stepper (13.3) and in
// every row of its dropdown. The phrase used to read "4 trawling", which
// stated as observed fact what is a speed band applied to a self-declared
// vessel type; the tooltip says so, in the SceneDots manner — a native
// title, not a fourth (i).
export default function TrawlingCount({ n }: { n: number }) {
  return (
    <span className="trawling" title={TRAWLING_TIP}>
      {n} at trawling speed
    </span>
  )
}
