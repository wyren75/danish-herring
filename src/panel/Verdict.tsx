import { useState } from 'react'
import type { Scene, Snapshot, Vessel } from '../lib/data'
import { latLon, metres, utcTimeSeconds } from '../lib/format'
import type { Verdict } from '../lib/verdict'

interface Props {
  scene: Scene
  verdict: Verdict | null
  vessels: Map<string, Vessel>
}

const dash = '—'
const shipType = (v: Vessel | undefined) => v?.ship_type || 'Unknown type'
// "fishing", but "SAR" and "HSC" stay as they are.
const shipTypeLower = (v: Vessel | undefined) => {
  const t = shipType(v)
  return t === t.toUpperCase() ? t : t.toLowerCase()
}
const dims = (v: Vessel | undefined) =>
  v?.length_m != null ? `${v.length_m} m × ${v.width_m ?? dash} m` : `${dash} m`

// "interpolated (AIS 41 s before, 18 s after)" or "nearest (AIS 881 s before)".
function method(s: Snapshot): string {
  const parts = []
  if (s.dt_before_s != null) parts.push(`${s.dt_before_s} s before`)
  if (s.dt_after_s != null) parts.push(`${s.dt_after_s} s after`)
  return parts.length ? `${s.method} (AIS ${parts.join(', ')})` : s.method
}

// The verdict panel (SPEC.md sections 9.2 and 9.3). A live region so a
// screen reader hears the answer to each click (section 14).
export default function VerdictPanel({ scene, verdict, vessels }: Props) {
  // The explanatory block is open the first time and remembers being closed.
  const [explainOpen, setExplainOpen] = useState(true)
  const at = utcTimeSeconds(scene.acq_mid)

  return (
    <section className="verdict" aria-live="polite">
      <h2>Verdict</h2>
      {!verdict ? (
        <p className="muted">Click a bright return on the radar to look it up in the AIS record.</p>
      ) : verdict.matched && verdict.nearest ? (
        <Matched nearest={verdict.nearest} verdict={verdict} at={at} vessels={vessels} />
      ) : (
        <>
          <p className="verdict-headline">No AIS contact within {metres(verdict.radiusM)}</p>
          <p className="muted">
            at {at}, {latLon(verdict.click[1], verdict.click[0])}
          </p>
          <InSite verdict={verdict} />
          <p>
            {verdict.nearest ? (
              <>
                Nearest AIS vessel: {metres(verdict.nearest.distanceM)} away (
                {vessels.get(verdict.nearest.snapshot.mmsi)?.name || 'no name broadcast'},{' '}
                {shipTypeLower(vessels.get(verdict.nearest.snapshot.mmsi))})
              </>
            ) : (
              'No AIS vessel in the data for this scene.'
            )}
          </p>
          <details
            className="explain"
            open={explainOpen}
            onToggle={(e) => setExplainOpen(e.currentTarget.open)}
          >
            <summary>What "no contact" means</summary>
            <p>
              A radar return with no AIS contact means one of three things: the vessel was
              not broadcasting; it was broadcasting and the shore network did not receive
              it; or what you clicked is not a vessel. This tool cannot tell which. The
              confidence figure below estimates how often the second case occurs.
            </p>
          </details>
        </>
      )}
    </section>
  )
}

function Matched({
  nearest,
  verdict,
  at,
  vessels,
}: {
  nearest: NonNullable<Verdict['nearest']>
  verdict: Verdict
  at: string
  vessels: Map<string, Vessel>
}) {
  const s = nearest.snapshot
  const v = vessels.get(s.mmsi)
  // Flag from the MMSI's Maritime Identification Digits arrives with M5.
  return (
    <>
      <p className="verdict-headline">{v?.name || '(no name broadcast)'}</p>
      <p>
        {shipType(v)} · {dims(v)}
      </p>
      <p className="muted mono">
        MMSI {s.mmsi} · IMO {v?.imo || dash} · call {v?.callsign || dash}
      </p>
      <p className="verdict-at">At {at}</p>
      <dl className="verdict-facts">
        <dt>position</dt>
        <dd>{latLon(s.lat, s.lon)}</dd>
        <dt>speed</dt>
        <dd>
          {s.sog != null ? `${s.sog.toFixed(1)} kn` : dash}
          {'   '}course {s.cog != null ? `${Math.round(s.cog)}°` : dash}
        </dd>
        <dt>method</dt>
        <dd>{method(s)}</dd>
      </dl>
      <p>Offset from your click: {metres(nearest.distanceM)}</p>
      <InSite verdict={verdict} />
    </>
  )
}

const InSite = ({ verdict }: { verdict: Verdict }) => (
  <p>Inside Natura 2000 site: {verdict.inSite ? 'yes' : 'no'}</p>
)
