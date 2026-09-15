#!/usr/bin/env python3
"""
Maritime feasibility spike
==========================

Answers three questions before we commit to the architecture:

  A. How often do Sentinel-1 (SAR) and Sentinel-2 (optical) image an area?
  C. Does AISStream actually receive AIS traffic there?  (THE BLOCKER)
  D. (optional) What does Global Fishing Watch have there?

Zones (--zone) or a custom box (--bbox W,S,E,N):

    bijagos    the study area, Guinea-Bissau
    channel    Dover Strait / eastern Channel - busy, use as a positive control
    ushant     Brest approaches
    gibraltar  Strait of Gibraltar
    world      everything (~300 msg/s - keep it short)

Typical session:

    pip install requests websockets

    python spike.py --zone channel --part C --minutes 2    # prove it works
    python spike.py --zone bijagos --part C --minutes 30   # the real question
    python spike.py --zone bijagos --part A                # no credentials needed

Credentials (environment variables, never hard-coded):
    AISSTREAM_API_KEY   free from https://aisstream.io/apikeys
    GFW_API_TOKEN       free from https://globalfishingwatch.org/our-apis/
"""

import argparse
import asyncio
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

# ---------------------------------------------------------------------------
# Areas of interest
# ---------------------------------------------------------------------------

ZONES = {
    # name:      (west,   south,  east,   north)
    "bijagos":   (-17.0,   10.5,  -15.3,   11.8),  # confirmed 0 msgs, 30 min
    "senegal":   (-18.0,   12.8,  -16.0,   15.2),  # Dakar, Petite Cote, Saloum
    "canaries":  (-18.5,   27.3,  -13.2,   29.5),  # Las Palmas transshipment hub
    "channel":   ( -1.5,   49.5,    2.0,   51.2),  # Dover Strait - positive control
    "ushant":    ( -6.5,   47.8,   -4.0,   49.0),  # rail d'Ouessant
    "gibraltar": ( -6.5,   35.5,   -4.8,   36.5),
    "baltic":    ( 21.0,   58.8,   28.0,   60.6),  # Gulf of Finland, cable incidents
    "blacksea":  ( 28.0,   43.5,   34.0,   46.5),  # NW Black Sea, Odesa approaches
    "iroise":    ( -6.0,   47.7,   -4.2,   48.8),  # Parc naturel marin d'Iroise
    "dogger":    (  1.0,   54.0,    5.0,   55.5),  # Dogger Bank SAC, North Sea
    "lion":      (  3.0,   42.3,    5.5,   43.6),  # Gulf of Lion, trawling grounds
    "world":     (-180.0, -90.0,  180.0,   90.0),
}

WEST, SOUTH, EAST, NORTH = ZONES["bijagos"]
ZONE_NAME = "bijagos"

CDSE_ODATA = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"


def set_area(west, south, east, north, name="custom"):
    global WEST, SOUTH, EAST, NORTH, ZONE_NAME
    WEST, SOUTH, EAST, NORTH = west, south, east, north
    ZONE_NAME = name


def aoi_polygon():
    return (
        f"POLYGON(({WEST} {SOUTH},{EAST} {SOUTH},"
        f"{EAST} {NORTH},{WEST} {NORTH},{WEST} {SOUTH}))"
    )


def area_km2():
    """Rough area of the box, accounting for longitude convergence."""
    import math
    mid_lat = math.radians((NORTH + SOUTH) / 2)
    height = (NORTH - SOUTH) * 111.32
    width = (EAST - WEST) * 111.32 * math.cos(mid_lat)
    return abs(width * height), abs(width), abs(height)


def print_area_header():
    area, w, h = area_km2()
    print(f"zone  {ZONE_NAME}")
    print(f"bbox  {WEST}, {SOUTH} -> {EAST}, {NORTH}")
    print(f"size  {w:,.0f} km x {h:,.0f} km  =  {area:,.0f} km2")


# ---------------------------------------------------------------------------
# PART A - satellite acquisition frequency (public, no credentials)
# ---------------------------------------------------------------------------

