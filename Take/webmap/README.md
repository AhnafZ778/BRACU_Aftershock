Dhaka Dengue Operations Map Viewer

This folder provides a local interactive map where you can toggle all extracted Dhaka layers on and off.

Run

1) Open a terminal in this workspace root.
2) Start the server:

python3 webmap/server.py

3) Open:

http://127.0.0.1:8080

What you can toggle

- DNCC + DSCC union boundary
- City corporation boundaries
- Dhaka ADM3 units
- Roads, waterways, water bodies, landuse
- POIs, health-response POIs, transport, traffic
- Places of worship, anchor point
- Buildings (streamed by map extent with a feature cap)

Data sources expected by the server

- dhaka_extract/dhaka_admin_boundaries.gpkg
- dhaka_extract/dhaka_city_core_layers.gpkg
- dhaka_extract/dhaka_city_buildings.gpkg

Notes

- Layer data is queried dynamically from GeoPackage using ogr2ogr and current map extent.
- Buildings are capped per request for browser stability.
- If you pan/zoom, active layers refresh automatically.
