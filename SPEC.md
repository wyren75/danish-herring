# Sonar — specification

**Version 1.0 · 14 September 2026 · Status: draft for review**

A retrospective tool that crosses Sentinel-1 radar imagery with official AIS
data over a European marine protected area, to show which vessels were — and
were not — declaring their position at the instant the satellite passed.

This document is written to be handed to Claude Code. It is prescriptive where
a decision has been made and explicit where one is left open. Build it in the
order given in section 12; each milestone has a "done when" test.

---

## 0. How to use this document

1. Put this file, `PROJECT_CONTEXT.md` and `JOURNAL.md` in the repository root.
2. Tell Claude Code: *"Read SPEC.md. Build milestone M0. Stop when its
   'done when' test passes."* Then M1, and so on. One milestone per session.
3. Commit after every milestone. Never build two milestones in one go.
4. When Claude Code proposes something not in this spec, ask it to justify
   the deviation in one sentence, then decide. Record the decision in
   `DECISIONS.md`.

---

## 1. What the application does — in one screen

The user opens the app and sees a dark map of the Kattegat, centred on the
**Hirsholmene** Natura 2000 site, its legal boundary drawn as an outline.

A panel lists a dozen **scenes** — moments when Sentinel-1 imaged the site.
The user picks one. The radar image for *that exact acquisition* appears over
the map: black water, bright dots where steel hulls returned the pulse.

The AIS layer is **hidden by default.** The user looks at the radar, sees a
bright dot inside the boundary, and clicks it.

The app answers, from the official Danish AIS record interpolated to the exact
second of the acquisition:

- **Matched** — *"KAREN MARIE, Danish fishing vessel, 24 m, 137 m from your
  click, 3.1 knots."* Identity, type, speed, and the offset between where the
  radar saw it and where AIS said it was.
- **Unmatched** — *"No AIS contact within 500 m at 05:32:14 UTC."*

A **confidence figure** sits beside every verdict: *"AIS coverage for this
scene: 94% (16 of 17 vessels GFW recorded as fishing here appear in the Danish
record)."* The app measures its own blind spots and says so.

A second tab, **Observation**, shows how often this site — and, for contrast,
a UNESCO World Heritage site in West Africa — is actually imaged from orbit,
and the probability that a fishing trip of *N* days goes entirely unseen.

That is the whole product. Everything below is how.

---

## 2. Scope

### In scope (phase 1 + phase 3)

| # | Capability |
|---|---|
| 1 | Map with basemap, site boundary, scene-pinned Sentinel-1 layer |
| 2 | Scene picker, ordered by activity |
| 3 | Click → nearest AIS snapshot within radius → matched / unmatched |
| 4 | Vessel identity panel with offset and interpolation detail |
| 5 | AIS layer toggle (off by default) and "reveal all" |
| 6 | Confidence ratio per scene, from GFW fishing events |
| 7 | GFW fishing-activity layer (toggle) |
| 8 | Optional Sentinel-2 true-colour layer where a clear scene exists |
| 9 | Observation tab: pass timeline, gap statistics, trip-unseen probability |
| 10 | README + DECISIONS.md, deployed on Vercel |

### Out of scope (explicitly)

| Excluded | Why |
|---|---|
| Any backend server | Nothing needs one. See section 4. |
| User accounts, login | Public demo. Supabase Auth is a trap. |
| Real-time or live data | Retrospective by design. |
| Automatic vessel detection on the radar image | Phase 2. The human is the detector. |
| Gap-event "who might this be" join | GFW has **zero** gap events here. Cut on 14 Sept. |
| Sites other than Hirsholmene | Data is ingested for one site. Selector can be added later. |
| Mobile layout | Desktop only. Do not spend time on it. |

---

## 3. Vocabulary

| Term | Meaning here |
|---|---|
| **Scene** | One Sentinel-1 acquisition covering the site. Identified by product name; has an exact start/end timestamp. |
| **Acquisition instant** (`acq_mid`) | Midpoint of the scene's start and end. All AIS is interpolated to this second. |
| **Snapshot** | A vessel's interpolated position at the acquisition instant. |
| **Site** | The Natura 2000 polygon DK00FX113, from `natura_sites.geojson`. |
| **Box** | The padded rectangle used for ingestion: `10.321, 57.230 → 10.767, 57.686`. |
| **Matched / Unmatched** | Whether a snapshot exists within the matching radius of the click. |
| **Confidence** | Fraction of GFW-confirmed fishing vessels also present in Danish AIS for that scene. |

