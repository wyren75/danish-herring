#!/usr/bin/env python3
"""
Minimal AISStream connection test. Prints everything, hides nothing.

    py ais_check.py

Asks for the API key if AISSTREAM_API_KEY is not set, so there is no
environment-variable guesswork. Listens to the Dover Strait for 60 seconds -
one of the busiest stretches of water in the world. If nothing arrives there,
the problem is the setup, not the sea.
"""

import asyncio
import json
import os
import sys

print(f"python      {sys.version.split()[0]}")

try:
    import websockets
except ImportError:
    sys.exit("websockets is not installed. Run:  py -m pip install websockets")

print(f"websockets  {getattr(websockets, '__version__', 'unknown')}")
print(f"script      {os.path.abspath(__file__)}\n")

KEY = (os.environ.get("AISSTREAM_API_KEY") or "").strip().strip('"').strip("'")
if not KEY:
    KEY = input("Paste your AISStream API key: ").strip().strip('"').strip("'")
if not KEY:
    sys.exit("No key given. Get one free at https://aisstream.io/apikeys")

print(f"key         {len(KEY)} chars, {KEY[:4]}...{KEY[-4:]}")

# Dover Strait / eastern Channel, as [[south, west], [north, east]]
BOX = [[[49.5, -1.5], [51.2, 2.0]]]
SECONDS = 60


async def main():
    payload = {"APIKey": KEY, "BoundingBoxes": BOX}
    print(f"box         {BOX}")
    print(f"connecting  wss://stream.aisstream.io/v0/stream\n")

    try:
        ws = await asyncio.wait_for(
            websockets.connect("wss://stream.aisstream.io/v0/stream"), timeout=20
        )
    except Exception as exc:
        print(f"FAILED TO CONNECT: {type(exc).__name__}: {exc}")
        print("\nThe websocket never opened. Likely a firewall, VPN, corporate")
        print("proxy or antivirus blocking wss:// traffic. Try another network.")
        return

    print("connected. subscription sent. waiting...\n")

    async with ws:
        await ws.send(json.dumps(payload))

        count = 0
        vessels = set()
        for _ in range(SECONDS):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1)
            except asyncio.TimeoutError:
                continue
            except Exception as exc:
                print(f"\nSOCKET CLOSED: {type(exc).__name__}: {exc}")
                print("A key rejection normally looks like this.")
                return

            count += 1
            if count <= 5:
                print(f"  message {count}: {raw[:300]}\n")

            try:
                mmsi = json.loads(raw).get("MetaData", {}).get("MMSI")
                if mmsi:
                    vessels.add(mmsi)
            except Exception:
                pass

            if count % 200 == 0:
                print(f"  ... {count} messages, {len(vessels)} vessels")

    print("=" * 60)
    print(f"messages: {count}   distinct vessels: {len(vessels)}")
    print("=" * 60)
    if count == 0:
        print("\nNothing arrived. The socket opened but the server stayed silent,")
        print("which almost always means the API key is not valid or not active.")
        print("Check https://aisstream.io/apikeys and confirm the key is listed.")
    else:
        print("\nWorking. Now re-test the Bijagos with the main script.")


asyncio.run(main())
