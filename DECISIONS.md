# Decisions

Deviations from `SPEC.md` and choices the spec left open, with the reason.
Newest last. See `JOURNAL.md` for the reasoning behind the spec itself.

## 2026-09-15 · M1 · Basemap: OpenFreeMap dark instead of Carto Dark Matter

Spec section 6.3 named Carto Dark Matter as the default. As of September
2026 Carto's basemap tiles require an API key; without one they render with
an "API KEY REQUIRED" watermark. Options were a free Carto key (one more
secret and account), OSM standard (light, wrong for radar), or OpenFreeMap's
`dark` style — free, no key, no account, dark, vector. Chose OpenFreeMap.
Still one constant in `src/map/layers.ts`; attribution is
"© OpenFreeMap © OpenMapTiles · Data from OpenStreetMap", shown on the map
and in the footer.

## 2026-09-15 · M1 · Site geometry is a MultiPolygon, kept as-is

The EEA feature for DK00FX113 has two polygons: the main site around the
Hirsholmene islands, and a small coastal strip about 15 km south near Sæby.
Both are drawn and both count as "inside the site". The strip is why the
site's enclosing rectangle reaches south to 57.350. Point-in-polygon (M4)
must test every polygon of the MultiPolygon, not just the first ring.

## 2026-09-15 · M1 · Initial zoom 10.3, not 11

At zoom 11 on a typical desktop the site (0.22° of latitude) is taller than
the map, so its north tip and the boundary label were off-screen on load.
Zoom 10.3 shows the whole site and the label with a little margin. Centre
unchanged at 10.55, 57.46.

## 2026-09-15 · M3 · Catalogue queries test footprint coverage of the site, not intersection with the box

Five of the twelve ingested scenes (01 Apr, 01 May, 26 May, 12 Jun, 24 Jun,
all ~17:09 UTC, one orbit track) never imaged the site: their footprint's
eastern edge lies at about lon 10.35 at the site's latitude, clipping only
the western sliver of the padded box over the mainland. They passed a
box-intersection test. Fixed on the data side in `ingest.py` and
`ingest_passes.py`: a candidate product must cover the site polygon. The
two-minute WMS window behaved correctly throughout — for 26 May it refused
the morning pass that a whole-day query would have shown.

## 2026-09-15 · M3 · Radar layer stays IW_VV

Compared `IW_VV` and `IW_VV_DB` by eye as section 6.2 suggests. Kept
`IW_VV`: near-black sea and saturated hulls read better for the click-blind
use of the app. `IW_VV_DB` remains available by changing one value in `.env`.

## 2026-09-16 · M4 · Scene picker follows the section 8 sort rule, not its example

*Superseded the same day by M4b, below.* Section 8 said sort by
`n_fishing_in_site` descending, ties by `n_trawling_in_site`, then date —
but its example rows listed 02 Sep (6·4) above 31 Aug (7·0). M4 followed the
rule. The activity dots the spec shows but does not define are
`round((fishing + trawling) / 2.5)`, capped at four: trawlers count twice,
which reproduces the three example rows exactly. (The dots stand.)

## 2026-09-16 · M4 · Verdict scrolls into view

*Superseded the same day by M4b, below.* With fourteen scenes the verdict
section sat below the panel's fold, so M4 called `scrollIntoView` on the
verdict when a click produced one.

## 2026-09-16 · M4b · Sort by trawling first; scene list is a scrollable box

The owner corrected section 8: the rule was wrong and the example was right.
Sort is now `n_trawling_in_site` desc, `n_fishing_in_site` desc, date —
vessels at trawling speed inside the boundary are the strongest opening, so
02 Sep (6 fishing, 4 trawling) opens by default. And instead of the verdict
scrolling itself into view, the scene list is a box of about six rows with
its own scrollbar, so Layers, Radius and the Verdict stay on screen.

## 2026-09-16 · M5 · "Reveal all" is a quiet button, disabled once AIS is shown

Open question 19.3. It is a real button, but outlined and small, under the
layer toggles rather than beside the verdict — the demo is stronger if the
user tries a blind click first. Once the AIS layer is on it is disabled;
the toggle does the same job without the animation. "Reveal all" sweeps
the markers in over 0.7 s, outward from the click if there is one, else
west to east.

## 2026-09-16 · M5 · Marker click sets the click at the AIS position

