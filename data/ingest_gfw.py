#!/usr/bin/env python3
"""
Ingest Global Fishing Watch apparent-fishing events for the site.

    $env:GFW_API_TOKEN="..."
    py ingest_gfw.py                 # trailing 365 days
    py ingest_gfw.py --days 540      # match the DMA archive depth

Reads natura_sites.geojson (for the real site polygon) and writes:
    out/gfw_fishing_events.csv       one row per event, with inside_site flag
    out/schema_gfw.sql               the fifth Supabase table

Also answers two questions on the way:
  - how many events fall inside the actual Natura 2000 polygon (not the box)
  - of those, how many GFW itself tagged as inside a marine protected area
"""

import argparse
import csv
import json
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import requests

SITE_CODE = "DK00FX113"
WEST, SOUTH, EAST, NORTH = 10.321, 57.230, 10.767, 57.686   # padded box
GFW = "https://gateway.api.globalfishingwatch.org/v3/events"
DATASET = "public-global-fishing-events:latest"
PAGE = 100
OUT = "out"


# ---------------------------------------------------------------------------

def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def load_site_rings():
    if not os.path.exists("natura_sites.geojson"):
        sys.exit("natura_sites.geojson not found - run natura_sites.py first")
    with open("natura_sites.geojson", encoding="utf-8") as fh:
        for ft in json.load(fh)["features"]:
            if ft["properties"].get("SITECODE") == SITE_CODE:
                g = ft["geometry"]
                if g["type"] == "Polygon":
                    return [g["coordinates"][0]]
                return [poly[0] for poly in g["coordinates"]]
    sys.exit(f"{SITE_CODE} not in natura_sites.geojson")


def fetch_all(token, start, end):
    headers = {"Authorization": f"Bearer {token}",
               "Content-Type": "application/json"}
    body = {
        "datasets": [DATASET],
        "startDate": start,
        "endDate": end,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[WEST, SOUTH], [EAST, SOUTH], [EAST, NORTH],
                             [WEST, NORTH], [WEST, SOUTH]]],
        },
    }
    offset, entries, total = 0, [], None
    while True:
        r = requests.post(GFW, headers=headers, json=body,
                          params={"limit": PAGE, "offset": offset}, timeout=120)
        if r.status_code not in (200, 201):
            sys.exit(f"HTTP {r.status_code}: {r.text[:400]}")
        data = r.json()
        total = data.get("total", total)
        page = data.get("entries", [])
        entries.extend(page)
        print(f"\r  {len(entries)}/{total} events", end="", flush=True)
        nxt = data.get("nextOffset")
        if not page or nxt is None or nxt <= offset:
            break
        offset = nxt
    print()
    return entries


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()

    token = (os.environ.get("GFW_API_TOKEN") or "").strip()
    if not token:
        sys.exit("set GFW_API_TOKEN first")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    rings = load_site_rings()

    print(f"fetching GFW fishing events {start:%Y-%m-%d} -> {end:%Y-%m-%d}")
    events = fetch_all(token, f"{start:%Y-%m-%d}", f"{end:%Y-%m-%d}")

    rows = []
    inside = inside_mpa_tagged = near_port = 0
    vessels_all, vessels_inside = set(), set()
    flags = Counter()

    for e in events:
        pos = e.get("position") or {}
        lat, lon = pos.get("lat"), pos.get("lon")
        if lat is None or lon is None:
            continue
        v = e.get("vessel") or {}
        f = e.get("fishing") or {}
        d = e.get("distances") or {}
        reg = e.get("regions") or {}
        mpa_tags = ";".join(reg.get("mpa") or [])
        in_site = any(point_in_ring(lon, lat, r) for r in rings)
        port_km = d.get("startDistanceFromPortKm")

        if in_site:
            inside += 1
            vessels_inside.add(v.get("ssvid"))
            if mpa_tags:
                inside_mpa_tagged += 1
        if port_km is not None and port_km < 1:
            near_port += 1
        vessels_all.add(v.get("ssvid"))
        flags[v.get("flag") or "?"] += 1

        rows.append({
            "event_id": e.get("id"),
            "start": e.get("start"),
            "end": e.get("end"),
            "lat": lat, "lon": lon,
            "inside_site": in_site,
            "mmsi": v.get("ssvid"),
            "vessel_name": v.get("name"),
            "flag": v.get("flag"),
            "gfw_vessel_id": v.get("id"),
            "avg_speed_kn": f.get("averageSpeedKnots"),
            "distance_km": f.get("totalDistanceKm"),
            "dist_port_km": port_km,
            "dist_shore_km": d.get("startDistanceFromShoreKm"),
            "mpa_tags": mpa_tags,
            "site_code": SITE_CODE,
        })

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "gfw_fishing_events.csv")
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    with open(os.path.join(OUT, "schema_gfw.sql"), "w", encoding="utf-8") as fh:
        fh.write("""create table gfw_fishing_events (
  event_id       text primary key,
  start          timestamptz,
  "end"          timestamptz,
  lat            double precision,
  lon            double precision,
  inside_site    boolean,
  mmsi           text,
  vessel_name    text,
  flag           text,
  gfw_vessel_id  text,
  avg_speed_kn   double precision,
  distance_km    double precision,
  dist_port_km   double precision,
  dist_shore_km  double precision,
  mpa_tags       text,
  site_code      text
);
create index on gfw_fishing_events (start);
create index on gfw_fishing_events (inside_site);
alter table gfw_fishing_events enable row level security;
create policy "public read" on gfw_fishing_events for select using (true);
""")

    print("\n" + "=" * 64)
    print(f"events in padded box          : {len(rows):,}")
    print(f"distinct vessels (box)        : {len(vessels_all):,}")
    print(f"events INSIDE the site polygon: {inside:,}")
    print(f"distinct vessels (inside)     : {len(vessels_inside):,}")
    print(f"inside AND tagged mpa by GFW  : {inside_mpa_tagged:,}")
    print(f"events within 1 km of a port  : {near_port:,}  (likely moored, not fishing)")
    print("=" * 64)
    print("\ntop flags:")
    for flag, n in flags.most_common(8):
        print(f"  {flag:<5} {n:,}")
    print(f"\nwritten {path} and out/schema_gfw.sql")

    if inside and not inside_mpa_tagged:
        print("\nNOTE: GFW tagged none of the in-site events as inside an MPA.")
        print("Its protected-area layer appears not to include this Natura 2000")
        print("site. That is a finding - record it in the journal.")


if __name__ == "__main__":
    main()