### 3.1 Site and box — the two geometries, and why there are two

Every piece of logic in this application asks one of two different
questions, and each has its own shape:

- **"Is this inside the protected area?"** — a *legal* question. Answered by
  the **site**.
- **"Do we have data for this place?"** — a *data* question. Answered by the
  **box**.

Confusing them produces wrong numbers silently. This subsection exists so
nobody does.

#### Where the site comes from

The **site** is the official boundary of Natura 2000 site **DK00FX113**,
*"Hirsholmene, havet vest herfor og Ellinge Å's udløb"* — the Hirsholmene
islands, the sea west of them, and the mouth of the Elling river. It is an
**irregular polygon**, drawn by the Danish authorities and published by the
European Environment Agency.

It was retrieved by `natura_sites.py` from the EEA's public map service
(`bio.discomap.eea.europa.eu/.../Natura2000Sites`), saved into
`natura_sites.geojson`, and the single DK00FX113 feature is copied to
`public/site.geojson` for the app. Area **95 km²**. Its tightest enclosing
rectangle is `10.441, 57.350 → 10.647, 57.566` — about 12 × 24 km — but
**the polygon does not fill that rectangle**; there is water and coast inside
the rectangle that is *not* protected.

#### Where the box comes from

The **box** is that enclosing rectangle **padded by 0.12° on every side**:

```
west  = 10.441 − 0.12 = 10.321        east  = 10.647 + 0.12 = 10.767
south = 57.350 − 0.12 = 57.230        north = 57.566 + 0.12 = 57.686
```

That gives roughly **27 km east–west × 51 km north–south, 1,380 km²** —
about 14 times the site. It is defined once, in `ingest.py`, and copied
verbatim into `ingest_gfw.py` and `ingest_passes.py`.

It is padded for four reasons:

1. **Vessels approach and leave.** A trawler 3 km outside the boundary at
   the acquisition instant may have been inside an hour earlier. The
   interesting behaviour happens at the edge, not just deep inside.
2. **A radar return just outside the line still deserves an answer.** If
   the user clicks a bright dot 500 m beyond the boundary, "no data" would be
   wrong; "matched, KAREN MARIE, outside the site" is right.
3. **The map needs context.** A viewport showing only the polygon would be
   unreadable — no coastline, no harbour, no sense of place.
4. **Satellite catalogue queries need a region**, and a rectangle is what
   the catalogue accepts.

#### The picture

North is up. Not to scale, but the relationships are right.

```
  10.321                                                         10.767
   +---------------------------------------------------------------+ 57.686
   |                                                               |
   |   BOX  --  everything the ingestion scripts keep              |
   |                                                               |
   |  mainland                                                     |
   |  coast |                                                      |
   |        |          . . . . . . . . . . . . . . . .   57.566    |
   |        |          .      ______________         .             |
   | Elling |          .   __/              \__      .             |
   |   A ---+----------.--/    SITE            \     .             |
   |        |          . |   (the polygon,      |    .             |
   |        |          . |    DK00FX113)   o o  |    .             |
   |        |          . |                o o o |    . <-- site's  |
   |        |          . |   sea west of   o o  |    .   enclosing |
   |        |          .  \__ the islands _____/     .   rectangle |
   |        |          .     \___     __/            .             |
   |        |          .         \___/               .             |
   |        |          .                             .             |
   | Frederikshavn ### .   <-- inside the rectangle, .             |
   |   harbour     ### .       OUTSIDE the polygon   .             |
   |        |          . . . . . . . . . . . . . . . .   57.350    |
   |        |                                                      |
   |        |     x  <-- a vessel here is in the box, not the site |
   |        |                                                      |
   +---------------------------------------------------------------+ 57.230

        o o  = the Hirsholmene islands     ###  = harbour
```

The one thing to take from the picture: **Frederikshavn harbour sits inside
the site's enclosing rectangle but outside the site polygon.** A ferry moored
there is "in the box" and "in the rectangle" but **not** "in the site". Only
the polygon test gets that right — which is why the app never uses the
rectangle for anything.

#### The concrete consequence you have already seen

`rank_sites.py` tested every AIS position against the **polygon** and found
**11–28 vessels** a day at Hirsholmene. `ingest.py` kept every position in
the **box** and found **70–125 vessels** at each acquisition instant. Same
days, same data. The difference is Frederikshavn harbour, the ferry
approaches, and the pleasure craft along the coast — all inside the box, none
inside the site.

