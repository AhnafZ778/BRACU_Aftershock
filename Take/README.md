Take Package

This folder is a self-contained Dhaka integration bundle.

Contents:
- context/: full parsed integration context and layer annotations
- dhaka_extract/: Dhaka-ready GeoPackages and count manifests
- webmap/: runnable local map app with toggle layers and Dhaka-only blackout

Run map locally:
1) cd Take
2) python3 webmap/server.py
3) open http://127.0.0.1:8080

Default visible layers:
- dhaka_waterways
- dhaka_risk_waterways
- dhaka_water

Notes:
- Server reads data from Take/dhaka_extract.
- Outside Dhaka is blacked out in the map UI.