def query_copernicus(collection, start, end, product_type=None, max_cloud=None):
    filters = [
        f"Collection/Name eq '{collection}'",
        f"OData.CSC.Intersects(area=geography'SRID=4326;{aoi_polygon()}')",
        f"ContentDate/Start gt {start}",
        f"ContentDate/Start lt {end}",
    ]

    if product_type:
        filters.append(
            "Attributes/OData.CSC.StringAttribute/any("
            "att:att/Name eq 'productType' and "
            f"att/OData.CSC.StringAttribute/Value eq '{product_type}')"
        )

    if max_cloud is not None:
        filters.append(
            "Attributes/OData.CSC.DoubleAttribute/any("
            "att:att/Name eq 'cloudCover' and "
            f"att/OData.CSC.DoubleAttribute/Value lt {max_cloud:.2f})"
        )

    params = {
        "$filter": " and ".join(filters),
        "$orderby": "ContentDate/Start desc",
        "$top": "1000",
    }

    url = CDSE_ODATA + "?" + "&".join(
        f"{quote(k)}={quote(v)}" for k, v in params.items()
    )

    try:
        resp = requests.get(url, timeout=90)
        resp.raise_for_status()
        return resp.json().get("value", [])
    except requests.HTTPError as exc:
        print(f"    ! HTTP {exc.response.status_code}")
        print(f"    ! {exc.response.text[:400]}")
        return None
    except Exception as exc:  # noqa: BLE001
        print(f"    ! {type(exc).__name__}: {exc}")
        return None


def describe_cadence(products, label, days):
    if products is None:
        print(f"  {label}: query failed, see error above")
        return

    if not products:
        print(f"  {label}: 0 acquisitions in {days} days")
        return

    slots = sorted({
        p["ContentDate"]["Start"][:13] for p in products if p.get("ContentDate")
    })
    dates = [datetime.strptime(s, "%Y-%m-%dT%H") for s in slots]
    gaps = [(b - a).total_seconds() / 86400 for a, b in zip(dates, dates[1:])]

    print(f"  {label}")
    print(f"    products returned : {len(products)}")
    print(f"    distinct passes   : {len(slots)}")
    print(f"    average interval  : {days / max(len(slots), 1):.1f} days")
    if gaps:
        print(f"    median gap        : {sorted(gaps)[len(gaps) // 2]:.1f} days")
        print(f"    longest gap       : {max(gaps):.1f} days")
    print(f"    most recent       : {slots[-1]}:00 UTC")

    if len(products) >= 1000:
        print("    ! hit the 1000-product cap - counts are truncated")


def monthly_histogram(products, label):
    if not products:
        return
    per_month = defaultdict(int)
    for p in products:
        if p.get("ContentDate"):
            per_month[p["ContentDate"]["Start"][:7]] += 1

    print(f"\n    {label} by month:")
    peak = max(per_month.values()) if per_month else 1
    for month in sorted(per_month):
        bar = "#" * int(20 * per_month[month] / peak)
        print(f"      {month}  {per_month[month]:4d}  {bar}")


def part_a_satellite_availability(days=365):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    s = start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    e = end.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    print("=" * 72)
    print(f"SATELLITE COVERAGE - last {days} days")
    print_area_header()
    print("=" * 72)

    print("\n[Sentinel-1 - SAR, all-weather, day and night]")
    s1 = query_copernicus("SENTINEL-1", s, e, product_type="IW_GRDH_1S")
    describe_cadence(s1, "IW GRDH (the mode used for ship detection)", days)
    monthly_histogram(s1, "Sentinel-1 products")

    print("\n[Sentinel-2 - optical, daylight and clear sky only]")
    s2_all = query_copernicus("SENTINEL-2", s, e, product_type="S2MSI2A")
    describe_cadence(s2_all, "all acquisitions, any cloud cover", days)

    print()
    s2_clear = query_copernicus("SENTINEL-2", s, e,
                                product_type="S2MSI2A", max_cloud=20.0)
    describe_cadence(s2_clear, "usable acquisitions (cloud < 20%)", days)
    monthly_histogram(s2_clear, "Sentinel-2 products under 20% cloud")


