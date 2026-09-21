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
| 11 | Progress counter: the in-site fishing vessels of the scene, and how many the user has found |

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

`scenes` — one per Sentinel-1 acquisition, footprint-verified to cover the site
```
scene_id, product_name, acq_start, acq_end, acq_mid, site_code,
bbox_w, bbox_s, bbox_e, bbox_n, n_positions, n_vessels,
n_in_site, n_fishing_in_site, n_trawling_in_site
```
The last three are counted inside the **site polygon** at the acquisition
instant. `n_vessels` is the padded box and includes the harbour.

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
event_id, start, end, lat, lon, bbox_w, bbox_s, bbox_e, bbox_n,
inside_site, mmsi, vessel_name, flag, gfw_vessel_id, avg_speed_kn,
distance_km, dist_port_km, dist_shore_km, mpa_tags, site_code
```
`bbox_*` (added 16 Sept) is the rectangle the vessel stayed inside during the
event — the honest shape to draw for a multi-hour activity.

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

### 6.3 Basemap — owner's choice, one URL string

Default in code (decided at M1, 15 Sept): **OpenFreeMap dark style**, a
vector style served free with no key or account. Bright radar returns read
best on a dark neutral base.

```
style: https://tiles.openfreemap.org/styles/dark
attribution: © OpenFreeMap © OpenMapTiles · Data from OpenStreetMap
```
(That is the wording OpenFreeMap asks for; the provider's own request wins.)

Carto Dark Matter was the original default; it began requiring an API key in
September 2026 and was replaced rather than adding a sixth credential.

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
| 2 | Sentinel-2 true colour | Sentinel Hub WMS | **off** | yes, only enabled if a clear S2 pass exists within ±1 day of the scene; exclusive with layer 3 (13.13) |
| 3 | Sentinel-1 radar | Sentinel Hub WMS | **on** | yes; exclusive with layer 2 (13.13) |
| 4 | Site boundary | `site.geojson` | on | no |
| 5 | GFW fishing events | Supabase | off | yes |
| 6 | AIS snapshots | Supabase | **off** | yes |
| 7 | Click marker + match line | client state | — | — |

Layers 2 and 3 are **mutually exclusive** (21 Sept, 13.13): one imagery
layer is drawn at a time, or neither.

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

Markers are **small triangles rotated to `cog`** (about 10 px), so a vessel
reads as a vessel and shows its heading. When `sog` < 0.5 kn the heading is
meaningless — draw a 6 px circle instead. No boat icons: at this size they
are blobs that encode nothing.

| Vessel | Colour |
|---|---|
| `ship_type = Fishing` | orange |
| anything else | light grey |
| inside the site polygon | add a 2 px white ring |
| **the matched vessel** | **always drawn, even with the AIS layer hidden** — larger, white outline, so the match line from the click ends on a symbol, not in open water |

The gap between a bright radar dot and its AIS marker is expected and
informative (section 9.4): moored vessels sit almost on their dot, moving
ones are displaced along the satellite's track. Do not "correct" it.

**Legend** (added 16 Sept): a collapsible block at the bottom of the Layers
section, closed by default, titled *Symbols*. One line each: orange triangle
— fishing vessel under way; orange dot — fishing vessel stopped; blue —
any other vessel; white ring — inside the protected site; large with white
edge — your match. Nothing else.

Non-fishing colour is light blue `#4fb3ff` (changed from grey at M5b — grey
vanished over bright harbour clutter).

Hidden by default — **this is the point of the app.** The user should look at
the radar first and click blind. One control in the panel: the *AIS fishing
vessels* toggle, which fades the markers in one after another each time it is
switched on. (The separate *Reveal all* button was removed 21 Sept — 13.13.)
Clicking a marker directly is a shortcut to the matched panel.

### 7.4 GFW fishing events (layer 5)

Small orange squares at each event position, only events whose
`[start, end]` overlaps the selected scene's day. Tooltip: vessel name, flag,
duration in hours, `inside_site`. Off by default; it is context, not the
subject.

