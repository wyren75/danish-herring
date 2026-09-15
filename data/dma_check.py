#!/usr/bin/env python3
"""
Danish Maritime Authority AIS - feasibility check
=================================================

Free historical AIS, no account needed:  http://aisdata.ais.dk/

Three steps, run them in order:

  1) What exists, how big, how far back
        py dma_check.py --list

  2) Download one day and inspect it
        py dma_check.py --get 2026-03-15

  3) Count how many positions fall inside a candidate area
        py dma_check.py --inspect aisdk-2026-03-15.csv --zone kattegat

Only needs `requests`, which you already have.
"""

import argparse
import csv
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict

import requests

BASE = "http://aisdata.ais.dk/"
# The web page is a JavaScript front end over a public S3 bucket. The bucket
# answers the ListObjectsV2 API directly, which is what we use instead.
BUCKET = "http://aisdata.ais.dk.s3.eu-central-1.amazonaws.com"

# Candidate areas, (west, south, east, north)
ZONES = {
    "northsea":  ( 4.5, 56.0,  8.5, 57.5),   # Danish North Sea sector, Gule Rev
    "skagerrak": ( 8.0, 57.3, 11.0, 58.3),   # between Denmark and Norway
    "kattegat":  (10.5, 56.0, 12.5, 57.8),   # between Denmark and Sweden
    "straits":   (10.5, 54.5, 13.0, 56.2),   # Belts + Oresund - the busy control
    "all":       (-5.0, 50.0, 20.0, 62.0),   # everything, to see true extent
}


def human(n):
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if n < 1024 or unit == "TB":
            return f"{n:,.1f} {unit}"
        n /= 1024


# ---------------------------------------------------------------------------
# 1) What is on the server
# ---------------------------------------------------------------------------

def _tag(el):
    return el.tag.split("}")[-1]


def s3_list(prefix="", delimiter="/"):
    """Page through the S3 ListObjectsV2 XML API."""
    objects, folders, token = [], [], None

    while True:
        params = {"list-type": "2", "max-keys": "1000"}
        if prefix:
            params["prefix"] = prefix
        if delimiter:
            params["delimiter"] = delimiter
        if token:
            params["continuation-token"] = token

        r = requests.get(BUCKET, params=params, timeout=60)
        if r.status_code != 200:
            sys.exit(f"S3 returned HTTP {r.status_code}:\n{r.text[:600]}")

        root = ET.fromstring(r.content)
        truncated, token = False, None

        for child in root:
            name = _tag(child)
            if name == "Contents":
                key = size = modified = None
                for f in child:
                    t = _tag(f)
                    if t == "Key":
                        key = f.text
                    elif t == "Size":
                        size = int(f.text or 0)
                    elif t == "LastModified":
                        modified = (f.text or "")[:10]
                if key and not key.endswith("/"):
                    objects.append((key, size, modified))
            elif name == "CommonPrefixes":
                for f in child:
                    if _tag(f) == "Prefix":
                        folders.append(f.text)
            elif name == "IsTruncated":
                truncated = (child.text or "").lower() == "true"
            elif name == "NextContinuationToken":
                token = child.text

        if not (truncated and token):
            break

    return objects, folders


def list_files(prefix=""):
    print(f"listing bucket: {BUCKET}")
    print(f"prefix: {prefix or '(root)'}\n")

    objects, folders = s3_list(prefix)

    if folders:
        print(f"{len(folders)} folders:")
        for f in folders:
            print(f"  {f}")
        print(f"\n  drill in with:  py dma_check.py --list --prefix {folders[0]}")

    if not objects:
        if not folders:
            print("nothing found at all - paste this output back to Claude")
        return

    data = [o for o in objects
            if o[0].lower().endswith((".zip", ".rar", ".gz", ".csv"))]
    data.sort(key=lambda o: o[0])

    print(f"\n{len(data)} data files")

    by_month = defaultdict(list)
    for key, size, _ in data:
        m = re.search(r"(\d{4})[-_]?(\d{2})", os.path.basename(key))
        by_month[f"{m.group(1)}-{m.group(2)}" if m else "undated"].append(size or 0)

    years = defaultdict(int)
    for month, sizes in by_month.items():
        years[month[:4]] += len(sizes)
    print("\nfiles per year:")
    for y in sorted(years):
        print(f"  {y}: {years[y]}")

    print("\nmost recent 12:")
    for key, size, modified in data[-12:]:
        print(f"  {key:<48} {human(size or 0):>10}   {modified}")

    sizes = [s for _, s, _ in data if s]
    if sizes:
        sizes.sort()
        total = sum(sizes)
        print(f"\nsmallest : {human(sizes[0])}")
        print(f"median   : {human(sizes[len(sizes)//2])}")
        print(f"largest  : {human(sizes[-1])}")
        print(f"total    : {human(total)}")
        print("\nthe median is your per-day download - budget for it")

    if data:
        print(f"\nnext:  py dma_check.py --get {os.path.basename(data[-1][0])}")


# ---------------------------------------------------------------------------
# 2) Download one day
# ---------------------------------------------------------------------------