Neither number is wrong. They answer different questions.

#### Which geometry each operation uses

| Operation | Geometry | Why |
|---|---|---|
| `ingest.py` — which AIS rows to keep | **box** | Data question. Keep the surroundings. |
| `ingest_gfw.py` — which GFW events to fetch | **box** | Data question. |
| `ingest_gfw.py` — the `inside_site` flag on each event | **site** | Legal question, stored per row. |
| `ingest_passes.py` — catalogue query region | **box** | The catalogue wants a rectangle. |
| `rank_sites.py` — choosing the site | **site** | Only what is inside the polygon counts. |
| Map: initial view and pan limits | **box** | Context. |
| Map: Sentinel-1 tiles | **viewport** | Whatever is on screen; roughly the box. |
| Click → nearest snapshot | **box** | Every snapshot is a candidate, inside or out. |
| Verdict panel: *"Inside Natura 2000 site: yes / no"* | **site** | Point-in-polygon on the click. |
| AIS markers: white ring | **site** | Point-in-polygon on each snapshot. |
| Scene picker: fishing count | **site** | Otherwise every scene looks equally busy. |
| Confidence ratio: which GFW vessels count | **site** by default | See section 17; can be switched to box. |
| Observation tab: pass statistics | **box** | A pass either covers the area or it doesn't. |

Rule of thumb for Claude Code: **if the output is shown to the user as a
fact about protection, use the polygon. If it decides what data to load or
draw, use the box.**

---

## 4. Architecture

```
  Browser (React + MapLibre)
     │
     ├──► Supabase (Postgres, read-only anon key)   ← all AIS, GFW, scene, pass data
     ├──► Sentinel Hub WMS (CDSE instance)           ← radar / optical tiles
     └──► Basemap tiles (Carto or OSM)               ← coastlines
```

**There is no server.** Every piece of data the app reads was produced
offline by the ingestion scripts and loaded into Supabase. The browser talks
to three services directly. This is deliberate and should be written up in
`DECISIONS.md`: precompute everything, keep the browser dumb, deploy static.

A server returns only when phase 2 needs raw pixels.

### Stack — fixed

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite + React + TypeScript** | `npm create vite@latest sonar -- --template react-ts` |
| Map | **maplibre-gl** | Raster sources for WMS and basemap; GeoJSON source for site and markers |
| Data | **@supabase/supabase-js** | Read-only; anon key in env |
| Charts | **recharts** | Observation tab only |
| Styling | Plain CSS, one file | No Tailwind, no component library. Dark theme. |
| Hosting | **Vercel** | Git-push deploy |

No state library. No router — two tabs are a `useState`.

---

## 5. Data — what already exists

All produced by scripts in this repository and loaded into Supabase. The app
**never writes.**

### 5.1 Tables

`scenes` — one per Sentinel-1 acquisition
```
scene_id, product_name, acq_start, acq_end, acq_mid, site_code,
bbox_w, bbox_s, bbox_e, bbox_n, n_positions, n_vessels
```

`vessels` — one per MMSI ever seen
```
mmsi, name, imo, callsign, ship_type, length_m, width_m, mobile_class
```

`positions` — raw AIS in the ±90 min window, per scene. **Not loaded into
Supabase in phase 1** — 927k rows, ~80 MB, and the UI never reads it. The
CSV stays in the repository for phase 2.
```
scene_id, mmsi, t, lat, lon, sog, cog, heading, nav_status
```

`snapshots` — **the table the app lives on**
```
scene_id, mmsi, lat, lon, sog, cog, method, dt_before_s, dt_after_s
```
`method` is `interpolated` (both neighbours within 20 min) or `nearest`
(one neighbour only). `dt_*_s` are seconds to the AIS reports used.

`gfw_fishing_events` — Global Fishing Watch apparent-fishing events
```
event_id, start, end, lat, lon, inside_site, mmsi, vessel_name, flag,
gfw_vessel_id, avg_speed_kn, distance_km, dist_port_km, dist_shore_km,
mpa_tags, site_code
```

`satellite_passes` — for the Observation tab (produced by `ingest_passes.py`)
```
site_code, site_label, mission, product_name, acq_start, cloud_pct
```
Two sites: `DK00FX113` (Hirsholmene) and `BIJAGOS`. Missions `S1` and `S2`.
`cloud_pct` is null for S1.

