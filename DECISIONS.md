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

## 2026-09-16 · M7 · `satellite_passes` is read at startup, not when the Observation tab opens

Section 5.3 has the passes table loaded "once when the tab opens". The
Sentinel-2 toggle on the map tab needs it too — it is what decides whether
a clear pass exists near the scene — so it is loaded once with the other
tables (518 rows, one request). M8 reuses the rows already in memory.

## 2026-09-16 · M7 · "Clear" is under 20% cloud; the nearest such pass within ±1 day wins

Section 7 says the toggle is enabled only when "a clear S2 pass exists
within ±1 day of the scene" without a number; the Observation tab's
threshold (11.1, S2 under 20%) is used, on the catalogue's tile-wide
`cloud_pct`. Among clear passes within 24 h of `acq_mid` the closest in
time is shown, over its whole UTC day with `MAXCC=30` as 7.1 specifies.
With the current fourteen scenes only one pass qualifies — 26 Aug 2026
10:30 UTC, 2.1% cloud — so the toggle is live on four scenes (25 Aug 17:01,
26 Aug 05:39, 26 Aug 16:53, 27 Aug 05:31) and disabled on the other ten.
The spec's M7 test names May/June and February scenes from the earlier
data set; the equivalent now is 26 Aug versus 02 Sep.

## 2026-09-16 · M7 · The disabled toggle says why; the enabled one says when

Not in section 7's table, but small. When disabled, an (i) beside the
greyed toggle (and the label's hover title) reads *"No clear Sentinel-2
image within a day of this scene: the best pass, 02 Sept 2026 10:27 UTC,
was 85% cloud (the limit is 20%)"*, or *"No Sentinel-2 pass within a day
of this scene"*. When enabled, one muted line under it gives the photo's
date, time, cloud cover and its distance from the radar — *"26 Aug 2026
10:30 UTC · 2% cloud · 19 h before the radar"* — because the photo is up
to a day off the acquisition instant and a viewer should not take the
vessels in it for the radar returns.

## 2026-09-16 · M7 · The loading bar covers both Sentinel sources

Section 14's thin bar was tied to the radar source alone. Sentinel-2 tiles
come from the same WMS at the same speed, so the bar now shows while
either source has tiles in flight. Nothing is requested from the S2 layer
until the toggle is ticked; a hidden layer loads no tiles.

## 2026-09-16 · M8 · The "trailing 365 days" end at the latest pass in the table, not at the clock

Section 11 says trailing 365 days. Anchoring that to `Date.now()` would
make the headline numbers fall as the ingestion ages — 209 today, 180 in
a few months, with nothing on screen to say why — and section 14 forbids
time-of-day behaviour. The year is the 365 days ending at the latest
`acq_start` in `satellite_passes` (15 Sept 2026 11:21 UTC), and the range
is printed under the slider. Rerunning `ingest_passes.py` moves it.

## 2026-09-16 · M8 · Only windows wholly inside the year count

Section 11.2 has a window starting on every hour of the year. A window
starting in the last N days runs past the end of the data, where there are
no passes because the table stops, not because the satellite did — at
N = 4 that alone would put Hirsholmene at 0.5 % unseen instead of what the
passes say. Windows are `[h, h + N days)` with `h + N days ≤ end`: 8,665 of
them at N = 4, 8,521 at N = 10.

## 2026-09-16 · M8 · Measured, not the spec's expectation: Hirsholmene is 9 % unseen at N = 4

Section 11.2 expected ≈ 0 % by N = 4. The footprint-verified passes give
59 / 42 / 26 / **9** / 0 % for N = 1–5: the longest gap in the year is
5.0 days, so a four-day trip can still slip through; a five-day one cannot.
Bijagós reads 92 / 83 / 74 / **66** / 58 %, longest gap 12.0 days. The
contrast the section asks for is there; the number is the data's.

## 2026-09-16 · M8 · The Observation tab overlays the map, which stays mounted

Switching tabs must not throw away the radar tiles, the selected scene or
an open verdict. The tab is a full-width section drawn over the panel and
map (both stay in the DOM), so coming back is instant and costs no WMS
requests. The slider opens at N = 4, the milestone's own test case.

## 2026-09-16 · M8 · `bijagos.geojson` is read at startup with `site.geojson`

One more 300-byte fetch alongside the others, rather than a loader inside
the tab. It is used only for the inset (section 5.2).