# ---------------------------------------------------------------------------
# PART C - AIS reception (THE BLOCKER)
# ---------------------------------------------------------------------------

async def _listen(api_key, minutes, debug=True):
    import websockets

    subscription = {
        "APIKey": api_key,
        # AISStream expects [[[south, west], [north, east]]] as [lat, lon] pairs
        "BoundingBoxes": [[[SOUTH, WEST], [NORTH, EAST]]],
    }

    if debug:
        shown = dict(subscription, APIKey=f"<{len(api_key)} chars>")
        print(f"subscribing with: {json.dumps(shown)}\n")

    vessels = {}
    messages = 0
    raw_seen = 0
    started = time.monotonic()
    last_report = started
    deadline = datetime.now(timezone.utc) + timedelta(minutes=minutes)

    print(f"Listening for {minutes} minutes. Progress every 5 seconds.")
    print("Let it finish - stopping early discards the summary.\n")

    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
        await ws.send(json.dumps(subscription))

        while datetime.now(timezone.utc) < deadline:
            remaining = (deadline - datetime.now(timezone.utc)).total_seconds()
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 5))
            except asyncio.TimeoutError:
                pass
            except Exception as exc:  # noqa: BLE001
                print(f"\n  ! socket closed: {type(exc).__name__}: {exc}")
                print("  ! this usually means the API key was rejected")
                break
            else:
                raw_seen += 1

                # Anything the server sends that is not a vessel message is
                # almost always an error. Surface it instead of swallowing it.
                low = raw.lower()
                if '"error"' in low or "invalid" in low or "unauthor" in low:
                    print(f"\n  ! server said: {raw[:400]}\n")
                    break

                if debug and raw_seen <= 3:
                    print(f"  raw #{raw_seen}: {raw[:220]}")

                msg = json.loads(raw)
                meta = msg.get("MetaData", {})
                mmsi = meta.get("MMSI")
                if mmsi:
                    messages += 1
                    entry = vessels.setdefault(mmsi, {"name": None, "n": 0})
                    entry["n"] += 1
                    name = (meta.get("ShipName") or "").strip()
                    if name:
                        entry["name"] = name

            now = time.monotonic()
            if now - last_report >= 5:
                elapsed = now - started
                rate = messages / elapsed if elapsed else 0
                print(f"  {elapsed:5.0f}s | {messages:7d} messages "
                      f"| {len(vessels):5d} vessels | {rate:6.1f} msg/s")
                last_report = now

    if raw_seen == 0:
        print("\n  ! the server sent nothing at all - not even an error.")
        print("  ! check the key, and check nothing is blocking wss:// traffic")

    return vessels, messages


def part_c_ais_reception(minutes=30):
    api_key = (os.environ.get("AISSTREAM_API_KEY") or "").strip().strip('"')
    if not api_key:
        sys.exit("Set AISSTREAM_API_KEY first - free key at https://aisstream.io/apikeys")

    print("=" * 72)
    print("AIS RECEPTION")
    print_area_header()
    print(f"key   {len(api_key)} chars, "
          f"starts {api_key[:4]}..., ends ...{api_key[-4:]}")
    print("=" * 72)

    try:
        vessels, messages = asyncio.run(_listen(api_key, minutes))
    except KeyboardInterrupt:
        print("\nStopped early - no summary.")
        return

    print("\n" + "=" * 72)
    print(f"RESULT for '{ZONE_NAME}' after {minutes} minutes")
    print(f"  messages received : {messages}")
    print(f"  distinct vessels  : {len(vessels)}")
    print("=" * 72)

    if vessels:
        print("\nVessels seen (most active first, top 40):")
        ranked = sorted(vessels.items(), key=lambda kv: -kv[1]["n"])
        for mmsi, v in ranked[:40]:
            print(f"  {mmsi}  {v['n']:5d} msgs  {v['name'] or '(name not yet received)'}")

    print("\nHOW TO READ THIS")
    print("  20+ vessels  -> good reception, the planned architecture works")
    print("  5-20 vessels -> thin but usable, widen the box or record longer")
    print("  0-5 vessels  -> no useful terrestrial AIS here")
    print("\n  If a busy zone like 'channel' also returns nothing, the problem")
    print("  is your key or connection, not the area. Always test that first.")