### 5.2 Static assets (in `public/`)

- `site.geojson` — the DK00FX113 feature only, extracted from
  `natura_sites.geojson`.
- `bijagos.geojson` — a simple rectangle `-17.0, 10.5 → -15.3, 11.8`, used
  only for a small inset on the Observation tab.

### 5.3 Facts the code may rely on

- Timestamps in Supabase are `timestamptz`, UTC. **Display everything in UTC
  with the suffix "UTC".** Never convert to local time.
- `snapshots` per scene: 10–40 rows. Load the whole set for a scene in one
  query. Do not paginate.
- `gfw_fishing_events`: ~1,000–2,000 rows total. Load once at startup.
- `satellite_passes`: ~1,000 rows total. Load once when the tab opens.
- Vessel `ship_type` values seen: Fishing, Cargo, Tanker, Passenger,
  Pleasure, Sailing, SAR, Pilot, Tug, HSC, Military, Other, Undefined, "".

---

## 6. External services and credentials

### 6.1 Supabase

Project ref `zpinfxbjagdxcydxrmfy`, region EU Central.

| Env var | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://zpinfxbjagdxcydxrmfy.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon (publishable) key from Settings → API |

The anon key is public by design. **The service_role key never appears
anywhere in this repository or in Vercel.**

### 6.2 Sentinel Hub (Copernicus Data Space Ecosystem) — must be set up

This is the one credential not yet created. Steps:

1. Register at `dataspace.copernicus.eu` (free).
2. Open the **Sentinel Hub Dashboard** → **Configuration Utility** →
   **New configuration**, based on the **Sentinel-1 template**. Name it
   `sonar`. Note its **Instance ID**.
3. The template already provides two VV layers. **Reuse them; do not create
   a new one:**
   - `IW_VV` — linear gamma0. Sea near-black, hulls saturate white. Maximum
     contrast. **Default.**
   - `IW_VV_DB` — decibel gamma0. Compressed grey ramp; sea shows texture,
     ships bright-grey. Better on windy days or if the coast vanishes.
   Delete the other preset layers (VH, combinations) to keep it readable.
4. Add one layer **`S2_TRUE_COLOR`**: data source *Sentinel-2 L2A*, preset
   *True color*, max cloud coverage 30%.
5. In the configuration settings, if a **domain / referrer restriction**
   field exists, set it to the Vercel domain once known.

| Env var | Value |
|---|---|
| `VITE_SH_INSTANCE_ID` | the Instance ID |
| `VITE_SH_LAYER_S1` | `IW_VV` (switch to `IW_VV_DB` by eye after M3) |
| `VITE_SH_LAYER_S2` | `S2_TRUE_COLOR` |

Instance IDs are intended for client-side use. The risk of exposure is
someone consuming your free quota, not your money. Rotate if that happens.

### 6.3 Basemap tiles — owner's choice, one URL string

Default in code: Carto Dark Matter, because bright radar returns read best on
a dark neutral base.

```
https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
attribution: © OpenStreetMap contributors © CARTO
```

Alternative, if the owner prefers:
```
https://tile.openstreetmap.org/{z}/{x}/{y}.png
attribution: © OpenStreetMap contributors
```

Put the URL and attribution in one constant. Attribution is mandatory either
way and must be visible on the map.

---

## 7. The map and its layers

Initial view: centre `10.55, 57.46`, zoom `11`. Bounds locked loosely to the
padded box (allow ~30 km of pan beyond it). Zoom range 9–14.

Layer order, bottom to top:

| # | Layer | Source | Default | Toggle? |
|---|---|---|---|---|
| 1 | Basemap | raster tiles | on | no |
| 2 | Sentinel-2 true colour | Sentinel Hub WMS | **off** | yes, only enabled if a clear S2 pass exists within ±1 day of the scene |
| 3 | Sentinel-1 radar | Sentinel Hub WMS | **on** | yes |
| 4 | Site boundary | `site.geojson` | on | no |
| 5 | GFW fishing events | Supabase | off | yes |
| 6 | AIS snapshots | Supabase | **off** | yes |
| 7 | Click marker + match line | client state | — | — |

### 7.1 Pinning the radar image to the scene — the critical detail

Sentinel Hub returns whatever imagery exists for the `TIME` range asked. Over
Denmark there are often **two passes on one day**, twelve hours apart. Asking
for a date returns the wrong one half the time, and nothing on screen would
reveal it.