---

## 8. Scene picker

Left panel, top. One row per scene from `scenes`. **Since 15 September the
counts are precomputed at ingestion** — `n_in_site`, `n_fishing_in_site`,
`n_trawling_in_site` — from the Danish data at the acquisition instant,
inside the site polygon. Read them; do not recompute client-side. **Sort by
`n_trawling_in_site` descending, then `n_fishing_in_site` descending, then
date** — vessels caught at trawling speed inside the boundary are the
strongest opening, ahead of a larger number merely transiting. (Corrected
16 Sept; the earlier rule had the two keys reversed.)

The scene list should be a **scrollable box of about six rows** with its own
scrollbar, so that Layers, Radius and the Verdict below it stay visible
without the page scrolling itself.

Every scene in the table now has radar over the site (footprint-verified)
and at least three fishing vessels inside the boundary at the instant.
Fourteen scenes, 13 August – 8 September 2026. The row format:

```
02 Sep 2026  05:31 UTC   6 fishing inside · 4 at trawling speed   ●●●●
01 Sep 2026  05:40 UTC   5 fishing inside · 4 at trawling speed   ●●●●
31 Aug 2026  17:01 UTC   7 fishing inside · 0 at trawling speed   ●●●
```

"*at trawling speed*", not "*trawling*": the count is fishing vessels
between 2 and 5 knots at the instant, a speed band applied to a
self-declared vessel type, not an observed gear deployment. The phrase
carries a native tooltip — *"Fishing vessel moving at 2–5 knots at this
instant — working speed. A speed band, not a confirmed gear type."* — in
the manner of the activity dots, not a further (i).

Activity varies day to day, and the first scene the user sees should be a
busy one. Selecting a scene: rebuild the S1 source, load its snapshots,
clear any click state.

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
  speed     3.1 kn (trawling speed)   course 214°   ← orange, see below
  method    interpolated (AIS 41 s before, 18 s after)

Offset from your click: 137 m          ← with (i) tooltip, see 9.4
Inside Natura 2000 site: yes
```

When the matched vessel's `ship_type` is Fishing **and** its `sog` is
between 2 and 5 knots, the speed is drawn in the accent orange with
*"(trawling speed)"* appended, carrying the section-8 tooltip. Both
conditions are required, as in `n_trawling_in_site`: a cargo vessel at
3 knots is manoeuvring, and highlighting it would contradict the count.

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

## 10. Two sources at the instant — replaces the confidence ratio

**Superseded on 16 September.** The ratio was designed for volunteer AIS
with reception holes. The Danish Maritime Authority's shore network is the
official record; measuring its "coverage" against GFW's sparser satellite
feed is near-100% by construction, and with the strict at-the-instant rule
only one scene in fourteen was even measurable. The word *coverage* and the
phrase *"fewer than 3 reference vessels"* were both misleading. Removed.

### 10.1 Per scene — two independent counts, no ratio

Shown once under the scene details (where M6 placed the old line):

```
At 05:31 UTC inside the site
  Danish AIS      6 fishing vessels
  Global Fishing  2 in a recorded fishing event
