# Decisions

Deviations from `SPEC.md` and choices the spec left open, with the reason.
Newest last.

The first section covers the feasibility work that produced the spec: which
data sources were tried, which were rejected, and what was measured. Every
figure below was measured with the scripts in `data/`, and every rejection
was a measurement rather than an opinion.

---

# Feasibility · July – September 2026

## 2026-07 · Concept · The first idea was a map of AIS ships; rejected

The original concept was an OpenStreetMap basemap, a click to fetch vessels
within 5 km from MarineTraffic, and the latest Sentinel-2 image, in real
time. That product already exists: it is MarineTraffic and the Copernicus
Browser open in two tabs. Reframed around the **discrepancy** instead —
vessels visible to radar but absent from AIS — which is the question the
data can answer and the tabs cannot.

## 2026-07 · Data · MarineTraffic rejected: no self-serve API

MarineTraffic is now owned by Kpler. The AIS API has no published per-call
pricing and no self-serve tier; access is an enterprise subscription
arranged by sales. Not viable for an individual project at any effort level.

## 2026-07 · Architecture · MCP has no place in the running application

MCP is a protocol for language models to call tools. Routing the app's data
through it would add two network hops (browser → backend → MCP client → MCP
server → provider API) and return text formatted for a model rather than
JSON for a map. MCP is used during development, inside Claude Code, and
nowhere at runtime.

## 2026-07 · Imagery · No band downloads, no "imagery agent"

The concern was that importing satellite data is heavy and slow, and might
need its own background service. It does not: Sentinel Hub's WMS renders
server-side and returns ordinary 256 px map tiles. No `.SAFE` products, no
band arithmetic, no separate process. The feature feared most turned out to
be the cheapest.

## 2026-07 · Scope · Real-time dropped

Dark-vessel analysis is inherently retrospective: GFW's SAR detections lag
about five days, the Danish AIS archive publishes about three days late, and
Sentinel-1 revisit is measured in days. Real-time vessel tracking and
dark-vessel analysis are two different products. Chose the second.

## 2026-07 · Prior art · Paolo et al., *Nature* 2024

Global Fishing Watch has already done this at planetary scale: Sentinel-1
and Sentinel-2 against AIS across 2 petabytes with convolutional networks,
finding that 72–76 % of industrial fishing vessels are not publicly tracked.
The project continues anyway — its purpose is to build and to measure, not
to be novel — and states the prior art openly rather than waiting to be
told.

## 2026-07 · Data · GFW publishes conclusions, not positions

GFW's API gives AIS-disabling events, SAR detections flagged matched or
unmatched, encounters, loitering, and vessel identity. It does **not** give
individual AIS positions — only aggregated presence rasters. So GFW can be a
second opinion but cannot be the AIS source.

## 2026-08 · Measurement · Bijagós imagery: viable

First candidate site was the Bijagós Archipelago, Guinea-Bissau — UNESCO
World Heritage, a documented IUU fishing target, and coastal, so terrestrial
AIS looked plausible. Copernicus catalogue, trailing year: Sentinel-1 88
passes, average 4.1 days, longest gap 7 days. Sentinel-2 strongly seasonal,
usable December–May, monsoon June–September. Imagery was never the problem.

## 2026-08 · Measurement · Bijagós AIS: nothing, and the control that proved why

Thirty minutes of AISStream over the Bijagós returned **0 messages**. Before
accepting that as a coverage result, ran the same test over the Dover
Strait — one of the busiest waterways on earth. **Also 0.**

The control failing meant the first result was void: nothing would have
returned data anywhere. AISStream's issue tracker confirmed it — an
identical report from March 2026 still unanswered, five expired-certificate
reports in May, no maintainer activity since.

**The rule this produced, which shaped everything after: always run a
positive control before accepting a negative result.**

## 2026-08 · Data · AISStream rejected; AISHub not usable

AISStream appears abandoned. AISHub is a reciprocal network: API access
expects you to contribute a physical receiver. Neither is an option.

## 2026-08 · Finding · There is no free AIS receiver in West Africa

