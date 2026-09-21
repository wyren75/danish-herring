// The trawling-speed band, in one place. It mirrors ingest.py's rule for
// `n_trawling_in_site` — ship_type "Fishing" and 2–5 knots inclusive — so
// what the verdict panel highlights and what the scene counts say can never
// disagree. Both conditions are required: a cargo vessel at 3 knots is
// manoeuvring, not working.
const TRAWL_MIN_KN = 2
const TRAWL_MAX_KN = 5

// Fixed copy, shown wherever the phrase "trawling speed" appears: the scene
// counts (section 8) and the matched vessel's speed (9.2). The interface
// must not state trawling as an observed fact — it is a speed band applied
// to a self-declared vessel type.
export const TRAWLING_TIP =
  'Fishing vessel moving at 2–5 knots at this instant — working speed. ' +
  'A speed band, not a confirmed gear type.'

export const atTrawlingSpeed = (
  shipType: string | null | undefined,
  sog: number | null | undefined,
) => shipType === 'Fishing' && sog != null && sog >= TRAWL_MIN_KN && sog <= TRAWL_MAX_KN