So the WMS request **must** use a two-minute window around the scene:

```
TIME = {acq_start − 60 s}/{acq_end + 60 s}     both ISO-8601, UTC, "Z"
```

Only one acquisition can fall inside that window. The MapLibre raster source
for layer 3 is:

```
https://sh.dataspace.copernicus.eu/ogc/wms/{INSTANCE_ID}
  ?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0
  &LAYERS=S1_VV&FORMAT=image/png&TRANSPARENT=true
  &CRS=EPSG:3857&WIDTH=256&HEIGHT=256
  &BBOX={bbox-epsg-3857}
  &TIME=2026-05-26T05:31:10Z/2026-05-26T05:33:40Z
```

`{bbox-epsg-3857}` is a MapLibre placeholder — it works as a tile template.
Rebuild the source whenever the selected scene changes.

Layer 2 (S2) uses the same pattern with `LAYERS=S2_TRUE_COLOR` and
`MAXCC=30`, and a `TIME` window of the whole calendar day of the nearest
clear pass.

### 7.2 Site boundary

Outline only, 2 px, a warm accent colour, no fill. Label "Natura 2000 ·
DK00FX113 · Hirsholmene" anchored at the polygon's north-east.

### 7.3 AIS snapshots (layer 6)

Circle markers, 6 px:

| Vessel | Colour |
|---|---|
| `ship_type = Fishing` | orange |
| anything else | light grey |
| inside the site polygon | add a 2 px white ring |

Hidden by default — **this is the point of the app.** The user should look at
the radar first and click blind. Two controls in the panel: *Show AIS* toggle
and a *Reveal all* button (same thing, with a small animation of markers
appearing). Clicking a marker directly is a shortcut to the matched panel.

### 7.4 GFW fishing events (layer 5)

Small orange squares at each event position, only events whose
`[start, end]` overlaps the selected scene's day. Tooltip: vessel name, flag,
duration in hours, `inside_site`. Off by default; it is context, not the
subject.

---

## 8. Scene picker

Left panel, top. One row per scene from `scenes`, joined client-side with
`snapshots` and `vessels` to compute a fishing count. **Count only fishing
vessels whose snapshot falls inside the site polygon**, not the padded box —
the box includes Frederikshavn harbour, and counting it would make every
scene look equally busy (70–125 vessels) when the site itself holds 10–30.

```
26 May 2026  05:32 UTC   20 vessels · 14 fishing   ●●●●
11 Aug 2026  17:10 UTC   28 vessels · 15 fishing   ●●●●
01 Apr 2026  05:41 UTC   11 vessels ·  3 fishing   ●
```

**Sort by fishing count descending, not by date.** Activity varies day to
day, and the first scene the user sees should be a busy one. Selecting a
scene: rebuild the S1 source, load its snapshots, clear any click state.

Show beside the list: the scene's product name (small, monospace), and a
one-line note *"Radar acquired at 05:32:14 UTC. AIS interpolated to this
second."*

---

## 9. Click → verdict — the core logic

### 9.1 Algorithm

```
on map click at (lat, lon):
  snaps = snapshots for current scene
  best  = argmin over snaps of haversine(click, snap)
  if best and distance(best) <= RADIUS_M:
      show MATCHED(best)
      draw a thin line from click to best
  else:
      show UNMATCHED(lat, lon, acq_mid)
  also compute in_site = pointInPolygon(click, site.geojson)
```

`RADIUS_M` default **500**, adjustable by a slider **200–1500** in the panel.
The slider is deliberate: dragging it and watching a verdict flip is a
thirty-second lesson in why the radius matters.

Haversine in TypeScript; do not pull in a geo library for one function.
Point-in-polygon: ray casting over the outer ring; ~20 lines.

### 9.2 Matched panel

```
KAREN MARIE                             ← vessels.name, or "(no name broadcast)"
Fishing · DNK · 24 m × 7 m              ← ship_type, flag (from MMSI MID), length × width
MMSI 219012345 · IMO —  · call OZXY

At 05:32:14 UTC
  position  57.4412 N, 10.5537 E
  speed     3.1 kn   course 214°
  method    interpolated (AIS 41 s before, 18 s after)

Offset from your click: 137 m          ← with (i) tooltip, see 9.4
Inside Natura 2000 site: yes
```

