// The Observation tab's arithmetic (SPEC.md section 11.2): how often each
// site is imaged by Sentinel-1, and the chance that a fishing trip of N days
// falls entirely between two passes. Pure functions over `satellite_passes`.
import type { SatellitePass } from '../lib/data'
import { parseUtc } from '../lib/format'
import { CLEAR_CLOUD_PCT } from '../lib/s2'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
export const YEAR_DAYS = 365
/** The slider's range: "a fishing trip of N days", 1–10 (11.1). */
export const MAX_TRIP_DAYS = 10

export interface Year {
  start: number // ms
  end: number
}

/**
 * The trailing 365 days the table covers: the year ending at the latest
 * pass in it, whichever site or mission. Anchored to the data rather than
 * to the clock, so the figures do not drift as the ingestion ages
 * (section 14: no time-of-day behaviour).
 */
export function yearWindow(passes: SatellitePass[]): Year {
  const end = Math.max(...passes.map((p) => parseUtc(p.acq_start)))
  return { start: end - YEAR_DAYS * DAY_MS, end }
}

/** One mission's passes over one site within the year, in time order. */
export function passesInYear(
  passes: SatellitePass[],
  siteCode: string,
  mission: 'S1' | 'S2',
  year: Year,
): SatellitePass[] {
  return passes
    .filter((p) => p.site_code === siteCode && p.mission === mission)
    .filter((p) => {
      const t = parseUtc(p.acq_start)
      return t >= year.start && t <= year.end
    })
    .sort((a, b) => parseUtc(a.acq_start) - parseUtc(b.acq_start))
}

/** Sorted acquisition instants (ms) of those passes. */
export const passTimes = (passes: SatellitePass[]) => passes.map((p) => parseUtc(p.acq_start))

/** Sentinel-2 passes the timeline marks: under 20 % cloud (11.1). */
export const clearS2 = (passes: SatellitePass[]) =>
  passes.filter((p) => p.cloud_pct !== null && p.cloud_pct < CLEAR_CLOUD_PCT)

export interface GapStats {
  passes: number
  /** 365 days ÷ passes. */
  meanIntervalDays: number
  /** Median of the gaps between consecutive passes. */
  medianGapDays: number
  longestGapDays: number
}

export function gapStats(times: number[]): GapStats {
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY_MS)
  const sorted = gaps.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = !sorted.length
    ? 0
    : sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
  return {
    passes: times.length,
    meanIntervalDays: times.length ? YEAR_DAYS / times.length : Infinity,
    medianGapDays: median,
    longestGapDays: gaps.length ? Math.max(...gaps) : Infinity,
  }
}

/**
 * For each trip length N = 1..MAX_TRIP_DAYS, the fraction of N-day windows in
 * the year that contain no pass. Windows start on every hour and must lie
 * wholly inside the year — a window overhanging the end of the data would
 * read as "unseen" only because the table stops there. Index 0 is N = 1.
 */
export function unseenByTripLength(times: number[], year: Year): number[] {
  const out: number[] = []
  for (let n = 1; n <= MAX_TRIP_DAYS; n++) {
    const span = n * DAY_MS
    let windows = 0
    let unseen = 0
    let i = 0 // first pass not before the window start; only ever moves forward
    for (let h = year.start; h + span <= year.end; h += HOUR_MS) {
      windows++
      while (i < times.length && times[i] < h) i++
      if (!(i < times.length && times[i] < h + span)) unseen++
    }
    out.push(windows ? unseen / windows : 0)
  }
  return out
}
