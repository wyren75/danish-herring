#!/usr/bin/env python3
"""
Natura 2000 sites inside a bounding box, from the EEA's public map service.

    py natura_sites.py                       # Kattegat, prints a table
    py natura_sites.py --bbox W,S,E,N        # any box
    py natura_sites.py --marine 50           # only sites at least 50% marine

Saves the polygons to natura_sites.geojson - that file becomes the boundary
layer in the application. No account, no download of all of Europe.
"""

import argparse
import json
import sys

import requests

SERVICE = ("https://bio.discomap.eea.europa.eu/arcgis/rest/services/"
           "ProtectedSites/Natura2000Sites/MapServer")

KATTEGAT = (10.5, 56.0, 12.5, 57.8)


def get(url, **params):
    params.setdefault("f", "json")
    r = requests.get(url, params=params, timeout=90)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        sys.exit(f"service error: {data['error']}")
    return data


def find_polygon_layer():
    """The service has several layers; we want the one holding site polygons."""
    info = get(SERVICE)
    layers = info.get("layers", [])
    print("layers on the service:")
    for lyr in layers:
        print(f"  [{lyr['id']}] {lyr['name']}")

    for lyr in layers:
        meta = get(f"{SERVICE}/{lyr['id']}")
        if meta.get("geometryType") == "esriGeometryPolygon":
            print(f"\nusing layer [{lyr['id']}] {lyr['name']} (polygons)\n")
            return lyr["id"], meta

    sys.exit("no polygon layer found - paste the layer list above to Claude")


def bbox_of(geometry):
    xs, ys = [], []

    def walk(coords):
        if isinstance(coords[0], (int, float)):
            xs.append(coords[0])
            ys.append(coords[1])
        else:
            for c in coords:
                walk(c)

    walk(geometry["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", help="W,S,E,N", default=",".join(map(str, KATTEGAT)))
    ap.add_argument("--marine", type=float, default=0.0,
                    help="minimum marine percentage to keep")
    ap.add_argument("--out", default="natura_sites.geojson")
    args = ap.parse_args()

    west, south, east, north = (float(v) for v in args.bbox.split(","))

    layer_id, meta = find_polygon_layer()
    fields = [f["name"] for f in meta.get("fields", [])]
    print("fields available:", ", ".join(fields), "\n")

    data = get(
        f"{SERVICE}/{layer_id}/query",
        geometry=f"{west},{south},{east},{north}",
        geometryType="esriGeometryEnvelope",
        inSR="4326",
        outSR="4326",
        spatialRel="esriSpatialRelIntersects",
        outFields="*",
        returnGeometry="true",
        f="geojson",
    )

    features = data.get("features", [])
    if not features:
        sys.exit("no sites returned for that box")

    def pick(props, *cands):
        for c in cands:
            for k in props:
                if k.upper() == c.upper():
                    return props[k]
        return None

    rows = []
    for ft in features:
        p = ft["properties"]
        marine = pick(p, "MARINE_AREA_PERCENTAGE", "MARINE", "MARINEAREA")
        try:
            marine = float(marine) if marine is not None else None
        except ValueError:
            marine = None
        if args.marine and (marine is None or marine < args.marine):
            continue

        area = pick(p, "AREAHA", "AREA_HA", "AREA")
        try:
            area_km2 = float(area) / 100 if area is not None else None
        except ValueError:
            area_km2 = None

        w, s, e, n = bbox_of(ft["geometry"])
        rows.append({
            "code": pick(p, "SITECODE"),
            "name": pick(p, "SITENAME"),
            "type": pick(p, "SITETYPE"),
            "marine_pct": marine,
            "area_km2": area_km2,
            "bbox": (round(w, 3), round(s, 3), round(e, 3), round(n, 3)),
            "feature": ft,
        })

    rows.sort(key=lambda r: -(r["area_km2"] or 0))

    print(f"{len(rows)} sites intersect the box "
          f"({west}, {south} -> {east}, {north})\n")
    print(f"{'code':<11} {'type':<4} {'marine%':>7} {'km2':>8}  name")
    print("-" * 90)
    for r in rows:
        m = f"{r['marine_pct']:.0f}" if r["marine_pct"] is not None else "?"
        a = f"{r['area_km2']:,.0f}" if r["area_km2"] is not None else "?"
        print(f"{r['code'] or '?':<11} {r['type'] or '?':<4} {m:>7} {a:>8}  "
              f"{r['name']}")

    print("\nbounding boxes (W, S, E, N) - use one as --bbox elsewhere:")
    for r in rows:
        print(f"  {r['code']:<11} {r['bbox']}")

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection",
                   "features": [r["feature"] for r in rows]}, fh)
    print(f"\nsaved {len(rows)} polygons to {args.out}")

    print("\nSite types: A = birds only, B = habitats only, C = both.")
    print("For seabed trawling damage, prefer B or C with high marine %.")


if __name__ == "__main__":
    main()
