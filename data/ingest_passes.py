#!/usr/bin/env python3
"""
Satellite passes for the Observation tab (phase 3).

    py ingest_passes.py              # trailing 365 days, both sites

Queries the public Copernicus catalogue (no credentials) for every Sentinel-1
IW GRD and Sentinel-2 L2A product covering each site, collapses products from
the same pass into one row, and writes:

    out/satellite_passes.csv
    out/schema_passes.sql

One row = one pass over one site. cloud_pct is filled for Sentinel-2 only.
"""

import argparse
import csv
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

CDSE = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
OUT = "out"

SITES = {
    # code:        (label,                         west,   south,  east,   north)
    "DK00FX113": ("Hirsholmene, Kattegat",         10.321, 57.230, 10.767, 57.686),
    "BIJAGOS":   ("Bijagós Archipelago, Guinea-Bissau", -17.0, 10.5, -15.3, 11.8),
}

MISSIONS = {
    "S1": ("SENTINEL-1", "IW_GRDH_1S"),
    "S2": ("SENTINEL-2", "S2MSI2A"),
}


def query(collection, product_type, bbox, start, end):
    w, s, e, n = bbox
    poly = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
    filt = " and ".join([
        f"Collection/Name eq '{collection}'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{poly}')",
        f"ContentDate/Start gt {start}",
        f"ContentDate/Start lt {end}",
        "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' "
        f"and att/OData.CSC.StringAttribute/Value eq '{product_type}')",
    ])
    url = (f"{CDSE}?$filter={quote(filt)}&$orderby=ContentDate/Start%20asc"
           f"&$top=1000&$expand=Attributes")

    items = []
    while url:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        data = r.json()
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
        print(f"\r    {len(items)} products", end="", flush=True)
    print()
    return items


def cloud_of(product):
    for a in product.get("Attributes", []) or []:
        if a.get("Name") == "cloudCover":
            try:
                return float(a.get("Value"))
            except (TypeError, ValueError):
                return None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    s = start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    e = end.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    rows = []
    for code, (label, *bbox) in SITES.items():
        for mission, (collection, ptype) in MISSIONS.items():
            print(f"{code} {mission}")
            products = query(collection, ptype, bbox, s, e)

            # collapse products from the same pass (same hour) into one row
            slots = defaultdict(list)
            for p in products:
                t = p["ContentDate"]["Start"]
                slots[t[:13]].append(p)

            for slot, ps in sorted(slots.items()):
                ps.sort(key=lambda p: p["ContentDate"]["Start"])
                first = ps[0]
                cloud = None
                if mission == "S2":
                    clouds = [c for c in (cloud_of(p) for p in ps) if c is not None]
                    cloud = round(min(clouds), 1) if clouds else None
                rows.append({
                    "site_code": code,
                    "site_label": label,
                    "mission": mission,
                    "product_name": first["Name"],
                    "acq_start": first["ContentDate"]["Start"],
                    "cloud_pct": cloud,
                })
            print(f"    {len(slots)} distinct passes")

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "satellite_passes.csv")
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    with open(os.path.join(OUT, "schema_passes.sql"), "w", encoding="utf-8") as fh:
        fh.write("""create table satellite_passes (
  site_code     text,
  site_label    text,
  mission       text,
  product_name  text primary key,
  acq_start     timestamptz,
  cloud_pct     double precision
);
create index on satellite_passes (site_code, mission, acq_start);
alter table satellite_passes enable row level security;
create policy "public read" on satellite_passes for select using (true);
""")

    print("\n" + "=" * 60)
    for code in SITES:
        for mission in MISSIONS:
            n = sum(1 for r in rows if r["site_code"] == code and r["mission"] == mission)
            print(f"  {code:<10} {mission}  {n:>4} passes")
    print("=" * 60)
    print(f"written {path} and out/schema_passes.sql")


if __name__ == "__main__":
    main()
