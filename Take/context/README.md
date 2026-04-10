Context Folder Overview

This folder contains a full parsed context package for integrating the Dhaka geospatial dataset into a website.

Files

1) workspace_inventory.json
- Full file inventory of the workspace (excluding this context folder outputs).
- Includes file path, size, modified time, extension, and geodata flag.

2) geodata_catalog.json
- Parsed schema catalog for every GeoPackage and GeoJSON discovered.
- Includes source driver, layer list, feature counts, geometry types, extents, and all fields.

3) layer_quick_reference.csv
- Flat layer table for quick filtering and onboarding.
- Includes source path, layer name, geometry type, feature count, bbox, and key fields preview.

4) webmap_layers_api_snapshot.json
- Snapshot of the active /api/layers endpoint.
- Includes current default toggles and style metadata.

5) layer_toggle_defaults.json
- Frontend-ready layer config with default visibility and style keys.

6) website_layer_manifest.json
- Website integration manifest that combines API layer metadata with parsed dataset information.
- Best file to drive dynamic toggle UIs and integration mapping.

7) webmap_source_inventory.json
- Inventory of webmap source files with size, line count, and sha256 hashes.

8) website_integration_context.md
- End-to-end integration blueprint for your website according to current Dhaka-only requirements.

9) website_integration_snippets.md
- Copy-ready integration snippets and implementation patterns.

How to use this context quickly

- Read website_integration_context.md first.
- Use website_layer_manifest.json and layer_toggle_defaults.json to build map controls.
- Use geodata_catalog.json when implementing attribute-driven popups, filters, and layer logic.

Current policy already captured

- Dhaka-only map focus
- Outside-Dhaka blackout
- Default visible layers restricted to water-related layers