```

```
danish = snapshots for scene, inside site polygon, vessels.ship_type = Fishing
gfw    = gfw_fishing_events where start <= acq_mid <= end and inside_site
```

Always displayable. Zero is a result, not an error. The (i) tooltip:

> *Two independent records of the same moment. The Danish figure is every
> fishing vessel broadcasting AIS inside the boundary, received by shore
> stations. The GFW figure is how many of those were, at that second, inside
> a fishing event that Global Fishing Watch's classifier recognised from its
> satellite AIS. GFW sees fewer because it counts only sustained, recognised
> fishing behaviour, from a sparser feed.*

The "no contact" explanatory block (section 9.3) must no longer point to a
confidence figure. Replace its last sentence with: *"The AIS here is the
Danish Maritime Authority's official shore network; a missing contact most
likely means the vessel was not broadcasting, or what you clicked is not a
vessel."*

### 10.2 Per matched vessel — what GFW says it did (M6b)

When a vessel is matched, query `gfw_fishing_events` for that MMSI:

**Around the pass** — events whose window overlaps `acq_mid ± 6 h`:

```
Transiting at 17:01 UTC.
GFW recorded this vessel fishing 17:42 → 21:15, 6 km north-east.
```
or
```
GFW fishing event in progress since 03:50 UTC (1 h 41 min so far).
```
or, if none: *"No GFW fishing event within 6 hours of this pass."*

(±6 h, not ±90 min: the fleet leaves harbour 17:00–18:00 and fishes through
the night, so an evening-pass vessel's event often starts two or three hours
later; a morning-pass trawler's event began around 02:00–03:00. The line
shows the actual times, so a wide window is not misleading.)

**History** — all events for the MMSI in the table:

```
GFW: 23 fishing events for this vessel in 18 months · 9 inside the site.
```

Both lines sit in the matched panel under the offset. Distance is from the
snapshot to the event's centre point; direction as an 8-point compass.

### 10.3 The GFW layer — rectangles, not squares (M6b)

Replace the point squares with each event's **bounding box** (`bbox_w/s/e/n`,
added to the table 16 Sept): a thin dashed orange rectangle, no fill, with
the small square kept at the centre. Tooltip unchanged. This says honestly
*"this vessel fished somewhere in here for 4.3 h."*

When a vessel is matched, **its** events within ±6 h are drawn even if
the layer is off — same rule as the matched marker — so the story in 10.2
is visible on the map. This is the default experience: layer off, nothing
from GFW on the map until a vessel is matched, then only that vessel's
events. Ticking the layer is the opt-in "show me everything" view; when it
is on and a vessel is matched, draw that vessel's rectangles at full
opacity and the rest at ~40% so they stand apart.

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

Measured, footprint-verified, trailing 365 days (15 Sept 2026): Hirsholmene
**209** Sentinel-1 passes (one every ~1.7 days); Bijagós core **31** (one
every ~12 days). Expected shape: Hirsholmene ≈ 0% unseen by N=4; Bijagós
still well above 50% unseen at N=4. That contrast is the argument.

### 11.3 The sentence under the chart — fixed copy

> *In the Kattegat, a vessel cannot work unseen for long: radar passes on
> average every 1.7 days from several tracks, morning and evening, AIS is
> received by shore stations, and trawling inside the protected area
> continues — legally. Observation is not the constraint; enforcement is. In
> the Bijagós, a UNESCO World Heritage site, one satellite on one track
> images the core once every twelve days, and no AIS receiver exists within
> 400 km. Observation itself is the gap. Two protected sites, two different
> failures — and only one of them is a problem that better sensors can fix.*

(Figures updated 16 Sept from the footprint-verified passes: 209 vs 31; at
N=4, 9% vs 66% unseen. The Bijagós median and longest gap are both exactly
12.0 days — the Sentinel-1 repeat cycle — which is what "one track, one
satellite" looks like in data.)

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
| **M5** | AIS layer (hidden by default), Show AIS toggle, Reveal all, marker click shortcut. Flag lookup. Offset tooltip. (*Reveal all* removed 21 Sept — 13.13.) | With AIS hidden, a blind click on a bright dot matches; Reveal shows the marker under it. |
| **M6** | GFW fishing events layer and the confidence ratio (section 10 as originally written). | Built 16 Sept; ratio then superseded. |
| **M6b** | Section 10 as rewritten: two-count line per scene (10.1), per-vessel GFW context and history (10.2), event bounding-box rectangles and matched-vessel events always drawn (10.3). Reword the 9.3 block. | Matching a vessel on the 31 Aug scene shows a "GFW recorded this vessel fishing …" line and a dashed rectangle appears on the map; the scene line reads two counts with no percentage. |
| **M7** | Optional Sentinel-2 layer, enabled only when a clear pass exists near the scene date. | For a May/June scene the S2 toggle is active and shows a photo; for a February scene it is disabled with a tooltip saying why. |
| **M8** | Observation tab (section 11) with both sites, timeline strips, headline numbers, N-day slider. | Slider at N=4 shows near 0% for Hirsholmene and a clearly higher figure for Bijagós; numbers match `PROJECT_CONTEXT.md`. |
| **M9** | README, DECISIONS.md, attribution footer, favicon, 60–90 s screen recording. | A stranger can read the README in two minutes and open the live link. |

If time runs short, the order to cut from the end: **M7, then M8.** Never
ship without M4–M6.

---

## 13. UI layout — v1 (16 September; v0 tagged `v0-mvp`)

v0 put setup, action and result in one 320 px column. Reviewed live: the
verdict sat below the fold, the scene list occupied the top permanently, and
at narrower windows the fixed initial view opened on Jutland's fields with
the site pushed to the edge. v1 separates the three jobs into the three
places the eye expects them. **No logic changes** — every component exists;
this is placement.

### 13.1 The three principles

- **Progressive disclosure** — a control appears when it becomes relevant.
- **Result beside the action** — the answer to a click appears where the
  eye already is, not down a sidebar.
- **Map furniture on the map** — layers and legend belong to the map,
  top-right, collapsible, as on every map product people already know.

### 13.2 The layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ DANISH HERRING  Hirsholmene · Kattegat   ◀ 02 Sep 05:31 UTC ▾ ▶   Map │ Observation
│ S1C_IW_GRDH_… · acquired 05:31:38 UTC · in site: Danish AIS 6 · GFW 2  │
├────────────────────────────────────────────────────────┬───────────────┤
│                                              ┌───────┐ │ VERDICT     ✕ │
│                                              │Layers▾│ │               │
│                                              └───────┘ │ KAREN MARIE   │
│                   ( trawler  2 / 6 )                   │               │
│                     MAP — full width                   │ Fishing · DNK │
│                                                        │ 05:31:38 UTC  │
│      ┌──────────────────────────────────────┐          │ 3.1 kn · 214° │
│      │ click a bright dot inside the orange │          │ offset 137 m  │
│      │ line — first visit only              │          │ in site: yes  │
│      └──────────────────────────────────────┘          │               │
│                                                        │ GFW: fishing  │
│                                                        │  since 03:50  │
│                                                        │ 23 events ·   │
│                                                        │  9 in site    │
│                                                        │               │
│                                                        │ radius ─●─ 500│
├────────────────────────────────────────────────────────┴───────────────┤
│ Data: Copernicus Sentinel-1/2 · DMA · GFW · EEA Natura 2000 · OpenFreeMap │
└────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Top bar — setup

Two rows, full width, fixed.

**Row 1.** Title left. Centre: the **scene stepper** — `◀`, the current
scene as `02 Sep 2026 · 05:31 UTC · 6 fishing · 4 at trawling speed ●●●●`,
`▶`. The
scene text is a button that opens a dropdown listing all scenes in the
section-8 order, same row format. `←` / `→` keys step. Right: the two tabs.

**Row 2**, smaller and muted: product name in monospace · *"acquired
05:31:38 UTC — AIS interpolated to this second"* · the two-count line from
10.1 in one line: *"in site: Danish AIS 6 fishing · GFW 2 in event"*. The
(i) tooltips from 10.1 stay on this row.

The 14-row list is gone from permanent view. The user chooses once.

### 13.4 Map — full width, fitted to the site

The map fills everything between the top bar and the footer, minus the
inspector when open. **Initial view: `fitBounds` on the site polygon's
bounds with 60 px padding**, recomputed on window resize — never a fixed
centre and zoom. Zoom limits 9–14 stay. Zoom control top-right as now.

**Layers card** floats top-right, directly under the zoom control, 220 px
wide, dark panel colour at 92% opacity. Collapsed it shows only `Layers ▾`.
Expanded: Radar Sentinel-1, Optical Sentinel-2 (with its date/cloud note or
disabled reason), AIS fishing vessels and GFW fishing events (names revised
21 Sept, 13.13), and the collapsible *Symbols* legend. Everything that was in
the old Layers section, nothing more. Collapsed by default; remembers its
state for the session.

**First-visit hint**: a single line centred on the map, in a rounded dark
pill — *"Pick a scene above, then click a bright dot inside the orange
line."* Disappears on the first map click and does not return.
**Removed 17 Sept (13.12)** — the welcome dialog says this already.

**Progress counter**: a rounded pill centred at the top of the map, just
below the top bar, clear of the control icons on the left. It is the scene's
score — 13.14.

### 13.5 Inspector — result, on the right, only when there is one

Hidden until the first click. On click it **slides in from the right**,
340 px, and the map narrows to make room (not an overlay). Contents, top to
bottom:

1. Header: *Verdict* and a `✕` that clears the click and hides the panel.
2. The matched or unmatched panel from section 9 — unchanged.
3. The GFW context and history lines from 10.2 — unchanged.
4. **The radius slider**, moved here from the global controls, because the
   radius only modifies this verdict. Label: *matching radius*.
5. The 9.3 explanatory block, on unmatched only, collapsible.

Selecting a different scene clears the click and closes the inspector. The
`✕` and `Esc` do the same. The panel is a live region for screen readers,
as now.

### 13.6 What does not change

Footer attribution. The Observation tab. All colours: background `#0b0e14`,
panel `#131720`, text `#e6e8ee`, orange `#f5a524`, blue `#4fb3ff`, muted
`#8a90a0`. No gradients. Desktop only — below 1100 px wide the inspector
may overlay the map instead of narrowing it; nothing else is required.