Section 7.3 says clicking a marker is a shortcut to the matched panel. It
is implemented literally: the click lands on the vessel's AIS position, so
the ordinary nearest-snapshot logic produces that vessel and the panel
reads "Offset from your click: 0 m". No second code path, and the verdict
stays a pure function of click, scene and radius (section 14). Hidden
markers are not clickable; the always-drawn matched marker is.

## 2026-09-16 · M5 · Markers are one signed-distance-field image

MapLibre draws the triangle from a single SDF bitmap generated in code
(`src/map/ais.ts`), so colour, the white in-site ring and the larger
matched size are per-feature paint properties instead of eight bitmaps.
A moving vessel that reports no course gets a dot, like a stationary one.

## 2026-09-16 · M5 · MID table covers every MID in the snapshots

Section 9.2's list plus the others that occur in `snapshots` (Liberia,
Marshall Islands, Bahamas, Malta, Cyprus, Portugal, Greece, Panama,
Singapore, Antigua, Barbados, Seychelles, Falklands, Finland, Ireland,
Italy). Anything else still shows the three digits.

## 2026-09-16 · M5b · Non-fishing markers are light blue, not grey

Section 7.3 said light grey. Grey dots were invisible over the bright
harbour clutter in the radar image, so the owner chose `#4fb3ff`. Fishing
stays orange; the white in-site ring rule is unchanged.

## 2026-09-16 · M6 · The confidence ratio is measurable on one scene

Section 10 counts GFW vessels whose event spans the acquisition instant,
inside the site. Applied to the fourteen scenes that is 3 vessels on
01 Sep (3 of 3 found, 100%), 2 on 02 Sep, and 0–1 everywhere else — so
thirteen scenes show "not measurable". The section 17 fallback to the
padded box does not help: it adds one vessel on 14 Aug and one on 26 Aug,
still below three. Built to the spec's rule and left the flag at `site`;
the choice of a wider time window (the scene's day, as JOURNAL.md first
phrased it, gives 1–29 events per scene) is the owner's, not made here.

## 2026-09-16 · M6 · Where "panel header" is

Section 10 says the ratio is shown "in the panel header" and repeated under
every verdict. It sits directly under the selected scene's product name and
"Radar acquired at…" note — the per-scene header of the panel — and again
at the foot of the Verdict section once there is a verdict. One component,
`panel/Confidence.tsx`, rendered twice; the section 17 flag lives there.

## 2026-09-16 · M6 · GFW squares are a second SDF icon

MapLibre's circle layer cannot draw squares, so the GFW layer is a symbol
layer using a 6 px square built by the same signed-distance rasteriser as
the AIS triangle (`sdfIcon` in `map/ais.ts`). Squares are smaller than the
AIS markers and drawn beneath them; hover shows a MapLibre popup with the
four facts of 7.4 and nothing else.

## 2026-09-16 · M6b · `Confidence` files renamed; section 17 flag retired

Section 10 retired the word "confidence" and the ratio with it, so
`lib/confidence.ts` became `lib/gfw.ts` and `panel/Confidence.tsx` became
`panel/SceneCounts.tsx` (section 15's tree predates the rewrite). The
section 17 flag "confidence over site polygon or padded box" had nothing
left to switch: 10.1 fixes the GFW count to `inside_site`. Removed. The two
counts are shown once, under the scene details, and no longer repeated
under each verdict.

## 2026-09-16 · M6b · GFW bounding boxes normalised in the browser

In `gfw_fishing_events`, 1,032 of 2,194 rows have `bbox_w > bbox_e` (never
`bbox_s > bbox_n`); the centre point always falls inside the min/max box,
so it is an ordering quirk from the source, not bad data. `map/gfw.ts`
takes min/max of each pair before drawing the rectangle. Left the table
alone; worth fixing at ingestion if the loader is touched again.

## 2026-09-16 · M6b · "Stopped at", not "Transiting at", below 0.5 kn

Section 10.2's first line reads "Transiting at 17:01 UTC." for a vessel
that is not inside a GFW event at the instant. A vessel under 0.5 kn — the
same threshold that turns its marker into a dot (7.3) — is not transiting;
it says "Stopped at" instead. Same line otherwise.

## 2026-09-16 · M6b · "in 18 months" is measured from the table

The history line's span is the time between the earliest `start` and the
latest `end` in `gfw_fishing_events`, rounded to months (currently 18), so
it stays true if the table is reloaded with a different window. When a
vessel is within ±6 h of the pass but not inside an event, each of its
events in that window is listed on its own line; the spec's example shows
one, the data often has two (harbour evening departures plus the previous
night's tow).