def download(target):
    key = target if target.lower().endswith((".zip", ".rar", ".gz")) \
        else f"aisdk-{target}.zip"
    name = os.path.basename(key)
    url = f"{BUCKET}/{key}"

    print(f"downloading {url}")
    try:
        with requests.get(url, stream=True, timeout=120) as r:
            if r.status_code == 404:
                sys.exit(f"404 - '{key}' does not exist. Run --list to see real names.")
            r.raise_for_status()

            total = int(r.headers.get("content-length", 0))
            print(f"size: {human(total) if total else 'unknown'}\n")

            done = 0
            with open(name, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
                    done += len(chunk)
                    if total:
                        pct = 100 * done / total
                        print(f"\r  {pct:5.1f}%  {human(done)}", end="", flush=True)
                    else:
                        print(f"\r  {human(done)}", end="", flush=True)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"\ndownload failed: {type(exc).__name__}: {exc}")

    print(f"\n\nsaved {name} ({human(os.path.getsize(name))})")

    if name.lower().endswith(".zip"):
        with zipfile.ZipFile(name) as z:
            print("\ncontents:")
            for info in z.infolist():
                ratio = info.file_size / max(info.compress_size, 1)
                print(f"  {info.filename}  {human(info.file_size)} "
                      f"uncompressed  ({ratio:.0f}x)")
                z.extract(info)
                print(f"  extracted to {info.filename}")
        print(f"\nnext:  py dma_check.py --inspect <csv> --zone kattegat")


# ---------------------------------------------------------------------------
# 3) Inspect the CSV
# ---------------------------------------------------------------------------

def inspect(path, zone, sample_rows=None):
    if not os.path.exists(path):
        sys.exit(f"{path} not found")

    west, south, east, north = ZONES[zone]
    print(f"inspecting {path} ({human(os.path.getsize(path))})")
    print(f"zone '{zone}': {west}, {south} -> {east}, {north}\n")

    with open(path, "r", encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        cols = reader.fieldnames or []

        print("columns:")
        for c in cols:
            print(f"  {c}")

        def find(*words):
            for c in cols:
                low = c.lower()
                if all(w in low for w in words):
                    return c
            return None

        c_lat = find("lat")
        c_lon = find("lon")
        c_mmsi = find("mmsi")
        c_time = find("timestamp") or find("time")
        c_type = find("ship", "type")
        c_name = find("name")

        print(f"\nusing:  lat={c_lat}  lon={c_lon}  mmsi={c_mmsi}  time={c_time}")
        if not (c_lat and c_lon and c_mmsi):
            sys.exit("could not identify the key columns - paste the list above to Claude")

        rows = 0
        in_zone = 0
        all_mmsi = set()
        zone_mmsi = set()
        types = Counter()
        lat_lo = lon_lo = 1e9
        lat_hi = lon_hi = -1e9
        first_time = last_time = None
        examples = []

        for row in reader:
            rows += 1
            if sample_rows and rows > sample_rows:
                break

            try:
                lat = float(row[c_lat])
                lon = float(row[c_lon])
            except (TypeError, ValueError):
                continue
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue

            all_mmsi.add(row[c_mmsi])
            lat_lo, lat_hi = min(lat_lo, lat), max(lat_hi, lat)
            lon_lo, lon_hi = min(lon_lo, lon), max(lon_hi, lon)

            if c_time and row.get(c_time):
                t = row[c_time]
                first_time = first_time or t
                last_time = t

            if west <= lon <= east and south <= lat <= north:
                in_zone += 1
                zone_mmsi.add(row[c_mmsi])
                if c_type:
                    types[row.get(c_type) or "(blank)"] += 1
                if len(examples) < 3:
                    examples.append(row)

            if rows % 2_000_000 == 0:
                print(f"  ...{rows:,} rows")

    print("\n" + "=" * 64)
    print(f"total position rows   : {rows:,}")
    print(f"distinct vessels      : {len(all_mmsi):,}")
    print(f"data extent           : {lon_lo:.2f}, {lat_lo:.2f} -> "
          f"{lon_hi:.2f}, {lat_hi:.2f}")
    if first_time:
        print(f"time range            : {first_time}  ->  {last_time}")
    print(f"\nrows inside '{zone}'   : {in_zone:,}  ({100*in_zone/max(rows,1):.1f}%)")
    print(f"vessels inside '{zone}': {len(zone_mmsi):,}")
    print("=" * 64)

    if types:
        print(f"\nvessel types inside '{zone}':")
        for t, n in types.most_common(15):
            print(f"  {t:<28} {n:>9,}")

    if examples:
        print("\nexample row:")
        for k, v in examples[0].items():
            if v:
                print(f"  {k:<32} {v}")

    print("\nHOW TO READ THIS")
    print("  40+ vessels in the zone -> plenty to work with")
    print("  10-40 vessels           -> workable, maybe widen the box")
    print("  under 10                -> too quiet, the demo will look empty")
    print("\n  Check 'Fishing' appears in the vessel types. That is the")
    print("  trawling story. No fishing vessels means the wrong box.")


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="DMA AIS feasibility check")
    ap.add_argument("--list", action="store_true", help="what is on the server")
    ap.add_argument("--prefix", default="", help="folder to list, e.g. 2026/")
    ap.add_argument("--get", metavar="DATE_OR_FILE", help="download one day")
    ap.add_argument("--inspect", metavar="CSV", help="analyse a downloaded csv")
    ap.add_argument("--zone", choices=sorted(ZONES), default="kattegat")
    ap.add_argument("--sample", type=int,
                    help="only read the first N rows (quick look at a big file)")
    args = ap.parse_args()

    if args.list:
        list_files(args.prefix)
    elif args.get:
        download(args.get)
    elif args.inspect:
        inspect(args.inspect, args.zone, args.sample)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
