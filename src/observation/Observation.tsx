import { useId, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SatellitePass } from '../lib/data'
import { utcDate } from '../lib/format'
import type { SiteGeometry } from '../lib/geo'
import { CLEAR_CLOUD_PCT } from '../lib/s2'
import Inset from './Inset'
import Timeline from './Timeline'
import {
  clearS2,
  gapStats,
  MAX_TRIP_DAYS,
  passesInYear,
  passTimes,
  unseenByTripLength,
  yearWindow,
  type GapStats,
} from './unseen'

// The two sites, one column each (11.1). Pass statistics are over each
// site's catalogue box — a pass either covers the area or it does not (3.1).
const SITES = [
  {
    code: 'DK00FX113',
    name: 'Hirsholmene',
    kind: 'Natura 2000 site DK00FX113',
    description:
      'Kattegat, Denmark. 95 km² of protected sea and islands, 12 km off Frederikshavn. AIS is received by shore stations.',
    colour: 'var(--accent)',
  },
  {
    code: 'BIJAGOS',
    name: 'Bijagós Archipelago',
    kind: 'UNESCO World Heritage site',
    description:
      'Guinea-Bissau. Passes are counted over a core of about 22 km around Bubaque — the same size of target as Hirsholmene. No AIS receiver within 400 km.',
    colour: 'var(--blue)',
  },
] as const

type SiteCode = (typeof SITES)[number]['code']

// Fixed copy (11.3).
const CLOSING =
  'In the Kattegat, a vessel cannot work unseen: radar passes almost daily, AIS is ' +
  'received by shore stations, and trawling inside the protected area continues — ' +
  'legally. Observation is not the constraint; enforcement is. In the Bijagós, a ' +
  'UNESCO World Heritage site, radar passes every four to seven days and no AIS ' +
  'receiver exists within 400 km. Observation itself is the gap. Two protected ' +
  'sites, two different failures — and only one of them is a problem that better ' +
  'sensors can fix.'