Flag from MMSI: first three digits are the Maritime Identification Digits.
Ship a tiny lookup for the ones that occur here (219, 220 = Denmark; 265, 266
= Sweden; 257–259 = Norway; 331 = Greenland; 211 = Germany; 244–246 =
Netherlands; 235 = UK; 227–228 = France). Unknown → show the digits.

### 9.3 Unmatched panel

```
No AIS contact within 500 m
at 05:32:14 UTC, 57.4478 N 10.5921 E

Inside Natura 2000 site: yes

Nearest AIS vessel: 1,240 m away (KAREN MARIE, fishing)
```

Always show the nearest vessel even when outside the radius. The user should
never wonder whether the data is empty.

Then a short fixed explanatory block (collapsible, open by default the first
time):

> *A radar return with no AIS contact means one of three things: the vessel
> was not broadcasting; it was broadcasting and the shore network did not
> receive it; or what you clicked is not a vessel. This tool cannot tell
> which. The confidence figure below estimates how often the second case
> occurs.*

### 9.4 The offset tooltip

> *A moving vessel appears displaced along the satellite's flight direction in
> radar imagery — often by 100–300 m at fishing speeds, more for faster
> ships. An offset of a few hundred metres between the radar return and the
> AIS position is expected, not an error.*

---

## 10. Confidence ratio

Shown once per scene, in the panel header, and repeated under every verdict.

```
gfw_here = gfw_fishing_events where
             start <= acq_mid <= end
             and inside_site = true          (or inside the box; owner's call, default: site)
gfw_mmsi = distinct mmsi of gfw_here
found    = count of gfw_mmsi present in snapshots for this scene
ratio    = found / |gfw_mmsi|
```

Display:

```
AIS coverage for this scene: 94%
16 of 17 vessels that Global Fishing Watch recorded as fishing here at this
moment appear in the Danish AIS record.
```

If `|gfw_mmsi| < 3`: display *"AIS coverage: not measurable for this scene
(fewer than 3 GFW reference vessels)."* Never show a ratio computed from one
or two vessels.

What this measures, stated in the UI's (i) tooltip: *agreement between two
independent AIS sources — Denmark's shore network and GFW's satellite feed —
not absolute truth. A low figure means apparent dark vessels here are likely
reception gaps.*

---

## 11. Observation tab (phase 3)

Second tab. Loads `satellite_passes` once.

### 11.1 Layout

Two columns, one per site: **Hirsholmene (DK00FX113)** and **Bijagós
Archipelago (UNESCO World Heritage)**. Each column has:

1. A one-line description and a tiny inset map (site outline only).
2. **Headline numbers** for the trailing 365 days, Sentinel-1:
   passes, average interval, median gap, longest gap.
3. **Timeline strip** — 365 px wide, one tick per pass, S1 in one colour, S2
   (cloud < 20%) in another. Gaps are visible as empty stretches.
4. **Trip-unseen probability** — *the interactive.* A slider "a fishing trip
   of N days" (1–10). For each N, compute the fraction of all N-day windows
   in the year that contain **no** S1 pass. Display as a percentage, both
   sites side by side, updating live.

### 11.2 The computation

```
passes = sorted acq_start for site, mission S1, last 365 days
for N in 1..10:
  windows = every start hour h in the year, window [h, h + N days)
  unseen  = count of windows with no pass inside
  p[N]    = unseen / len(windows)
```

Hourly resolution over a year is 8,760 windows × ~400 passes — trivial in the
browser. Precompute all ten N on load.

Expected shape, from measurements already made: Hirsholmene ≈ 0% unseen by
N=4; Bijagós still ≈ 30–40% unseen at N=4. That contrast is the argument.

### 11.3 The sentence under the chart — fixed copy

> *In the Kattegat, a vessel cannot work unseen: radar passes almost daily,
> AIS is received by shore stations, and trawling inside the protected area
> continues — legally. Observation is not the constraint; enforcement is. In
> the Bijagós, a UNESCO World Heritage site, radar passes every four to seven
> days and no AIS receiver exists within 400 km. Observation itself is the
> gap. Two protected sites, two different failures — and only one of them is
> a problem that better sensors can fix.*

---

## 12. Build order — milestones for Claude Code

Each milestone is one session. **Done when** is the acceptance test.