AISHub publishes its 1,588 stations as JSON. Querying every West African
coastal country — Mauritania, Senegal, Gambia, Guinea-Bissau, Guinea, Sierra
Leone, Liberia, Côte d'Ivoire, Ghana, Togo, Benin, Nigeria, Cape Verde —
returns **zero stations**. The same query returns hits immediately for
Sweden, South Africa, Morocco, Angola and Brazil.

This is a finding, not an obstacle: the monitoring gap at a World Heritage
site is on the ground as well as in orbit.

## 2026-08 · Data · Free point-level AIS exists in four places on earth

Denmark (historical, daily CSV), Finland (live API), Norway (live API),
United States (historical). Everything else is commercial. French, Spanish
and Portuguese waters — which have the worst MPA trawling records in Europe
— publish only aggregated density rasters, unusable for click-a-vessel
correlation.

## 2026-08 · Site · Denmark, for the only honest reason

Seas At Risk / Oceana / Marine Conservation Society measured 4.4 million
hours of bottom trawling inside marine Natura 2000 sites between 2015 and
2023; trawling continues in 90 % of offshore EU MPAs; and in the Baltic not
one MPA prohibits fishing entirely. By hours, Denmark ranks third after the
Netherlands and Germany.

France and Spain rank worse and make the better story. **Neither publishes
free point-level AIS.** Denmark is the only place where a real story
overlaps with real data — the structural tension of the whole project: open
data exists where governance is strong, and dark vessels concentrate where
it is weak.

**Consequence:** historical data means no live recorder, no always-on
process, and no three-week wait. The largest schedule risk disappeared.

## 2026-08 · Engineering · The DMA archive is a JavaScript page over an S3 bucket

`aisdata.ais.dk` renders its file listing client-side, so the HTML contains
no filenames. Rather than reach for a headless browser, read the bucket name
from the page source and call S3's `ListObjectsV2` API directly: byte-exact
sizes, real timestamps, full pagination, and immune to the page being
restyled.

Measured: 531 daily files, an 18-month rolling window, ~3-day publication
lag, median 614 MB compressed → 2.9 GB uncompressed.

**The rolling window has a design consequence:** old days expire, so every
filtered extract is archived in `data/out/` rather than re-fetched.

## 2026-09 · Architecture · Precompute everything; the browser stays dumb

Ingestion keeps only AIS inside the padded box within ±90 minutes of each
acquisition, then interpolates every vessel's position to the **exact second**
of the pass and stores that as `snapshots`. The browser never interpolates:
a click is one distance calculation against ~100 precomputed rows. 927,000
raw positions become 1,413 snapshots. `positions.csv` is kept in the
repository for phase 2 but never loaded into the database.

## 2026-09 · Architecture · No backend server

A server was planned to hold credentials and proxy queries. It proved
unnecessary: Supabase is queried from the browser under a read-only policy,
Sentinel Hub's WMS is designed for browser use and its instance can be
domain-locked, and GFW data is ingested offline. Nothing was left for a
server to do. Vercel and Supabase only. A backend returns when phase 2
needs raw pixels.

## 2026-09 · Site · Hirsholmene, chosen by trawling signature rather than by name

86 Natura 2000 sites intersect the Kattegat box, many of them lakes and
forests. Rather than choose by name, scored every polygon against a day of
Danish AIS: distinct vessels, distinct fishing vessels, and fishing vessels
at **2–5 knots** — trawling speed, the signature of gear in the water rather
than a vessel passing through.

*Skagens Gren* had the most raw trawling but is 71 × 62 km and contains a
traffic separation scheme, with cargo as its top vessel category.
**Hirsholmene (DK00FX113)** had the highest fishing density — 15 fishing
vessels in 95 km², five at trawling speed — and a vessel mix of fishing,
pleasure and sailing with **no cargo or tanker at all**. No shipping lane
crosses it, so every large radar return is almost certainly a fishing
vessel. Verified across three seasons before committing.

## 2026-09 · Method · GFW event counts are a poor proxy for presence

Ranking radar passes by GFW fishing events scored 303 of 317 passes at zero.
The same day that GFW scores zero had 12 fishing vessels inside the site in
the Danish record. GFW only records sustained, classified fishing from a
sparser satellite feed; it misses transits and short activity. **Presence is
scored from the Danish data.** The ranking script is kept as a record of the
rejected approach.

