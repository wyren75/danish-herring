#!/usr/bin/env python3
"""
Rank Natura 2000 sites by what the AIS data says actually happens inside them.

    py rank_sites.py aisdk-2026-08-11.csv

Needs natura_sites.geojson from natura_sites.py in the same folder.

For every site polygon, streams the day file once and counts, inside the
polygon only:
  - distinct vessels
  - distinct fishing vessels
  - fishing position reports at trawling speed (2-5 knots) - the signature
    of a net on the seabed, as opposed to a boat transiting through

The site with real trawling-speed fishing activity, moderate total traffic
and a workable size is the one to build on.
"""

import csv
import json
import math
import os
import sys
from collections import defaultdict

TRAWL_MIN_KN, TRAWL_MAX_KN = 2.0, 5.0


def rings_of(geometry):
    """Yield outer rings only; holes are ignored (fine for site selection)."""
    t = geometry["type"]
    if t == "Polygon":
        yield geometry["coordinates"][0]
    elif t == "MultiPolygon":
        for poly in geometry["coordinates"]:
            yield poly[0]


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


class Site:
    def __init__(self, feature):
        p = feature["properties"]
        self.code = p.get("SITECODE", "?")
        self.name = p.get("SITENAME", "?")
        self.type = p.get("SITETYPE", "?")
        self.area_km2 = float(p.get("Area_km2") or 0)
        self.rings = list(rings_of(feature["geometry"]))
        xs = [pt[0] for r in self.rings for pt in r]
        ys = [pt[1] for r in self.rings for pt in r]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))
        self.w_km = (self.bbox[2] - self.bbox[0]) * 111.32 * math.cos(
            math.radians((self.bbox[1] + self.bbox[3]) / 2))
        self.h_km = (self.bbox[3] - self.bbox[1]) * 111.32

        self.rows = 0
        self.vessels = set()
        self.fishing = set()
        self.fishing_rows = 0
        self.trawl_rows = 0
        self.trawl_vessels = set()
        self.types = defaultdict(int)

    def contains(self, lon, lat):
        w, s, e, n = self.bbox
        if not (w <= lon <= e and s <= lat <= n):
            return False
        return any(point_in_ring(lon, lat, r) for r in self.rings)


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: py rank_sites.py <aisdk csv>")
    csv_path = sys.argv[1]
    if not os.path.exists("natura_sites.geojson"):
        sys.exit("natura_sites.geojson not found - run natura_sites.py first")

    with open("natura_sites.geojson", encoding="utf-8") as fh:
        sites = [Site(f) for f in json.load(fh)["features"]]
    print(f"{len(sites)} sites loaded\n")

    with open(csv_path, encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        cols = reader.fieldnames
        c_ts = next(c for c in cols if "timestamp" in c.lower())
        c_mob = next(c for c in cols if "type of mobile" in c.lower())
        c_mmsi = next(c for c in cols if c.lower() == "mmsi")
        c_lat = next(c for c in cols if c.lower() == "latitude")
        c_lon = next(c for c in cols if c.lower() == "longitude")
        c_sog = next(c for c in cols if c.lower() == "sog")
        c_type = next(c for c in cols if "ship type" in c.lower())

        n = 0
        for row in reader:
            n += 1
            if n % 2_000_000 == 0:
                print(f"  ...{n:,} rows")

            if not row[c_mob].startswith("Class"):
                continue
            try:
                lat = float(row[c_lat])
                lon = float(row[c_lon])
            except ValueError:
                continue
            if lat >= 90 or lon >= 180 or lat <= -90 or lon <= -180:
                continue

            for s in sites:
                if not s.contains(lon, lat):
                    continue
                mmsi = row[c_mmsi]
                stype = row[c_type] or "Undefined"
                s.rows += 1
                s.vessels.add(mmsi)
                s.types[stype] += 1
                if stype == "Fishing":
                    s.fishing.add(mmsi)
                    s.fishing_rows += 1
                    try:
                        sog = float(row[c_sog])
                    except ValueError:
                        sog = -1
                    if TRAWL_MIN_KN <= sog <= TRAWL_MAX_KN:
                        s.trawl_rows += 1
                        s.trawl_vessels.add(mmsi)

    sites.sort(key=lambda s: (-len(s.trawl_vessels), -len(s.fishing)))

    print("\n" + "=" * 100)
    print(f"{'code':<11} {'T':<2} {'km2':>6} {'size km':>9} {'vessels':>8} "
          f"{'fishing':>8} {'trawling':>9} {'trawl rows':>11}  name")
    print("-" * 100)
    for s in sites:
        print(f"{s.code:<11} {s.type:<2} {s.area_km2:>6.0f} "
              f"{s.w_km:>4.0f}x{s.h_km:<4.0f} {len(s.vessels):>8} "
              f"{len(s.fishing):>8} {len(s.trawl_vessels):>9} "
              f"{s.trawl_rows:>11,}  {s.name}")
    print("=" * 100)

    print("\ncolumns")
    print("  vessels    distinct Class A/B vessels inside the polygon that day")
    print("  fishing    distinct vessels declaring type Fishing")
    print("  trawling   fishing vessels seen at 2-5 knots inside the site")
    print("  trawl rows position reports at trawling speed - dwell time")
    print("\npick: trawling >= 3, vessels roughly 20-150, size 15-60 km, type B or C")

    best = [s for s in sites if s.trawl_vessels][:3]
    if best:
        print("\nstrongest candidates by trawling signature:")
        for s in best:
            top = sorted(s.types.items(), key=lambda kv: -kv[1])[:4]
            mix = ", ".join(f"{t} {c:,}" for t, c in top)
            print(f"\n  {s.code}  {s.name}")
            print(f"    bbox  {tuple(round(v, 3) for v in s.bbox)}")
            print(f"    mix   {mix}")


if __name__ == "__main__":
    main()