| M | Build | Done when |
|---|---|---|
| **M0** | Vite + React + TS scaffold. `.env.example` with the five vars. Supabase client. One query that logs the count of `scenes`. Deploy an empty page to Vercel. | The Vercel URL loads and the browser console shows `scenes: 12`. |
| **M1** | MapLibre map with basemap, initial view, zoom bounds, attribution. Site boundary from `site.geojson` with label. | The Hirsholmene outline is visible on a dark map at the right place. |
| **M2** | Scene picker from `scenes` + `snapshots` + `vessels`, sorted by fishing count. Selecting a scene loads its snapshots into state. | Clicking a scene logs its snapshot count; list is sorted with the busiest first. |
| **M3** | Sentinel-1 WMS layer pinned to the selected scene (section 7.1). Toggle. | Changing scene changes the radar image; bright dots visible on black water; the URL in the network tab contains the two-minute `TIME` window. |
| **M4** | Click → nearest snapshot → matched / unmatched panels (section 9). Radius slider. Match line. In-site flag. | Clicking a bright dot inside the boundary yields a plausible vessel; clicking open water yields unmatched with nearest-vessel distance; moving the slider flips a borderline case. |
| **M5** | AIS layer (hidden by default), Show AIS toggle, Reveal all, marker click shortcut. Flag lookup. Offset tooltip. | With AIS hidden, a blind click on a bright dot matches; Reveal shows the marker under it. |
| **M6** | GFW fishing events layer and the confidence ratio (section 10). | The panel header shows a ratio with the "n of m" sentence, or the "not measurable" message, per scene. |
| **M7** | Optional Sentinel-2 layer, enabled only when a clear pass exists near the scene date. | For a May/June scene the S2 toggle is active and shows a photo; for a February scene it is disabled with a tooltip saying why. |
| **M8** | Observation tab (section 11) with both sites, timeline strips, headline numbers, N-day slider. | Slider at N=4 shows near 0% for Hirsholmene and a clearly higher figure for Bijagós; numbers match `PROJECT_CONTEXT.md`. |
| **M9** | README, DECISIONS.md, attribution footer, favicon, 60–90 s screen recording. | A stranger can read the README in two minutes and open the live link. |

If time runs short, the order to cut from the end: **M7, then M8.** Never
ship without M4–M6.

---

## 13. UI layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  SONAR   Hirsholmene · Kattegat            [ Map ] [ Observation ]   │
├──────────────────┬───────────────────────────────────────────────────┤
│ SCENES           │                                                   │
│ ● 26 May 05:32   │                                                   │
│   20 · 14 fish   │                                                   │
│ ● 11 Aug 17:10   │              MAP                                  │
│   28 · 15 fish   │        (radar over dark basemap,                  │
│ ● ...            │         site outline, markers)                    │
│                  │                                                   │
│ LAYERS           │                                                   │
│ [x] Radar S1     │                                                   │
│ [ ] Optical S2   │                                                   │
│ [ ] AIS vessels  │                                                   │
│ [ ] GFW fishing  │                                                   │
│  Reveal all      │                                                   │
│                  │                                                   │
│ RADIUS  ──●── 500 m                                                  │
│                  │                                                   │
│ VERDICT          │                                                   │
│ (matched /       │                                                   │
│  unmatched panel)│                                                   │
│                  │                                                   │
│ AIS coverage 94% │                                                   │
├──────────────────┴───────────────────────────────────────────────────┤
│ Data: Copernicus Sentinel-1/2 · Danish Maritime Authority · Global   │
│ Fishing Watch · EEA Natura 2000 · © OpenStreetMap © CARTO            │
└──────────────────────────────────────────────────────────────────────┘
```

Left panel fixed width 320 px, scrollable. Map fills the rest. Dark theme
throughout: background `#0b0e14`, panel `#131720`, text `#e6e8ee`, accent
orange `#f5a524` for fishing and the site outline, muted `#8a90a0` for
secondary text. No gradients.

---

## 14. Non-functional requirements

- **Performance:** first map paint under 2 s on a normal connection. Radar
  tiles are the only slow thing; show a thin loading bar while they arrive.
- **Determinism:** the same click on the same scene always gives the same
  verdict. No randomness, no time-of-day behaviour.
- **UTC everywhere.** Every displayed timestamp ends in "UTC".
- **Attribution** visible at all times (footer). Required by every data
  licence used.
- **No console errors** in production build.
- **Accessibility:** keyboard-selectable scenes; verdict panel is a live
  region. Nothing more.
- **Browser:** current Chrome and Firefox. Nothing else tested.