## 2026-09 · Method · Scenes are chosen by measured activity, not by date

The first twelve scenes were spread evenly across April–July for no better
reason than even spacing, and at those instants the site was nearly empty —
the vessels in the box were moored in Strandby harbour, 300 m outside the
boundary. Re-ingested every pass over a four-week window and scored each by
fishing vessels inside the polygon at the acquisition instant, keeping only
scenes with three or more. `scenes` gained `n_in_site`,
`n_fishing_in_site` and `n_trawling_in_site` so the picker sorts on measured
truth rather than a client-side proxy.

## 2026-09 · Finding · The fleet works at night and dawn

Hour-by-hour analysis of one day inside the site: 5 fishing vessels at
05:00 UTC with 4 trawling, nothing through the middle of the day, 12 inside
at 17:00 transiting out. Sentinel-1's sun-synchronous orbit fixes its passes
at roughly 05:35 and 17:05 UTC — so the morning pass catches the fleet at
work and the evening pass catches it leaving. Not a blind spot, but a narrow
coincidence worth knowing.

## 2026-09 · Finding · GFW knows the site is protected and records fishing there anyway

Hypothesis after seeing one event tagged with no marine protected area:
GFW's protected-area layer might omit this Natura 2000 site, which would
have been a striking finding in itself. Tested across all events inside the
polygon: **293 of 293 are tagged as inside an MPA. Hypothesis rejected.**

The truth is stronger than the hypothesis was. Over 18 months: 293 apparent
fishing events by 45 distinct vessels inside the boundary, every one
recognised by GFW as occurring in a protected area, **94 % Danish-flagged**.
This is the domestic fleet fishing a domestic protected site, legally. That
is what a *paper park* means.

## 2026-09 · Feature · The gap-event join was designed, then cut for lack of data

The planned centrepiece was: for a radar return with no AIS, find which
vessel had recently switched its transponder off nearby and could plausibly
have reached that position at a realistic speed. GFW reports **zero**
AIS-disabling events here in a year. Cut. The unmatched verdict says plainly
that no AIS contact exists, with no speculation — and the per-vessel GFW
context (what the boat was doing before and after the pass) replaced it.

## 2026-09 · Feature · The confidence ratio was built, then replaced

Section 10 originally displayed "AIS coverage" — the fraction of
GFW-confirmed fishing vessels also present in the Danish record. It was
designed in August for a volunteer AIS network with real reception holes.
With the Danish Maritime Authority's official shore network the figure is
near 100 % by construction, only one scene of fourteen met the
three-reference-vessel threshold, and the wording implied a deficiency in
the golden source. Replaced with **two independent counts side by side**,
always displayable, where zero is a result rather than an error.

## 2026-09 · Measurement · Satellite coverage, footprint-verified

A pass counts only if the product's footprint contains the site — four
corners and centre — not merely intersects a box around it. Sentinel-2 is
tested on the centre alone, because its 100 km tiles sit on a fixed grid and
a small box can straddle a tile edge.

Trailing 365 days, same test and comparable target size at both sites:

| | Sentinel-1 passes | Average interval |
|---|---|---|
| Hirsholmene | **209** | 1.7 days |
| Bijagós core | **31** | 11.8 days |

The Bijagós median gap and longest gap are both exactly **12.0 days** — the
Sentinel-1 repeat cycle. One satellite, one track, once per cycle.
Hirsholmene's median gap is 13 hours: several tracks, morning and evening.
That is the difference between systematic acquisition over Europe and
opportunistic acquisition elsewhere, in two numbers.

Earlier figures of 419, 317 and 88 passes were measured by intersection with
larger boxes and are superseded.

## 2026-09 · Honesty · Sources in this project are not all independent

GFW's SAR detections are themselves derived from Sentinel-1. Displaying them
over a Sentinel Hub image would be the same source twice, processed
differently — not two sources crossed. The genuinely independent pairing is
**Sentinel-1 pixels against AIS positions**, and that correlation is
computed here rather than consumed.

---

# Build · September 2026


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

