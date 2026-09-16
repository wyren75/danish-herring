// Timestamp parsing and formatting. Everything is UTC and every displayed
// time ends in "UTC" (SPEC.md sections 5.3 and 14). Never convert to local.

// Supabase timestamps carry microseconds ("...59.497005+00:00"); trim to
// milliseconds, the most Date.parse is guaranteed to accept.
export const parseUtc = (iso: string) => Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'))

const DAY_MS = 86_400_000

/** The UTC calendar day containing `iso`, as [start, end) in ms. */
export function utcDay(iso: string): [number, number] {
  const start = Math.floor(parseUtc(iso) / DAY_MS) * DAY_MS
  return [start, start + DAY_MS]
}

/** Hours between two timestamps, to one decimal: "12.3 h". */
export const hours = (startIso: string, endIso: string) =>
  `${((parseUtc(endIso) - parseUtc(startIso)) / 3_600_000).toFixed(1)} h`

const date = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const hm = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})
const hms = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

/** "26 May 2026" */
export const utcDate = (iso: string) => date.format(new Date(iso))
/** "05:32 UTC" */
export const utcTime = (iso: string) => `${hm.format(new Date(iso))} UTC`
/** "05:32:14 UTC" */
export const utcTimeSeconds = (iso: string) => `${hms.format(new Date(iso))} UTC`

const int = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

/** "1,240 m" */
export const metres = (m: number) => `${int.format(Math.round(m))} m`

/** "57.4412 N, 10.5537 E" */
export const latLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)} ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)} ${lon < 0 ? 'W' : 'E'}`