# ---------------------------------------------------------------------------
# PART D - Global Fishing Watch (optional, needs a free token)
# ---------------------------------------------------------------------------

GFW_BASE = "https://gateway.api.globalfishingwatch.org/v3"


def part_d_gfw(days=365):
    token = os.environ.get("GFW_API_TOKEN")
    if not token:
        sys.exit("Set GFW_API_TOKEN first - free at https://globalfishingwatch.org/our-apis/")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    print("=" * 72)
    print(f"GLOBAL FISHING WATCH - last {days} days")
    print_area_header()
    print("=" * 72)

    headers = {"Authorization": f"Bearer {token}",
               "Content-Type": "application/json"}

    # Per the v3 docs: GeoJSON goes in "geometry" at the top level of the body
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [WEST, SOUTH], [EAST, SOUTH],
            [EAST, NORTH], [WEST, NORTH], [WEST, SOUTH],
        ]],
    }

    # Exact dataset ids from the v3 Events API documentation
    DATASETS = {
        "GAP":        "public-global-gaps-events:latest",
        "FISHING":    "public-global-fishing-events:latest",
        "ENCOUNTER":  "public-global-encounters-events:latest",
        "LOITERING":  "public-global-loitering-events:latest",
        "PORT_VISIT": "public-global-port-visits-events:latest",
    }

    sample = {}
    for event_type, dataset in DATASETS.items():
        body = {
            "datasets": [dataset],
            "startDate": start.strftime("%Y-%m-%d"),
            "endDate": end.strftime("%Y-%m-%d"),
            "geometry": geometry,
        }
        try:
            r = requests.post(f"{GFW_BASE}/events", headers=headers,
                              json=body, params={"limit": 3, "offset": 0},
                              timeout=90)
            if r.status_code in (200, 201):
                data = r.json()
                total = data.get("total", "?")
                print(f"  {event_type:12s} {total} events")
                if data.get("entries"):
                    sample[event_type] = data["entries"][0]
            else:
                print(f"  {event_type:12s} HTTP {r.status_code} - {r.text[:200]}")
        except Exception as exc:  # noqa: BLE001
            print(f"  {event_type:12s} {type(exc).__name__}: {exc}")

    print("\n  GAP = AIS switched off. These are the dark-vessel events.")

    for kind in ("GAP", "FISHING"):
        if kind in sample:
            print(f"\n  example {kind} event (so we learn the shape):")
            print("  " + json.dumps(sample[kind], indent=2)[:1800].replace("\n", "\n  "))


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Maritime feasibility spike")
    ap.add_argument("--part", choices=["A", "C", "D", "all"], default="A")
    ap.add_argument("--zone", choices=sorted(ZONES), default="bijagos")
    ap.add_argument("--bbox", help="custom box as W,S,E,N (overrides --zone)")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--minutes", type=int, default=30,
                    help="how long to listen for AIS (part C)")
    args = ap.parse_args()

    if args.bbox:
        try:
            w, s, e, n = (float(v) for v in args.bbox.split(","))
        except ValueError:
            sys.exit("--bbox must be four numbers: W,S,E,N")
        set_area(w, s, e, n, "custom")
    else:
        set_area(*ZONES[args.zone], name=args.zone)

    if args.part in ("A", "all"):
        part_a_satellite_availability(args.days)
    if args.part in ("C", "all"):
        print()
        part_c_ais_reception(args.minutes)
    if args.part in ("D", "all"):
        print()
        part_d_gfw(args.days)


if __name__ == "__main__":
    main()
