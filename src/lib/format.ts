// Timestamp formatting. Everything is UTC and every displayed time ends in
// "UTC" (SPEC.md sections 5.3 and 14). Never convert to local time.

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