### 13.7 Milestones

| M | Build | Done when |
|---|---|---|
| **M10** | The v1 layout, sections 13.3–13.5. Move, don't rewrite. | Built 16 Sept. |
| **M10b** | Polish from the owner's live review, section 13.8. | Row 2 reads as a sentence with the two counts prominent and no product name; the Layers control is a stacked-squares icon top-left; the inspector has a titled GFW section with three lines and an (i); the legend has six glyph-plus-label lines including the dashed rectangle. |

### 13.8 M10b — polish from the live review (16 Sept)

**Top bar, row 2.** Remove the product name from the bar. Rewrite the row
as one readable sentence, regular size, the numbers in orange and bold:

> Radar 05:31:38 UTC · inside the site: **6 fishing vessels** (Danish AIS)
> · **2** in a fishing event (GFW)

Keep the two (i) tooltips on the words *Danish AIS* and *GFW*. The product
name moves to the **inspector footer**, small monospace, prefixed *scene* —
it is the traceable identifier of the exact image, useful to a technical
reader, not to a first glance. Also shown as the tooltip of the scene
stepper's text.

**Layers control.** Move to the map's **top-left**. Collapsed it is an icon
button only — the stacked-squares "layers" glyph (a simple inline SVG of
three offset rhombi), 36 px, panel colour — with the tooltip *Layers*.
Expanded it is the same 220 px card as now, opening to the right of the
icon. Zoom stays top-right.

