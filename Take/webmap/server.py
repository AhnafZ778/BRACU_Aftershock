#!/usr/bin/env python3
"""Local map server for Dhaka dengue dashboard layer toggling.

Serves:
- Static frontend from this directory
- /api/layers metadata
- /api/geojson?layer=<id>&bbox=minx,miny,maxx,maxy

Requires GDAL/ogr2ogr available on PATH.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "dhaka_extract"


@dataclass(frozen=True)
class LayerDef:
    layer_id: str
    label: str
    category: str
    source_file: Path
    table_name: str
    geom_column: str
    geometry_kind: str  # point | line | polygon
    color: str
    fill_color: str
    default_visible: bool = False
    max_features: Optional[int] = 8000
    clip_to_city_union: bool = False


LAYERS: Dict[str, LayerDef] = {
    "dhaka_city_union": LayerDef(
        "dhaka_city_union",
        "Dhaka City Union (DNCC + DSCC)",
        "Boundaries",
        DATA_DIR / "dhaka_admin_boundaries.gpkg",
        "dhaka_city_union",
        "geom",
        "polygon",
        "#f8fafc",
        "#0ea5a500",
        False,
        5,
    ),
    "dhaka_city_corporations": LayerDef(
        "dhaka_city_corporations",
        "City Corporations",
        "Boundaries",
        DATA_DIR / "dhaka_admin_boundaries.gpkg",
        "dhaka_city_corporations",
        "GEOMETRY",
        "polygon",
        "#22d3ee",
        "#0891b200",
        False,
        10,
    ),
    "dhaka_admin3": LayerDef(
        "dhaka_admin3",
        "Dhaka District ADM3 Units",
        "Boundaries",
        DATA_DIR / "dhaka_admin_boundaries.gpkg",
        "dhaka_city_corporations",
        "GEOMETRY",
        "polygon",
        "#94a3b8",
        "#64748b00",
        False,
        10,
        False,
    ),
    "dhaka_roads": LayerDef(
        "dhaka_roads",
        "Roads",
        "Mobility",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_roads",
        "geom",
        "line",
        "#cbd5e1",
        "#00000000",
        False,
        12000,
    ),
    "dhaka_transport": LayerDef(
        "dhaka_transport",
        "Transport Points",
        "Mobility",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_transport",
        "geom",
        "point",
        "#f59e0b",
        "#f59e0b",
        False,
        5000,
    ),
    "dhaka_transport_areas": LayerDef(
        "dhaka_transport_areas",
        "Transport Areas",
        "Mobility",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_transport_areas",
        "geom",
        "polygon",
        "#f59e0b",
        "#f59e0b22",
        False,
        1000,
    ),
    "dhaka_traffic": LayerDef(
        "dhaka_traffic",
        "Traffic Points",
        "Mobility",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_traffic",
        "geom",
        "point",
        "#fb7185",
        "#fb7185",
        False,
        5000,
    ),
    "dhaka_traffic_areas": LayerDef(
        "dhaka_traffic_areas",
        "Traffic Areas",
        "Mobility",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_traffic_areas",
        "geom",
        "polygon",
        "#e11d48",
        "#e11d4820",
        False,
        1000,
    ),
    "dhaka_waterways": LayerDef(
        "dhaka_waterways",
        "Waterways",
        "Hydrology",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_waterways",
        "geom",
        "line",
        "#38bdf8",
        "#00000000",
        True,
        8000,
    ),
    "dhaka_risk_waterways": LayerDef(
        "dhaka_risk_waterways",
        "Risk Waterways (Drain/Canal/River)",
        "Hydrology",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_risk_waterways",
        "geom",
        "line",
        "#0ea5e9",
        "#00000000",
        True,
        8000,
    ),
    "dhaka_water": LayerDef(
        "dhaka_water",
        "Water Bodies",
        "Hydrology",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_water",
        "geom",
        "polygon",
        "#38bdf8",
        "#38bdf833",
        True,
        4000,
    ),
    "dhaka_landuse": LayerDef(
        "dhaka_landuse",
        "Landuse",
        "Environment",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_landuse",
        "geom",
        "polygon",
        "#86efac",
        "#22c55e22",
        False,
        5000,
    ),
    "dhaka_places": LayerDef(
        "dhaka_places",
        "Places",
        "Context",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_places",
        "geom",
        "point",
        "#f8fafc",
        "#f8fafc",
        False,
        2000,
    ),
    "dhaka_pois": LayerDef(
        "dhaka_pois",
        "POIs",
        "Services",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_pois",
        "geom",
        "point",
        "#a78bfa",
        "#a78bfa",
        False,
        9000,
    ),
    "dhaka_pofw": LayerDef(
        "dhaka_pofw",
        "Places of Worship",
        "Services",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_pofw",
        "geom",
        "point",
        "#60a5fa",
        "#60a5fa",
        False,
        4000,
    ),
    "dhaka_health_response_pois": LayerDef(
        "dhaka_health_response_pois",
        "Health & Response POIs",
        "Public Health",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_health_response_pois",
        "geom",
        "point",
        "#f97316",
        "#f97316",
        False,
        7000,
    ),
    "dhaka_anchor_point": LayerDef(
        "dhaka_anchor_point",
        "Dhaka Anchor",
        "Context",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        "dhaka_anchor_point",
        "geom",
        "point",
        "#f43f5e",
        "#f43f5e",
        False,
        10,
    ),
    "dhaka_buildings": LayerDef(
        "dhaka_buildings",
        "Buildings",
        "Exposure",
        DATA_DIR / "dhaka_city_buildings.gpkg",
        "dhaka_buildings",
        "geom",
        "polygon",
        "#fbbf24",
        "#fbbf2420",
        False,
        12000,
    ),
}


def parse_bbox(raw: str) -> Tuple[float, float, float, float]:
    values = [float(p) for p in raw.split(",")]
    if len(values) != 4:
        raise ValueError("bbox requires 4 comma separated numbers")
    minx, miny, maxx, maxy = values
    if not (-180 <= minx <= 180 and -180 <= maxx <= 180 and -90 <= miny <= 90 and -90 <= maxy <= 90):
        raise ValueError("bbox values out of range")
    if minx >= maxx or miny >= maxy:
        raise ValueError("bbox min values must be lower than max values")
    return minx, miny, maxx, maxy


class MapHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/layers":
            self.handle_layers()
            return
        if parsed.path == "/api/geojson":
            self.handle_geojson(parsed.query)
            return
        super().do_GET()

    def handle_layers(self) -> None:
        layer_items = []
        for layer in LAYERS.values():
            layer_items.append(
                {
                    "id": layer.layer_id,
                    "label": layer.label,
                    "category": layer.category,
                    "geometryKind": layer.geometry_kind,
                    "color": layer.color,
                    "fillColor": layer.fill_color,
                    "defaultVisible": layer.default_visible,
                    "maxFeatures": layer.max_features,
                }
            )
        self._send_json({"layers": layer_items})

    def handle_geojson(self, query: str) -> None:
        params = parse_qs(query)
        layer_id = params.get("layer", [""])[0]
        bbox_raw = params.get("bbox", [""])[0]

        if layer_id not in LAYERS:
            self._send_json({"error": "Unknown layer"}, HTTPStatus.BAD_REQUEST)
            return

        try:
            minx, miny, maxx, maxy = parse_bbox(bbox_raw)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": f"Invalid bbox: {exc}"}, HTTPStatus.BAD_REQUEST)
            return

        layer = LAYERS[layer_id]
        if not layer.source_file.exists():
            self._send_json(
                {
                    "error": "Source layer file is missing",
                    "layer": layer_id,
                    "expectedPath": str(layer.source_file),
                },
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        if layer.clip_to_city_union:
            sql = (
                f"SELECT t.* FROM {layer.table_name} t, dhaka_city_union u "
                f"WHERE ST_Intersects(t.{layer.geom_column}, BuildMbr({minx},{miny},{maxx},{maxy})) "
                f"AND ST_Intersects(t.{layer.geom_column}, u.geom)"
            )
        else:
            sql = (
                f"SELECT * FROM {layer.table_name} "
                f"WHERE ST_Intersects({layer.geom_column}, BuildMbr({minx},{miny},{maxx},{maxy}))"
            )
        if layer.max_features:
            sql += f" LIMIT {layer.max_features}"

        cmd = [
            "ogr2ogr",
            "-f",
            "GeoJSON",
            "/vsistdout/",
            str(layer.source_file),
            "-dialect",
            "SQLITE",
            "-sql",
            sql,
            "-lco",
            "RFC7946=YES",
        ]

        proc = subprocess.run(cmd, capture_output=True, check=False)
        if proc.returncode != 0:
            self._send_json(
                {
                    "error": "Failed to generate GeoJSON",
                    "layer": layer_id,
                    "details": proc.stderr.decode("utf-8", errors="replace"),
                },
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        geojson_bytes = proc.stdout
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/geo+json; charset=utf-8")
        self.send_header("Content-Length", str(len(geojson_bytes)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Max-Features", str(layer.max_features or "none"))
        self.end_headers()
        self.wfile.write(geojson_bytes)


def ensure_required_files() -> None:
    required = {
        DATA_DIR / "dhaka_admin_boundaries.gpkg",
        DATA_DIR / "dhaka_city_core_layers.gpkg",
        DATA_DIR / "dhaka_city_buildings.gpkg",
    }
    missing = [str(p) for p in sorted(required) if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing required map data files in dhaka_extract: " + ", ".join(missing)
        )


def main() -> None:
    ensure_required_files()
    host = "127.0.0.1"
    port = 8080
    server = ThreadingHTTPServer((host, port), MapHandler)
    print(f"Serving map UI at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