## 2026-09-16 · M8b · Bijagós median and longest gap are both 12.0 days: the Sentinel-1 repeat cycle

Not a coincidence in the data. Every Sentinel-1 pass over the Bijagós core
in the year comes from one satellite on one orbit track, and Sentinel-1's
repeat cycle is exactly twelve days — so every gap is the same gap.
Hirsholmene, at 57°N where the tracks converge, is covered from several
tracks, morning and evening, which is why its median gap is 13 hours and
its longest 5 days. The closing sentence (11.3) now states both figures.

## 2026-09-16 · M10 · The map is created on the site's known rectangle, then fitted to the polygon

Section 13.4 fits the initial view to the site polygon's bounds. The map
is created before `site.geojson` has been read, so it opens on
`SITE_RECT` — the same rectangle, as a constant — and re-fits to the
bounds computed from the polygon the moment the data arrives. Nothing
visible moves; the first paint is already right.

## 2026-09-16 · M10 · Re-fit on window resize only, not when the inspector opens

The inspector narrows the map by 340 px. Re-fitting then would slide the
view out from under the dot the user has just clicked — the one thing
they are looking at. The fit is recomputed on `window` resize only, as
the section says; opening the inspector keeps the map's centre and zoom.

## 2026-09-16 · M10 · The first-visit hint is per page load, not remembered

"Disappears on the first map click and does not return" is read within
one visit. It is not persisted to storage: the milestone's own test
opens with "the hint shows", a reviewer reloading the page expects to
see it again, and it costs nothing. The Layers card, by contrast, does
remember its open state for the session (`sessionStorage`), as 13.4 asks.

## 2026-09-16 · M10 · Arrow keys step scenes anywhere except inside a field

`←` / `→` are listened for on the document so the stepper needs no
focus. They are ignored while focus is in an input — the radius slider
uses the same keys — and with a modifier held. The scene dropdown's
`Esc` is caught before the inspector's, so one press closes the menu
and a second clears the click.

## 2026-09-16 · M10 · The radius slider is a slot in the verdict panel

13.5 puts the slider after the verdict and GFW lines but before the
"no contact" block, which is rendered inside `Verdict`. Rather than
split that component, it takes the slider as `children` and places it
at that point in both branches. `Verdict`, `Radius`, `Layers`,
`SceneCounts` and `ScenePicker` otherwise keep their logic and markup;
only their headings moved to the containers that now carry them.

## 2026-09-21 · M11d · The layer names spell the sensors out

Owner feedback. "Radar S1" and "Optical S2" abbreviate satellites the
reader has not met; a demo has no glossary. The rows read **Radar
Sentinel-1**, **Optical Sentinel-2** and **AIS fishing vessels** — the
last names the fleet rather than the feed, which is what the click is
about. SPEC.md 7 and 13.8 updated; recorded as 13.13.

## 2026-09-21 · M11d · Inside the Layers card the (i) note opens downward

The tooltip of 9.4 opens upward from its row, which works in the verdict
panel and fails in the Layers card: the card sits at the top of the map, so
the Optical row's note ran under the top bar — a separate stacking context
at `z-index: 3`, so raising the tooltip could not win. `.layers .tip-text`
opens downward over the map instead, the same reversal `.topbar .tip-text`
already makes. No change to `Tip`, which stays one component.

## 2026-09-21 · M11d · One imagery layer at a time, held as one state

Supersedes the section 7 table's two independent toggles. Radar and optical
stacked is not a view: the upper hides the lower and a bright dot can no
longer be attributed to a sensor. Rather than two booleans kept in step by
each other's handler, `App` holds one `Imagery = 'radar' | 'optical' | null`
and derives `showRadar` / `showS2` from it — the invariant cannot be broken
by a future third setter, and no effect is needed to repair state.

The derivation also covers the case exclusivity created: with optical
chosen, a scene offering no clear S2 pass would have left the map bare.
`showRadar` is true when the choice is optical and the pass is missing, so
radar stands in, the Radar row shows ticked, and the ticks always say what
is drawn.

## 2026-09-21 · M11d · "Reveal all" removed; the sweep moves onto the toggle

