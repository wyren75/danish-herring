#!/usr/bin/env python3
"""
Ingestion: Sentinel-1 scenes + Danish AIS -> a small clean dataset
==================================================================

For a site and a date range:

  1. Ask the Copernicus catalogue which Sentinel-1 scenes cover the site.
  2. For each scene's day, download the DMA AIS file (cached, deleted after).
  3. Keep only AIS rows inside the (padded) site box and within a window of
     the acquisition instant.
  4. Interpolate every vessel's position to the exact acquisition second.
  5. Write four CSVs that load straight into Supabase.

    py ingest.py                                   # defaults below
    py ingest.py --start 2026-04-01 --end 2026-07-31 --max-scenes 12
    py ingest.py --keep                            # keep the zips

Outputs (in ./out/):
    scenes.csv      one row per Sentinel-1 acquisition
    vessels.csv     one row per vessel seen (identity, type, size)
    positions.csv   raw AIS positions in the window, per scene
    snapshots.csv   each vessel's position AT the acquisition instant
    schema.sql      Supabase table definitions matching the CSVs

Assumption: DMA timestamps are UTC (they are, per DMA documentation), and
Copernicus ContentDate is UTC. Both are treated as such.
"""

import argparse
import csv
import os
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

# ---------------------------------------------------------------------------
# Site: Hirsholmene, DK00FX113. EEA bbox (10.441, 57.35, 10.647, 57.566),
# padded so the map has context and vessels approaching the site are kept.
# ---------------------------------------------------------------------------

SITE_CODE = "DK00FX113"
SITE_NAME = "Hirsholmene, havet vest herfor og Ellinge Å's udløb"
SITE_BBOX = (10.441, 57.350, 10.647, 57.566)
PAD_DEG = 0.12                       # ~7 km E-W, ~13 km N-S
WEST, SOUTH, EAST, NORTH = (SITE_BBOX[0] - PAD_DEG, SITE_BBOX[1] - PAD_DEG,
                            SITE_BBOX[2] + PAD_DEG, SITE_BBOX[3] + PAD_DEG)

WINDOW_MIN = 90        # keep AIS within +/- this many minutes of acquisition
INTERP_MAX_MIN = 20    # interpolate only if both neighbours are this close

CDSE = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
BUCKET = "http://aisdata.ais.dk.s3.eu-central-1.amazonaws.com"
CACHE = "dma_cache"
OUT = "out"


def log(msg=""):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# 1. Scenes
# ---------------------------------------------------------------------------

