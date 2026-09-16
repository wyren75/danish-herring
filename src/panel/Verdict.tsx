import { useState, type ReactNode } from 'react'
import type { GfwEvent, Scene, Snapshot, Vessel } from '../lib/data'
import { duration, kilometres, latLon, metres, utcTime, utcTimeSeconds } from '../lib/format'
import { midFlag } from '../lib/geo'
import { AROUND_PASS_H, history, relateEvent } from '../lib/gfw'
import type { Verdict } from '../lib/verdict'
import Tip from './Tip'

interface Props {
  scene: Scene
  events: GfwEvent[]
  // The matched vessel's GFW events around the pass (10.2) — the same set the
  // map draws whether or not the layer is on (10.3).
  matchedEvents: GfwEvent[]
  verdict: Verdict | null
  vessels: Map<string, Vessel>
  // The radius slider (13.5, item 4): after the verdict and GFW lines, before
  // the "no contact" block.
  children?: ReactNode
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

// The offset tooltip (SPEC.md 9.4), fixed copy.
const OFFSET_TIP =
  'A moving vessel appears displaced along the satellite’s flight direction in ' +
  'radar imagery — often by 100–300 m at fishing speeds, more for faster ships. ' +
  'An offset of a few hundred metres between the radar return and the AIS position ' +
  'is expected, not an error.'

// The verdict panel (SPEC.md sections 9.2 and 9.3). A live region so a
// screen reader hears the answer to each click (section 14).
export default function VerdictPanel({
  scene,
  events,
  matchedEvents,
  verdict,
  vessels,
  children,
}: Props) {
  // The explanatory block is open the first time and remembers being closed.
  const [explainOpen, setExplainOpen] = useState(true)
  const at = utcTimeSeconds(scene.acq_mid)

  return (
    <section className="verdict" aria-live="polite">
      {!verdict ? (
        <p className="muted">Click a bright return on the radar to look it up in the AIS record.</p>
      ) : verdict.matched && verdict.nearest ? (
        <Matched
          nearest={verdict.nearest}
          verdict={verdict}
          scene={scene}
          vessels={vessels}
          events={events}
          matchedEvents={matchedEvents}
        >
          {children}
        </Matched>
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
          {children}
          <details
            className="explain"
            open={explainOpen}
            onToggle={(e) => setExplainOpen(e.currentTarget.open)}
          >
            <summary>What "no contact" means</summary>
            <p>
              A radar return with no AIS contact means one of three things: the vessel was
              not broadcasting; it was broadcasting and the shore network did not receive
              it; or what you clicked is not a vessel. This tool cannot tell which. The AIS
              here is the Danish Maritime Authority's official shore network; a missing
              contact most likely means the vessel was not broadcasting, or what you
              clicked is not a vessel.
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
  scene,
  vessels,
  events,
  matchedEvents,
  children,
}: {
  nearest: NonNullable<Verdict['nearest']>
  verdict: Verdict
  scene: Scene
  vessels: Map<string, Vessel>
  events: GfwEvent[]
  matchedEvents: GfwEvent[]
  children?: ReactNode
}) {
  const s = nearest.snapshot
  const v = vessels.get(s.mmsi)
  const at = utcTimeSeconds(scene.acq_mid)
  return (
    <>
      <p className="verdict-headline">{v?.name || '(no name broadcast)'}</p>
      <p>
        {shipType(v)} · {midFlag(s.mmsi)} · {dims(v)}
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
      <p className="has-tip">
        Offset from your click: {metres(nearest.distanceM)} <Tip text={OFFSET_TIP} />
      </p>
      <InSite verdict={verdict} />
      <GfwSection snapshot={s} scene={scene} around={matchedEvents} events={events} />
      {children}
    </>
  )
}

// What GFW is and what its rectangles mean, fixed copy (13.8).
const GFW_TIP =
  'Global Fishing Watch classifies fishing from its own satellite AIS and publishes ' +
  'each episode as an event with a start, an end, and the rectangle the vessel stayed ' +
  'inside. The dashed rectangles on the map are those areas — not tracks, which GFW ' +
  'does not publish. GFW sees fewer vessels than the Danish shore network and only ' +
  'counts sustained, recognised fishing behaviour.'

// What GFW says the matched vessel did (10.2), as a titled section with three
// fixed labels (13.8): at the pass, around the pass, history. Each line is a
// fact or a plain "none".
function GfwSection({
  snapshot,
  scene,
  around,
  events,
}: {
  snapshot: Snapshot
  scene: Scene
  around: GfwEvent[]
  events: GfwEvent[]
}) {
  const related = around.map((e) => relateEvent(e, snapshot, scene))
  const current = related.find((r) => r.inProgress)
  const others = related.filter((r) => !r.inProgress)
  const h = history(events, snapshot.mmsi)
  return (
    <section className="gfw-section">
      <h3 className="has-tip">
        Global Fishing Watch <Tip text={GFW_TIP} />
      </h3>
      <dl className="gfw-lines">
        <dt>At the pass</dt>
        <dd>
          {current
            ? `Fishing event in progress since ${utcTime(current.event.start)} (${duration(current.elapsedMs)})`
            : 'No fishing event in progress'}
        </dd>
        <dt>Around the pass</dt>
        <dd>
          {others.length
            ? others.map((r) => (
                <span key={r.event.event_id}>
                  Fished {utcTime(r.event.start).replace(' UTC', '')} → {utcTime(r.event.end)},{' '}
                  {kilometres(r.distanceM)} {r.compass}
                </span>
              ))
            : `None within ${AROUND_PASS_H} h`}
        </dd>
        <dt>History</dt>
        <dd>
          {h.total
            ? `${h.total} fishing ${h.total === 1 ? 'event' : 'events'} in ${h.spanMonths} months · ${h.insideSite} inside the site`
            : `None in ${h.spanMonths} months`}
        </dd>
      </dl>
    </section>
  )
}

const InSite = ({ verdict }: { verdict: Verdict }) => (
  <p>Inside Natura 2000 site: {verdict.inSite ? 'yes' : 'no'}</p>
)
