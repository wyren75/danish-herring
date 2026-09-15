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
