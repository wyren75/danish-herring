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

Section 8 says sort by `n_fishing_in_site` descending, ties by
`n_trawling_in_site`, then date — but its example rows list 02 Sep (6·4)
above 31 Aug (7·0). The rule is what the code does: 31 Aug, 7 fishing
inside, ranks first and opens by default. The activity dots the spec shows
but does not define are `round((fishing + trawling) / 2.5)`, capped at four:
trawlers count twice, which reproduces the three example rows exactly.

## 2026-09-16 · M4 · Verdict scrolls into view

With fourteen scenes the verdict section sits below the panel's fold on a
typical desktop, so a click on the map would answer out of sight. The verdict
section calls `scrollIntoView({ block: 'nearest' })` when a verdict appears.
No layout change; section 13's order (scenes, layers, radius, verdict) stands.