/** "1.7 days", or hours under a day: "13 h". */
function days(d: number): string {
  if (!Number.isFinite(d)) return '—'
  return d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1)} days`
}

/** "9%", "66%", "<1%" for a small non-zero, "0%" for none. */
function percent(p: number): string {
  const v = p * 100
  return v > 0 && v < 0.5 ? '<1%' : `${Math.round(v)}%`
}

interface Props {
  passes: SatellitePass[]
  geometries: Record<SiteCode, SiteGeometry>
}

interface SiteStats {
  s1: SatellitePass[]
  s2Clear: SatellitePass[]
  stats: GapStats
  unseen: number[]
}

export default function Observation({ passes, geometries }: Props) {
  // Slider default is the spec's own test case (M8: "slider at N=4").
  const [tripDays, setTripDays] = useState(4)
  const sliderId = useId()

  const year = useMemo(() => yearWindow(passes), [passes])

  // Everything for both sites, for all ten N, computed once (11.2).
  const bySite = useMemo(() => {
    const out = {} as Record<SiteCode, SiteStats>
    for (const site of SITES) {
      const s1 = passesInYear(passes, site.code, 'S1', year)
      const times = passTimes(s1)
      out[site.code] = {
        s1,
        s2Clear: clearS2(passesInYear(passes, site.code, 'S2', year)),
        stats: gapStats(times),
        unseen: unseenByTripLength(times, year),
      }
    }
    return out
  }, [passes, year])

  const chartData = useMemo(
    () =>
      Array.from({ length: MAX_TRIP_DAYS }, (_, i) => ({
        n: i + 1,
        DK00FX113: bySite.DK00FX113.unseen[i] * 100,
        BIJAGOS: bySite.BIJAGOS.unseen[i] * 100,
      })),
    [bySite],
  )

  const yearLabel = `${utcDate(new Date(year.start).toISOString())} – ${utcDate(new Date(year.end).toISOString())}`

  return (
    <section className="observation" aria-label="Observation">
      <div className="obs-columns">
        {SITES.map((site) => {
          const s = bySite[site.code]
          return (
            <article className="obs-site" key={site.code}>
              <header className="obs-site-head">
                <Inset geometry={geometries[site.code]} label={`${site.name} outline`} />
                <div>
                  <h2 className="obs-site-name">
                    <span className="obs-swatch" style={{ background: site.colour }} aria-hidden="true" />
                    {site.name}
                  </h2>
                  <p className="obs-site-kind">{site.kind}</p>
                  <p className="obs-site-desc">{site.description}</p>
                </div>
              </header>

              <h3 className="obs-h3">Sentinel-1 radar · trailing 365 days</h3>
              <dl className="obs-numbers">
                <div>
                  <dt>passes</dt>
                  <dd>{s.stats.passes}</dd>
                </div>
                <div>
                  <dt>average interval</dt>
                  <dd>{days(s.stats.meanIntervalDays)}</dd>
                </div>
                <div>
                  <dt>median gap</dt>
                  <dd>{days(s.stats.medianGapDays)}</dd>
                </div>
                <div>
                  <dt>longest gap</dt>
                  <dd>{days(s.stats.longestGapDays)}</dd>
                </div>
              </dl>

              <Timeline s1={s.s1} s2={s.s2Clear} year={year} />
              <p className="obs-legend">
                <span className="obs-key obs-key--s1" /> Sentinel-1 radar ({s.s1.length})
                <span className="obs-key obs-key--s2" /> Sentinel-2, under {CLEAR_CLOUD_PCT}% cloud ({s.s2Clear.length})
              </p>
            </article>
          )
        })}
      </div>

      <div className="obs-trip">
        <h2 className="obs-h2">How long can a fishing trip stay unseen?</h2>
        <p className="obs-muted">
          Of every {tripDays}-day window in the year ({yearLabel}, starting on each hour), the share with
          no Sentinel-1 pass over the site.
        </p>
        <div className="obs-slider">
          <label htmlFor={sliderId}>A fishing trip of</label>
          <input
            id={sliderId}
            type="range"
            min={1}
            max={MAX_TRIP_DAYS}
            step={1}
            value={tripDays}
            onChange={(e) => setTripDays(Number(e.target.value))}
          />
          <output htmlFor={sliderId} className="obs-slider-value">
            {tripDays} {tripDays === 1 ? 'day' : 'days'}
          </output>
        </div>

        <div className="obs-results" aria-live="polite">
          {SITES.map((site) => (
            <div className="obs-result" key={site.code}>
              <span className="obs-result-value" style={{ color: site.colour }}>
                {percent(bySite[site.code].unseen[tripDays - 1])}
              </span>
              <span className="obs-result-label">
                of {tripDays}-day trips unseen
                <br />
                {site.name}
              </span>
            </div>
          ))}
        </div>

        <div className="obs-chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="n"
                type="number"
                domain={[1, MAX_TRIP_DAYS]}
                ticks={chartData.map((d) => d.n)}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                label={{ value: 'trip length, days', position: 'insideBottomRight', offset: -2, fill: 'var(--muted)', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
                content={<ChartTip />}
                isAnimationActive={false}
              />
              <ReferenceLine x={tripDays} stroke="var(--text)" strokeDasharray="4 3" />
              {SITES.map((site) => (
                <Line
                  key={site.code}
                  type="monotone"
                  dataKey={site.code}
                  name={site.name}
                  stroke={site.colour}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="obs-copy">{CLOSING}</p>
      </div>
    </section>
  )
}

interface TipPayload {
  name?: string
  value?: number
  color?: string
}

// The chart's hover reading, in the panel's colours.
function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="obs-chart-tip">
      <p>
        {label}-day trip
      </p>
      {payload.map((row) => (
        <p key={row.name}>
          <span className="obs-swatch" style={{ background: row.color }} aria-hidden="true" />
          {row.name}: {percent((row.value ?? 0) / 100)} unseen
        </p>
      ))}
    </div>
  )
}