def query_scenes(start, end):
    poly = (f"POLYGON(({WEST} {SOUTH},{EAST} {SOUTH},{EAST} {NORTH},"
            f"{WEST} {NORTH},{WEST} {SOUTH}))")
    filt = " and ".join([
        "Collection/Name eq 'SENTINEL-1'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{poly}')",
        f"ContentDate/Start gt {start}T00:00:00.000Z",
        f"ContentDate/Start lt {end}T23:59:59.000Z",
        "Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' "
        "and att/OData.CSC.StringAttribute/Value eq 'IW_GRDH_1S')",
    ])
    url = (f"{CDSE}?$filter={quote(filt)}&$orderby=ContentDate/Start%20asc"
           f"&$top=1000")
    r = requests.get(url, timeout=120)
    r.raise_for_status()

    scenes = []
    for p in r.json().get("value", []):
        t0 = datetime.fromisoformat(
            p["ContentDate"]["Start"].replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(
            p["ContentDate"]["End"].replace("Z", "+00:00"))
        scenes.append({
            "scene_id": p["Name"].replace(".SAFE", ""),
            "product_name": p["Name"],
            "acq_start": t0,
            "acq_end": t1,
            "acq_mid": t0 + (t1 - t0) / 2,
        })
    return scenes


def pick_evenly(scenes, n):
    if n <= 0 or len(scenes) <= n:
        return scenes
    step = len(scenes) / n
    return [scenes[int(i * step)] for i in range(n)]


# ---------------------------------------------------------------------------
# 2. DMA day files
# ---------------------------------------------------------------------------

def ensure_day(day):
    """Return path to the CSV for a date, downloading + extracting if needed."""
    os.makedirs(CACHE, exist_ok=True)
    name = f"aisdk-{day:%Y-%m-%d}"
    csv_path = os.path.join(CACHE, name + ".csv")
    zip_path = os.path.join(CACHE, name + ".zip")

    if os.path.exists(csv_path):
        return csv_path

    if not os.path.exists(zip_path):
        url = f"{BUCKET}/{name}.zip"
        log(f"  downloading {name}.zip")
        with requests.get(url, stream=True, timeout=180) as r:
            if r.status_code == 404:
                log(f"  ! {name}.zip not on the server (outside the rolling window?)")
                return None
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            done = 0
            with open(zip_path, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
                    done += len(chunk)
                    if total:
                        print(f"\r    {100*done/total:5.1f}%", end="", flush=True)
        log()

    log(f"  extracting {name}.zip")
    with zipfile.ZipFile(zip_path) as z:
        member = next(m for m in z.namelist() if m.lower().endswith(".csv"))
        z.extract(member, CACHE)
        extracted = os.path.join(CACHE, member)
        if extracted != csv_path:
            os.replace(extracted, csv_path)
    os.remove(zip_path)
    return csv_path


def cleanup_day(csv_path, keep):
    if not keep and csv_path and os.path.exists(csv_path):
        os.remove(csv_path)


# ---------------------------------------------------------------------------
# 3. Extract the window around each scene
# ---------------------------------------------------------------------------

def parse_ts(s):
    # "11/08/2026 00:00:00"
    return datetime(int(s[6:10]), int(s[3:5]), int(s[0:2]),
                    int(s[11:13]), int(s[14:16]), int(s[17:19]),
                    tzinfo=timezone.utc)


def to_float(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def extract_day(csv_path, scenes_today, vessels):
    """Stream one day file once; return {scene_id: [rows]} for all scenes."""
    windows = [(sc, sc["acq_mid"] - timedelta(minutes=WINDOW_MIN),
                sc["acq_mid"] + timedelta(minutes=WINDOW_MIN))
               for sc in scenes_today]

    per_scene = defaultdict(list)
    n = kept = 0

    with open(csv_path, encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        idx = {h.strip().lower(): i for i, h in enumerate(header)}

        def col(*names):
            for nm in names:
                for k, i in idx.items():
                    if nm in k:
                        return i
            sys.exit(f"column not found: {names}")

        i_ts = col("timestamp")
        i_mob = col("type of mobile")
        i_mmsi = col("mmsi")
        i_lat = col("latitude")
        i_lon = col("longitude")
        i_sog = col("sog")
        i_cog = col("cog")
        i_hdg = col("heading")
        i_nav = col("navigational status")
        i_imo = col("imo")
        i_call = col("callsign")
        i_name = col("name")
        i_type = col("ship type")
        i_len = col("length")
        i_wid = col("width")

        for row in reader:
            n += 1
            if n % 2_000_000 == 0:
                print(f"\r    {n:>12,} rows, {kept:,} kept", end="", flush=True)

            # cheapest tests first: bbox, then mobile class, then time
            lat = to_float(row[i_lat])
            lon = to_float(row[i_lon])
            if lat is None or lon is None:
                continue
            if not (WEST <= lon <= EAST and SOUTH <= lat <= NORTH):
                continue
            if not row[i_mob].startswith("Class"):
                continue

            try:
                t = parse_ts(row[i_ts])
            except (ValueError, IndexError):
                continue

            mmsi = row[i_mmsi]
            hit = False
            for sc, lo, hi in windows:
                if lo <= t <= hi:
                    per_scene[sc["scene_id"]].append({
                        "mmsi": mmsi, "t": t, "lat": lat, "lon": lon,
                        "sog": to_float(row[i_sog]),
                        "cog": to_float(row[i_cog]),
                        "heading": to_float(row[i_hdg]),
                        "nav_status": row[i_nav],
                    })
                    hit = True
            if not hit:
                continue
            kept += 1

            v = vessels.setdefault(mmsi, {
                "mmsi": mmsi, "name": "", "imo": "", "callsign": "",
                "ship_type": "", "length_m": None, "width_m": None,
                "mobile_class": row[i_mob],
            })
            # static fields arrive on some rows and not others - fill as seen
            if not v["name"] and row[i_name] not in ("", "Unknown"):
                v["name"] = row[i_name]
            if not v["imo"] and row[i_imo] not in ("", "Unknown"):
                v["imo"] = row[i_imo]
            if not v["callsign"] and row[i_call] not in ("", "Unknown"):
                v["callsign"] = row[i_call]
            if not v["ship_type"] and row[i_type] not in ("", "Undefined"):
                v["ship_type"] = row[i_type]
            if v["length_m"] is None:
                v["length_m"] = to_float(row[i_len])
            if v["width_m"] is None:
                v["width_m"] = to_float(row[i_wid])

    log(f"\r    {n:>12,} rows, {kept:,} kept")
    return per_scene


# ---------------------------------------------------------------------------
# 4. Snapshot at the acquisition instant
# ---------------------------------------------------------------------------

def snapshot(rows, t0):
    """Per vessel, position at t0 by linear interpolation between neighbours."""
    by_mmsi = defaultdict(list)
    for r in rows:
        by_mmsi[r["mmsi"]].append(r)

    out = []
    limit = timedelta(minutes=INTERP_MAX_MIN)
    for mmsi, pts in by_mmsi.items():
        pts.sort(key=lambda r: r["t"])
        before = max((p for p in pts if p["t"] <= t0), key=lambda p: p["t"], default=None)
        after = min((p for p in pts if p["t"] >= t0), key=lambda p: p["t"], default=None)

        if before and after and before is not after:
            if (t0 - before["t"]) > limit or (after["t"] - t0) > limit:
                continue
            span = (after["t"] - before["t"]).total_seconds()
            f = (t0 - before["t"]).total_seconds() / span if span else 0.0
            out.append({
                "mmsi": mmsi,
                "lat": before["lat"] + f * (after["lat"] - before["lat"]),
                "lon": before["lon"] + f * (after["lon"] - before["lon"]),
                "sog": before["sog"], "cog": before["cog"],
                "method": "interpolated",
                "dt_before_s": int((t0 - before["t"]).total_seconds()),
                "dt_after_s": int((after["t"] - t0).total_seconds()),
            })
        else:
            p = before or after
            gap = abs((p["t"] - t0).total_seconds())
            if gap > limit.total_seconds():
                continue
            out.append({
                "mmsi": mmsi, "lat": p["lat"], "lon": p["lon"],
                "sog": p["sog"], "cog": p["cog"],
                "method": "nearest",
                "dt_before_s": int((t0 - p["t"]).total_seconds()) if p is before else None,
                "dt_after_s": int((p["t"] - t0).total_seconds()) if p is after else None,
            })
    return out


# ---------------------------------------------------------------------------
# 5. Write
# ---------------------------------------------------------------------------

SCHEMA = """-- Supabase / Postgres schema matching the CSVs in out/
-- Import each CSV through the Supabase dashboard (Table editor -> Import).

create table scenes (
  scene_id      text primary key,
  product_name  text,
  acq_start     timestamptz,
  acq_end       timestamptz,
  acq_mid       timestamptz,
  site_code     text,
  bbox_w        double precision,
  bbox_s        double precision,
  bbox_e        double precision,
  bbox_n        double precision,
  n_positions   integer,
  n_vessels     integer
);

create table vessels (
  mmsi          text primary key,
  name          text,
  imo           text,
  callsign      text,
  ship_type     text,
  length_m      double precision,
  width_m       double precision,
  mobile_class  text
);

create table positions (
  scene_id      text references scenes(scene_id),
  mmsi          text,
  t             timestamptz,
  lat           double precision,
  lon           double precision,
  sog           double precision,
  cog           double precision,
  heading       double precision,
  nav_status    text
);
create index on positions (scene_id, mmsi, t);

create table snapshots (
  scene_id      text references scenes(scene_id),
  mmsi          text,
  lat           double precision,
  lon           double precision,
  sog           double precision,
  cog           double precision,
  method        text,
  dt_before_s   integer,
  dt_after_s    integer
);
create index on snapshots (scene_id);

-- Read-only public access for the browser client
alter table scenes    enable row level security;
alter table vessels   enable row level security;
alter table positions enable row level security;
alter table snapshots enable row level security;
create policy "public read" on scenes    for select using (true);
create policy "public read" on vessels   for select using (true);
create policy "public read" on positions for select using (true);
create policy "public read" on snapshots for select using (true);
"""


def write_outputs(scenes, vessels, positions, snaps):
    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(OUT, "scenes.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["scene_id", "product_name", "acq_start", "acq_end", "acq_mid",
                    "site_code", "bbox_w", "bbox_s", "bbox_e", "bbox_n",
                    "n_positions", "n_vessels"])
        for sc in scenes:
            w.writerow([sc["scene_id"], sc["product_name"],
                        sc["acq_start"].isoformat(), sc["acq_end"].isoformat(),
                        sc["acq_mid"].isoformat(), SITE_CODE,
                        WEST, SOUTH, EAST, NORTH,
                        sc.get("n_positions", 0), sc.get("n_vessels", 0)])

    with open(os.path.join(OUT, "vessels.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["mmsi", "name", "imo", "callsign", "ship_type",
                    "length_m", "width_m", "mobile_class"])
        for v in sorted(vessels.values(), key=lambda v: v["mmsi"]):
            w.writerow([v["mmsi"], v["name"], v["imo"], v["callsign"],
                        v["ship_type"], v["length_m"], v["width_m"],
                        v["mobile_class"]])

    with open(os.path.join(OUT, "positions.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["scene_id", "mmsi", "t", "lat", "lon", "sog", "cog",
                    "heading", "nav_status"])
        for scene_id, rows in positions.items():
            for r in rows:
                w.writerow([scene_id, r["mmsi"], r["t"].isoformat(),
                            round(r["lat"], 6), round(r["lon"], 6),
                            r["sog"], r["cog"], r["heading"], r["nav_status"]])

    with open(os.path.join(OUT, "snapshots.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["scene_id", "mmsi", "lat", "lon", "sog", "cog", "method",
                    "dt_before_s", "dt_after_s"])
        for scene_id, rows in snaps.items():
            for r in rows:
                w.writerow([scene_id, r["mmsi"], round(r["lat"], 6),
                            round(r["lon"], 6), r["sog"], r["cog"], r["method"],
                            r["dt_before_s"], r["dt_after_s"]])

    with open(os.path.join(OUT, "schema.sql"), "w", encoding="utf-8") as fh:
        fh.write(SCHEMA)


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2026-04-01")
    ap.add_argument("--end", default="2026-07-31")
    ap.add_argument("--max-scenes", type=int, default=12)
    ap.add_argument("--keep", action="store_true", help="keep day CSVs in cache")
    args = ap.parse_args()

    log("=" * 72)
    log(f"site   {SITE_CODE}  {SITE_NAME}")
    log(f"box    {WEST:.3f}, {SOUTH:.3f} -> {EAST:.3f}, {NORTH:.3f}  (padded)")
    log(f"window +/- {WINDOW_MIN} min around each acquisition")
    log("=" * 72)

    log(f"\nquerying Sentinel-1 scenes {args.start} -> {args.end} ...")
    all_scenes = query_scenes(args.start, args.end)
    log(f"  {len(all_scenes)} scenes cover the site in that range")
    scenes = pick_evenly(all_scenes, args.max_scenes)
    log(f"  using {len(scenes)}, spread evenly:")
    for sc in scenes:
        log(f"    {sc['acq_mid']:%Y-%m-%d %H:%M} UTC  {sc['scene_id'][:40]}...")

    by_day = defaultdict(list)
    for sc in scenes:
        by_day[sc["acq_mid"].date()].append(sc)
        # window may cross midnight
        lo = (sc["acq_mid"] - timedelta(minutes=WINDOW_MIN)).date()
        hi = (sc["acq_mid"] + timedelta(minutes=WINDOW_MIN)).date()
        for d in {lo, hi}:
            if d != sc["acq_mid"].date():
                by_day[d].append(sc)

    vessels = {}
    positions = defaultdict(list)

    log(f"\n{len(by_day)} day files needed\n")
    for day in sorted(by_day):
        log(f"[{day}]  {len(by_day[day])} scene(s)")
        path = ensure_day(day)
        if not path:
            continue
        got = extract_day(path, by_day[day], vessels)
        for scene_id, rows in got.items():
            positions[scene_id].extend(rows)
        cleanup_day(path, args.keep)

    log("\ninterpolating to acquisition instants ...")
    snaps = {}
    for sc in scenes:
        rows = positions.get(sc["scene_id"], [])
        snap = snapshot(rows, sc["acq_mid"])
        snaps[sc["scene_id"]] = snap
        sc["n_positions"] = len(rows)
        sc["n_vessels"] = len(snap)
        log(f"  {sc['acq_mid']:%Y-%m-%d %H:%M}  {len(rows):>7,} positions  "
            f"{len(snap):>4} vessels at the instant")

    write_outputs(scenes, vessels, positions, snaps)

    total_pos = sum(len(v) for v in positions.values())
    log("\n" + "=" * 72)
    log(f"scenes     {len(scenes)}")
    log(f"vessels    {len(vessels)}")
    log(f"positions  {total_pos:,}")
    log(f"snapshots  {sum(len(v) for v in snaps.values()):,}")
    log(f"written to ./{OUT}/  (+ schema.sql for Supabase)")
    log("=" * 72)


if __name__ == "__main__":
    main()
