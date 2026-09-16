import type { SatellitePass } from '../lib/data'
import { parseUtc, utcDate, utcTime } from '../lib/format'
import type { Year } from './unseen'

/** One pixel per day of the year (11.1, item 3). */
const WIDTH = 365
const S1_H = 22
const S2_H = 10
const AXIS_Y = S1_H + 4
const HEIGHT = AXIS_Y + 14

const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

interface Props {
  s1: SatellitePass[]
  /** Only clear Sentinel-2 passes; the caller has filtered on cloud. */
  s2: SatellitePass[]
  year: Year
}

// One tick per pass over the trailing year. Gaps read as empty stretches.
export default function Timeline({ s1, s2, year }: Props) {
  const x = (iso: string) => ((parseUtc(iso) - year.start) / (year.end - year.start)) * WIDTH

  // A label at the first of every month that falls inside the year.
  const months = (() => {
    const out: { x: number; label: string }[] = []
    const d = new Date(year.start)
    d.setUTCDate(1)
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCMonth(d.getUTCMonth() + 1)
    for (; d.getTime() <= year.end; d.setUTCMonth(d.getUTCMonth() + 1)) {
      out.push({ x: x(d.toISOString()), label: monthShort.format(d) })
    }
    return out
  })()

  const tick = (p: SatellitePass, h: number, cls: string) => (
    <line key={p.product_name} className={cls} x1={x(p.acq_start)} x2={x(p.acq_start)} y1={S1_H - h} y2={S1_H}>
      <title>
        {p.mission === 'S1' ? 'Sentinel-1 radar' : `Sentinel-2, ${Math.round(p.cloud_pct ?? 0)}% cloud`} ·{' '}
        {utcDate(p.acq_start)} {utcTime(p.acq_start)}
      </title>
    </line>
  )

  return (
    <svg
      className="timeline"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${s1.length} Sentinel-1 passes and ${s2.length} clear Sentinel-2 passes over the year`}
    >
      <line className="timeline-axis" x1={0} x2={WIDTH} y1={AXIS_Y} y2={AXIS_Y} />
      {months.map((m) => (
        <g key={m.label + m.x}>
          <line className="timeline-axis" x1={m.x} x2={m.x} y1={AXIS_Y} y2={AXIS_Y + 3} />
          <text className="timeline-month" x={m.x + 2} y={AXIS_Y + 12}>
            {m.label}
          </text>
        </g>
      ))}
      {s1.map((p) => tick(p, S1_H, 'tick-s1'))}
      {s2.map((p) => tick(p, S2_H, 'tick-s2'))}
    </svg>
  )
}