---

## 15. Repository

```
sonar/
├── README.md
├── DECISIONS.md            ← from JOURNAL.md, edited
├── SPEC.md                 ← this file
├── PROJECT_CONTEXT.md
├── data/                   ← ingestion scripts, not deployed
│   ├── bijagos_spike.py
│   ├── dma_check.py
│   ├── natura_sites.py
│   ├── rank_sites.py
│   ├── ingest.py
│   ├── ingest_gfw.py
│   ├── ingest_passes.py
│   └── out/                ← CSVs + schema.sql (committed; small)
├── public/
│   ├── site.geojson
│   └── bijagos.geojson
├── src/
│   ├── main.tsx
│   ├── App.tsx             ← tabs
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── geo.ts          ← haversine, pointInPolygon, midFlag
│   │   └── wms.ts          ← builds Sentinel Hub URLs
│   ├── map/
│   │   ├── Map.tsx
│   │   └── layers.ts
│   ├── panel/
│   │   ├── ScenePicker.tsx
│   │   ├── Layers.tsx
│   │   ├── Verdict.tsx
│   │   └── Confidence.tsx
│   └── observation/
│       ├── Observation.tsx
│       └── unseen.ts       ← the N-day computation
├── .env.example
└── vercel.json             ← not needed for a Vite SPA; omit unless required
```

---

## 16. README — required structure

1. **One sentence** and a screenshot with a verdict open.
2. **Why I built this** — in the owner's own words. Three or four sentences.
3. **What it does** — section 1 of this spec, condensed.
4. **Try it** — the live URL, and "pick the 26 May scene, click the bright
   dot at the north end of the site".
5. **What the data says** — measured facts only: 317 radar passes a year
   over Hirsholmene versus 90 over the Bijagós; 15 fishing vessels inside a
   95 km² protected site on a single day; **293 apparent-fishing events by
   45 vessels inside the site in 18 months, every one tagged by Global
   Fishing Watch as inside a marine protected area, 94% Danish-flagged**;
   the AIS coverage figure.
6. **What it cannot do** — resolution limits, azimuth displacement, the
   three meanings of "unmatched", GFW's near-port false positives, and the
   prior art (Paolo et al., *Nature* 2024).
7. **How it's built** — the no-server diagram from section 4, one paragraph.
8. **Data sources and licences** — five lines.
9. **Built with AI assistance** — one honest paragraph: what the tools did,
   what the author decided. Link to `DECISIONS.md`.
10. **Run it yourself** — clone, `.env`, `npm i`, `npm run dev`. Note that
    the ingestion scripts are included and documented.

---

## 17. Decisions left to the owner

| Decision | Default in code | Change by |
|---|---|---|
| Basemap: Carto Dark Matter or OSM | Carto | one constant in `layers.ts` |
| Confidence computed over site polygon or padded box | site polygon | one flag in `Confidence.tsx` |
| Default matching radius | 500 m | one constant |
| App name and tagline | **"Danish Herring"** (decided 15 Sept — "Sonar" was acoustic, this is radar; and a red herring is exactly what the tool helps you rule out) | `App.tsx` |
| UI language | English | — |

---

## 18. Risks and their mitigations

| Risk | Mitigation |
|---|---|
| Sentinel Hub instance not created in time | M3 is blocked without it. Create it before starting M0. |
| Sentinel Hub free quota exhausted by tile requests | Cap zoom at 14; cache-bust nothing; one instance per environment. |
| Danish AIS day for a scene has expired from the rolling window | Irrelevant at runtime — data is already in Supabase. Keep `out/` committed. |
| Supabase free project pauses after 7 days idle | The demo itself generates reads. If paused, one click in the dashboard resumes it. |
| A scene's radar image is mostly clutter (rough sea) | Sort by fishing count puts busy, usually calm, days first. Owner reviews the 12 and can drop any in `scenes.csv`. |
| Confidence ratio has < 3 GFW vessels on most scenes | Fall back to the box instead of the polygon (section 17). |

---

## 19. Open questions for the owner

1. Do you want the **Kims Top single-trawler day** (26 May, 10,437 reports at
   trawling speed) mentioned on the Observation tab as an anecdote, or kept
   for the README only?
2. The app name: keep **Sonar**, or something referencing the site?
3. Should the **Reveal all** button be prominent (a real button) or
   discreet (a link)? The demo is stronger if the user tries blind first.

---

*End of specification.*
