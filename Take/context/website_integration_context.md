# Website Integration Context

Generated: 2026-04-10T09:19:16Z

## Objective
Integrate the Dhaka-only geospatial dataset into a website with controlled layer toggles and strict city masking.

## Parsed Assets
- Full workspace inventory: workspace_inventory.json
- Full geodata schema catalog: geodata_catalog.json
- Layer summary table: layer_quick_reference.csv
- Current webmap API layer defaults: webmap_layers_api_snapshot.json

## Primary Data Files
- Source country package: bangladesh.gpkg
- Uploaded admin boundaries: bgd_admin_boundaries (2).geojson/*
- Dhaka extracts: dhaka_extract/*

## Ready-To-Use Dhaka Datasets
- dhaka_extract/dhaka_admin_boundaries.gpkg
  - dhaka_city_union
  - dhaka_city_corporations
  - dhaka_admin1
  - dhaka_admin2
  - dhaka_admin3
- dhaka_extract/dhaka_city_core_layers.gpkg
  - roads, waterways, water, landuse, pois, transport, traffic, health_response_pois, etc.
- dhaka_extract/dhaka_city_buildings.gpkg
  - dhaka_buildings

## Current Default Toggle Policy
From webmap_layers_api_snapshot.json, default visible layers are set to water-related layers only:
- dhaka_waterways
- dhaka_risk_waterways
- dhaka_water

## Dhaka-Only Visual Policy
The active map implementation applies:
- strict map max bounds around Dhaka city union
- outside-area black mask (full blackout)
- dynamic layer fetching by current viewport

## API Contract (Current Local Server)
- GET /api/layers
  - Returns all toggleable layers, styles, defaultVisible flags
- GET /api/geojson?layer=<layer_id>&bbox=minx,miny,maxx,maxy
  - Returns viewport-clipped GeoJSON for the selected layer

## Integration Blueprint For Your Website
1. Keep your frontend map library (Leaflet/MapLibre).
2. Consume /api/layers at startup to build toggle UI dynamically.
3. Enable only defaultVisible layers initially (water-related only).
4. On moveend/zoomend, call /api/geojson per active layer with current bbox.
5. Add Dhaka blackout mask and boundary fence to enforce city-only focus.
6. Keep heavy layers (buildings) lazy/off by default, with viewport limits.

## Suggested Production Folder Mapping
- /data/dhaka_admin_boundaries.gpkg
- /data/dhaka_city_core_layers.gpkg
- /data/dhaka_city_buildings.gpkg
- /api/map/layers (metadata proxy)
- /api/map/geojson (viewport query proxy)

## Performance Notes
- Keep max-feature caps for point and building layers.
- Cache tile/background layers but avoid caching dynamic GeoJSON responses too aggressively.
- Maintain server-side clipping to bbox + Dhaka union for all requests.

## Validation Checklist
- Only Dhaka visible outside mask: pass/fail
- Only water-related layers enabled by default: pass/fail
- All layer toggles render without console/API errors: pass/fail
- Buildings layer remains responsive when toggled: pass/fail