**Inspector — GFW section.** Under the verdict and offset, a titled
section:

```
Global Fishing Watch  (i)
  At the pass     No fishing event in progress
                  — or —  Fishing event in progress since 03:50 UTC (1 h 41 min)
  Around the pass Fished 17:42 → 21:15 UTC, 6 km NE
                  — or —  None within 6 h
  History         23 fishing events in 18 months · 9 inside the site
```

Three fixed labels, three lines, each either a fact or a plain "none". The
(i) tooltip:

> *Global Fishing Watch classifies fishing from its own satellite AIS and
> publishes each episode as an event with a start, an end, and the
> rectangle the vessel stayed inside. The dashed rectangles on the map are
> those areas — not tracks, which GFW does not publish. GFW sees fewer
> vessels than the Danish shore network and only counts sustained,
> recognised fishing behaviour.*

**Legend.** Six lines, each a glyph and a label of at most four words, no
colour names, no descriptions:

```
▲ (orange)         Fishing vessel, under way
● (orange)         Fishing vessel, stopped
▲ (blue)           Other vessel
◎ (white ring)     Inside the protected site
▲ (large, white edge)  Your match
▭ (dashed orange)  GFW fishing event area
```

### 13.9 M10c — second live review (17 Sept)

| M | Build | Done when |
|---|---|---|
| **M10c** | Three adjustments below. | On load both map controls are icons only; clicking each opens its card and clicking again closes it; row 2 sits centred under the scene stepper. |