Retires open question 19.3 and supersedes the M5 entry above. The button
and the toggle set the same state; the button sat directly beneath the
toggle and was disabled whenever it was on, so it asked the user to notice
the same control twice. The 0.7 s sweep was the only thing the button had
that the toggle lacked, so the toggle now runs it: each time AIS is
switched on, `revealKey` is bumped and the markers fade in one after
another. Blind-click-first is unaffected — the layer is still off by
default.

## 2026-09-21 · The activity dots: the formula, and a tooltip saying what they count

The glyph beside each scene is

```
min(4, round((n_fishing_in_site + n_trawling_in_site) / 2.5))
```

filled dots. Trawlers are counted twice — a trawler is a fishing vessel
that is also working — so a scene of moving gear outranks a scene of
moored boats with the same headcount.

**The divisor was fitted, not derived.** Section 8 prints three examples:
6·4 → ●●●●, 5·4 → ●●●●, 7·0 → ●●●. With the cap at four, 2.5 is the
value that reproduces all three; no principle recommends it and nothing
measures it. If the dataset changes, those examples are what to re-check
— not the number.

**The dots now say what they count.** Nothing on screen explained them.
They carry a native `title` — *"Activity: fishing vessels inside the site,
trawlers counted twice"* — rather than a fourth (i) button: the app has
enough of those, and the glyph is decoration beside the two counts it
summarises. It stays `aria-hidden`, since a screen reader already reads
those counts aloud; the help cursor is the only hint that there is
something to hover. The glyph moved to `SceneDots`, used by both the
stepper and its dropdown, so the formula has one home.

## 2026-09-21 · "at trawling speed", not "trawling" — the interface stops claiming gear

The counts and the verdict panel said *trawling* as though it had been
observed. It has not been. `n_trawling_in_site` is two conditions: the
vessel's self-declared AIS `ship_type` is Fishing, and its speed over
ground at the acquisition instant is between 2 and 5 knots. That is a
speed band applied to a self-declared type — a good proxy for gear in the
water, and nothing more. A trawler hauling and a seiner steaming slowly
into a set look alike from here; so, in the speed alone, does a fishing
vessel drifting in a current.

Three changes, one point. The stepper and its dropdown now read **"4 at
trawling speed"** — the phrasing the README already used. The phrase
carries a native `title`, in the manner of the activity dots and for the
same reason: *"Fishing vessel moving at 2–5 knots at this instant —
working speed. A speed band, not a confirmed gear type."* And in the
matched panel, a fishing vessel in the band has its speed drawn in the
accent orange with *"(trawling speed)"* appended, carrying the same
tooltip — so the one vessel the user clicked is legible as part of the
count at the top of the screen.

The fishing-type condition is required in the panel, not merely tidy: a
cargo vessel at 3 knots is manoeuvring, and highlighting it would
contradict `n_trawling_in_site`, which applies both conditions. The band
and the test now have one home, `lib/trawling.ts`, mirroring `ingest.py`
so the highlight and the count cannot drift apart.

## 2026-09-21 · AIS navigational status 7 "engaged in fishing" — measured, deferred

AIS carries a self-declared *activity* flag as well as a vessel type:
navigational status code 7, "engaged in fishing". If it were reliable at
the instant, it would be a better answer than a speed band. It is not.

Measured on one day of Danish data: **73% of fishing-vessel position
reports set status 7** — the field is well maintained, not the empty
column it is in many fleets. But **88% of those declarations are
broadcast above 5 knots**, because the skipper sets it on leaving harbour
and clears it on return. It is trip-level intent, not moment-level
observation: it says *this is a fishing trip*, which, for a fishing
vessel at sea, is by and large already true. Against the vessel type the
app already holds, it adds little.

Deferred rather than rejected. Using it would mean re-ingesting every
scene: `ingest.py` already captures the field into `positions`, so only
`snapshot()` would need to carry it through to the snapshot rows, but the
whole table would have to be rebuilt to fill it. If a later change
re-ingests for another reason, carry it then and show it as what it is —
a declaration, with its time of setting — not as an observation.

## 2026-09-21 · A progress counter — the scene becomes a quest

