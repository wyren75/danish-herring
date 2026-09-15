#!/usr/bin/env python3
"""
Pull the single Hirsholmene feature out of natura_sites.geojson and write the
two static assets the app needs into public/.

    py extract_site.py
"""

import json
import os

SITE_CODE = "DK00FX113"
BIJAGOS = (-17.0, 10.5, -15.3, 11.8)

src = next(p for p in ("natura_sites.geojson",
                       os.path.join("data", "natura_sites.geojson"))
           if os.path.exists(p))
with open(src, encoding="utf-8") as fh:
    features = json.load(fh)["features"]

site = next(f for f in features if f["properties"].get("SITECODE") == SITE_CODE)

os.makedirs("public", exist_ok=True)

with open(os.path.join("public", "site.geojson"), "w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "features": [site]}, fh)

w, s, e, n = BIJAGOS
with open(os.path.join("public", "bijagos.geojson"), "w", encoding="utf-8") as fh:
    json.dump({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"SITECODE": "BIJAGOS",
                           "SITENAME": "Bijagós Archipelago (UNESCO World Heritage)"},
            "geometry": {"type": "Polygon",
                         "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]},
        }],
    }, fh)

print(f"wrote public/site.geojson ({site['properties'].get('SITENAME')})")
print("wrote public/bijagos.geojson")