**Layers collapsed by default.** As 13.8 states: on load, the icon only.
If it currently opens expanded, that is a defect. Remember open/closed for
the session as now.

**Legend is its own control.** Remove *Symbols* from the Layers card. Add a
second icon button directly below the Layers icon, same size and style,
tooltip *Legend*, glyph: three short horizontal rows each preceded by a
small dot (the conventional "key" mark — not a question mark, which reads
as help). Collapsed by default. Expanded: the six-line legend from 13.8,
same 220 px card, opening to the right. Layers and Legend open and close
independently.

**Row 2 centred.** The sentence in row 2 is centred horizontally beneath
the scene stepper, since it describes what the stepper selected. Row 1
keeps title left and tabs right.

### 13.10 M11 — the welcome (17 Sept)

| M | Build | Done when |
|---|---|---|
| **M11** | A two-page welcome dialog shown on first visit, reopenable from a book icon bottom-left. Copy exactly as below. | First load shows page 1 centred over the map; *Next* shows page 2; *Start* closes it and the hint pill appears; reloading does not show it again; the book icon reopens it at page 1; `Esc` closes. |

**Behaviour.** A centred modal over a dimmed map, max width 600 px, panel
colour, 12 px corners, generous padding and line height (1.6). Two pages
with a small two-dot indicator at the foot. Page 1 has one button, *How to
find a boat →*. Page 2 has *← Back* and *Start*. `Esc` and a `✕` top right
of the dialog close on either page — the `✕` is sticky, so on a window too
short for page 1 the way out never scrolls away. Dismissal is remembered in `localStorage` (wrapped in try/catch) so it
shows once per browser; the book icon — an open-book glyph, 36 px, bottom
left of the map, tooltip *About Danish Herring* — reopens it at page 1 any
time. The first-visit hint pill (13.4) appears only after the dialog closes.
A subtle fade-in, 200 ms; nothing else animates. The heading is orange;
body text is `#e6e8ee`; the two proper nouns that are links are underlined
on hover only.

**Page 1**