The app asks the user to click bright dots on a radar image, and until now
nothing told them when they were done. A scene has a finite number of
answers in it; the counter says how many, and how many are left.

**What it counts.** The denominator is the scene's `n_fishing_in_site`,
precomputed at ingestion (section 8) and read, never recomputed. The
numerator is the distinct MMSIs the user has matched in this scene under
the *same two conditions* — `ship_type = 'Fishing'`, and an AIS position
inside the site polygon. Numerator and denominator must apply the same
test or the counter can never reach its own total, and a "3 / 6" that
cannot become "6 / 6" is worse than no counter at all. This is why the
test is the snapshot's position, not the click's: `verdict.inSite` answers
"did the user click inside the protected area", which is a different
question and a looser one.

**Why only in-site fishing vessels.** The point of the app is the fleet
inside a protected site (section 1). A cargo ship transiting the box is a
real radar return and a real match, and the inspector will say so — it is
simply not what is being counted. Counting every vessel in the box would
make the number about the user's mouse rather than about the site, and the
site is the subject.

**Revealing AIS makes it easier, on purpose.** The obvious objection is
that ticking *AIS fishing vessels* hands the user the answers: the markers
appear, and clicking each one fills the counter in under a minute. That is
allowed, and it is the right call. Blocking it would mean either freezing
the counter while the layer is on — which turns a discovery into a
punishment — or tracking whether each find was "earned", which is
bookkeeping about honesty that nobody asked for. The reveal is already the
lesson of section 7.3: the radar shows you *something is there*, AIS tells
you *what it is*, and the gap between the two is the whole argument. A
user who reveals the layer and collects six vessels has seen exactly that
gap, six times. A user who finds three blind and reveals the rest has seen
it too, and more sharply.

**Reached by action, not watched for.** The find is recorded in the two
handlers that can produce a match — the map click, and a drag of the
matching radius that pulls a vessel inside the circle — rather than in an
effect watching the verdict. Same result, and it keeps `setState` out of
effects, which the linter rightly objects to.

The counter is hidden where `n_fishing_in_site` is zero (no scene in the
table is, but the guard is a line), and its set is emptied on every scene
change: each scene is its own hunt. At *n*/*n* the text turns accent orange
and says *all found* — the one moment the app has an ending. The border
stays as it was: an orange ring round the whole pill was tried and read as
an alert rather than a finish.

## 2026-09-21 · The welcome: no email address, and a way out at the top

Two changes to the welcome dialog (13.10), both about the same thing —
what a first-time visitor is being asked for.

**The contact address is gone from the footer.** A public demo that opens
by printing the author's personal email address invites the one thing the
app cannot do anything with: replies. The README still carries it, which
is where someone who has read the project and wants to write about it will
look. The foot line keeps *Open data · built with AI assistance · about
this project*.

**A ✕ top right.** `Esc` closed the dialog and *Start* closed it from page
2, but page 1 offered only *How to find a boat →* — a visitor who wanted
the map, not the tour, had to either guess at `Esc` or read a page of
prose and click through. The ✕ is the affordance people look for first.

It sits in a sticky, zero-height row rather than absolutely positioned:
the dialog is its own scroll container (`max-height: 100%`,
`overflow-y: auto`), so an absolutely positioned ✕ would scroll out of
sight on a short window — exactly the case where a visitor most wants out.
Sticky keeps it pinned and zero height keeps it from moving the heading
below it.

## 2026-09-21 · Vercel Web Analytics

The link is live and shared; nothing said whether anyone opened it. Added
`@vercel/analytics` — one dependency, approved by the owner — rendered as
`<Analytics />` once in `App.tsx`. No custom events, no identification of
visitors, no cookies.

Vercel's own product rather than Google Analytics for two reasons. It is
served first-party from the same domain, so corporate proxies and ad
blockers do not block it, and the numbers are therefore worth reading. And
it stores no personally identifiable information, which keeps the app in
the position it has held since M0: the browser reads open data and tells
nobody who is looking.

The useful signal is the **referrer** — which link someone followed to get
here — not a count of people. No visitor is identified. Being cookieless
and holding no personal data, it needs no consent banner, and none was
added.