> # Welcome to Danish Herring!
> *Radar, AIS and a protected sea — a game about finding boats.*
>
> Hirsholmene is a scatter of islands off Frederikshavn, on Denmark's
> Kattegat coast: a reserve for seals and seabirds, and a Natura 2000 site
> protected under European law. It is also trawled. That isn't a secret.
> The designation protects habitats and species, but fishing is regulated
> separately, and for most of Europe's marine sites nobody has ever
> restricted it. Campaigners have a name for this: *paper parks*. This app
> takes one of them as its case study — and hands you the satellite.
>
> It works by crossing three records that were never designed to meet —
> radar images from [Copernicus Sentinel-1](https://dataspace.copernicus.eu),
> the Danish Maritime Authority's official AIS log, and fishing events
> classified by [Global Fishing Watch](https://globalfishingwatch.org) — and
> lets you do something oddly satisfying with them: look at a radar picture,
> spot a bright dot inside the protected boundary, click it, and learn which
> boat it was, what it was doing, and whether anyone had noticed.
>
> It's deliberately a game. Geospatial data makes far more sense when you're
> hunting for something — and there is a lot of it here to hunt through.
>
> A few honest limits. The satellite passes at fixed hours, so you see the
> fleet at dawn and dusk, never midday. The scenes run from 13 August to
> 8 September 2026, when the fishing was busiest. At ten metres a pixel,
> small boats don't show. And AIS is only what a vessel chooses to declare —
> which is rather the point.
>
> **[ How to find a boat? → ]**

**Page 2**

> # How to find a boat?
>
> **1 · Pick a moment.** The selector at the top lists fourteen radar
> passes, busiest first. The line beneath says how many fishing vessels were
> inside the site at that exact second.
>
> **2 · Look at the radar.** This isn't a photo, and it isn't night: the
> satellite sends its own radar pulse. Calm water bounces it away and shows
> black; a steel hull throws it straight back and shows bright — cloud or
> no cloud. Zoom into the orange boundary and look for white dots.
>
> **3 · Click one.** The panel on the right gives its verdict — a name, a
> flag, a length, a speed — or no AIS contact at all, and what that can mean.
> The small gap between the dot and the AIS position is physics, not a bug;
> hover the (i).
>
> **4 · Ask what it was doing.** The Global Fishing Watch section tells you
> whether that boat was fishing at that moment, shortly before or after, and
> how often it has been inside the site.
>
> **5 · Check your work.** Open *Layers* to reveal every AIS vessel, show
> GFW's fishing areas, or switch to the optical photo on a clear day. The
> *Legend* explains the symbols.
>
> Then visit **Observation** for the bigger question: how often do
> satellites actually look at a protected sea? Here, every 1.7 days. At a
> World Heritage site in West Africa, every 12.
>
> Somewhere in that black water, a boat is waiting to be named. Go and
> find it!
>
> **[ ← Back ]  [ Start ]**

(Closing line — alternatives if the one above doesn't sit right:
*"The fleet is out there. Your move."* or *"Your first boat is out there.
Go and find it!"*)

A line of small muted text at the foot of both pages: *Open data · built
with AI assistance · [about this project]* — the one link going to the
GitHub README.

**Links** in the body (Copernicus Sentinel-1, Global Fishing Watch) are
always underlined, in the muted colour, brightening on hover — not
hover-only, which hides that they are links at all.

### 13.11 M11b — copy revision, mutual exclusion, the herring mark (17 Sept)

| M | Build | Done when |
|---|---|---|
| **M11b** | The revised welcome copy above; Layers and Legend mutually exclusive; the herring mark in the top bar and the welcome heading. | Opening Legend while Layers is open closes Layers, and vice versa, each card aligned with its own icon; the mark appears at 22 px left of the title and at ~40 px beside the welcome heading. |

**Layers / Legend.** Only one card open at a time. Clicking the other icon
closes the open card and opens the new one, positioned beside its own icon.
Clicking the open card's icon closes it. Nothing else changes.

**The herring mark.** Two raster images made by the owner (17 Sept), a
matched pair: a painted silver herring and a flat orange silhouette, both
in the same dark rounded square with a thin gold frame.

- `public/herring-painted.png` — beside the welcome heading, 56 px.
- `public/herring-flat.png` — top bar, left of the title, 28 px, vertically
  centred, 8 px gap. If the fish smears at that size, replace with a
  frameless transparent version at 22 px.
- `public/favicon-32.png` and `public/favicon-180.png` — the flat framed
  icon, as favicon and apple-touch-icon.

No SVG; the earlier drawn mark is superseded.

### 13.12 M11c — Layers open on arrival (17 Sept)

Reverses "collapsed by default" in 13.8 and 13.9. When the user arrives
(no choice yet made this session) the **Layers card is open**, so the two
menus on the left are seen at once; Legend stays closed, since only one
card opens at a time (13.11). The user may close both. The choice is
remembered for the session as before.

**Hint pill removed.** The first-visit hint of 13.4 no longer exists; the
welcome's page 2 carries the same instruction. Nothing appears on the map
after *Start*.

### 13.13 M11d — the layer menu: full names, one imagery layer (21 Sept)

| M | Build | Done when |
|---|---|---|
| **M11d** | Sensor names written out; the Optical (i) note opens downward; *Reveal all* removed; radar and optical mutually exclusive. | Ticking Optical Sentinel-2 unticks Radar Sentinel-1 and vice versa; the (i) note beside a disabled Optical row reads in full, not clipped by the top bar; no *Reveal all* button remains. |

Four notes from the owner after using the map.

**Names.** "Radar S1" and "Optical S2" name satellites the reader has not
met. The rows are now **Radar Sentinel-1**, **Optical Sentinel-2** and
**AIS fishing vessels** — the last says what the fleet is, which is the
subject of the app.

**The (i) note opens downward inside the card.** The tooltip of 9.4 opens
upward from its row. The Layers card sits at the top of the map, so the
Optical row's note ran under the top bar, which has its own stacking
context, and its first line was lost. Inside the card it opens downward
instead, over the map — the same reversal the top bar's own tooltip
already makes (13.3).

**One imagery layer at a time.** Layers 2 and 3 are no longer two
independent toggles but one choice: radar, optical, or neither. Ticking
either unticks the other. Stacking them was never useful — the upper one
simply hides the lower, and the bright dots can no longer be attributed to
a sensor.

Hold it as that one choice, not as two booleans kept in step. Where the
selected scene offers no clear Sentinel-2 pass, optical falls back to radar
rather than leaving the map bare: stepping from a clear scene to a cloudy
one with Optical ticked draws radar and ticks Radar Sentinel-1.

***Reveal all* removed.** Retires open question 19.3. The button and the
toggle set the same state, and the button sat directly under the toggle,
disabled whenever it was on. The sweep animation survives on the toggle:
the markers fade in one after another each time the AIS layer is switched
on, which is where the reveal belonged.

### 13.14 The progress counter — the scene as a quest (21 Sept)

A floating pill, centred at the top of the map directly under the top bar.
It holds the trawler mark `public/trawler-flat.png` at 40 px — with
`srcSet="/trawler-flat.png 1x, /trawler-flat@2x.png 2x"`, so it stays sharp
on a high-density screen — and a count, `2 / 6`.

**The denominator** is the selected scene's `n_fishing_in_site` (section 8),
read, never recomputed. **The numerator** is the number of distinct MMSIs
the user has matched in this scene that meet the same two conditions:
`ship_type = 'Fishing'` and an AIS position inside the *site* polygon, not
the box (3.1). A match reached by clicking a revealed AIS marker counts
exactly as a blind click on the radar does; the state of the AIS layer
changes nothing. Dragging the matching radius until a vessel falls inside
the circle is a match too — whatever the inspector calls matched, counts.

State is a set of MMSIs held for the scene on screen and **emptied whenever
the scene changes**: each scene is its own hunt. The counter is **hidden
entirely** where `n_fishing_in_site` is zero.

Styling: **55% opacity until the first find**, full opacity after, so it
reads as a target before it reads as a score; a brief scale pulse on each
increment; and at *n*/*n* the text — the count and its mark — turns accent
orange and reads `6 / 6 · all found`. The pill's border does not change: a
ring around the whole counter reads as an alert, not as a finish. Native `title` tooltip: *"Fishing vessels inside the protected site
that you have identified."* The pill is `aria-live="polite"`, so the count
is announced as it rises.

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
5. **What the data says** — measured facts only: **209 radar passes a year
   over Hirsholmene versus 31 over the core of the Bijagós**, same test,
   same size of target; 15 fishing vessels inside a 95 km² protected site on
   a single day; 6 fishing vessels inside the site at the instant of the
   2 September pass, 4 of them at trawling speed; **293 apparent-fishing events by
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
3. ~~Should the **Reveal all** button be prominent (a real button) or
   discreet (a link)?~~ **Answered 21 Sept: neither — the button is gone**
   (13.13). The *AIS fishing vessels* toggle does the same work, and the
   demo still asks the user to try blind first.

---

*End of specification.*
