const state = {
  map: null,
  baseLayer: null,
  layerDefs: [],
  activeLayers: new Map(),
  cityMaskLayer: null,
  cityFenceLayer: null,
  refreshTimer: null,
};

const CITY_UNION_FETCH_BBOX = "90.20,23.60,90.60,24.00";

const toastEl = document.getElementById("toast");
const groupRoot = document.getElementById("layer-groups");
const activeCountEl = document.getElementById("active-count");

function setToast(message, isWarn = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle("warn", isWarn);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateActiveCount() {
  activeCountEl.textContent = `Active: ${state.activeLayers.size}`;
}

function mapBoundsParam() {
  const b = state.map.getBounds();
  return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
}

function createBaseLayer(bounds = null) {
  if (state.baseLayer) {
    state.map.removeLayer(state.baseLayer);
  }

  const options = {
    maxZoom: 19,
    noWrap: true,
    attribution: '&copy; OpenStreetMap contributors',
  };
  if (bounds) {
    options.bounds = bounds;
  }

  state.baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", options).addTo(state.map);
}

function styleFor(def) {
  if (def.geometryKind === "line") {
    return {
      color: def.color,
      weight: def.id === "dhaka_roads" ? 1.2 : 1.8,
      opacity: 0.85,
    };
  }

  if (def.geometryKind === "polygon") {
    return {
      color: def.color,
      weight: def.id === "dhaka_buildings" ? 0.3 : 1.4,
      fillColor: def.fillColor,
      fillOpacity: def.id === "dhaka_buildings" ? 0.12 : 0.22,
      opacity: 0.9,
    };
  }

  return {
    color: def.color,
    fillColor: def.fillColor,
    fillOpacity: 0.9,
    radius: 4,
    weight: 0.6,
    opacity: 1,
  };
}

function popupHtml(properties) {
  const keys = [
    "name",
    "fclass",
    "adm3_name",
    "adm2_name",
    "adm1_name",
    "boundary_name",
    "osm_id",
    "population",
    "type",
  ];

  const rows = keys
    .filter((k) => Object.prototype.hasOwnProperty.call(properties, k) && properties[k] !== null && properties[k] !== "")
    .map((k) => `<div><strong>${escapeHtml(k)}</strong>: ${escapeHtml(properties[k])}</div>`)
    .join("");

  return rows || "<div>No attributes</div>";
}

function createGeoJsonLayer(def) {
  return L.geoJSON([], {
    style: () => styleFor(def),
    pointToLayer: (_feature, latlng) => {
      const s = styleFor(def);
      return L.circleMarker(latlng, s);
    },
    onEachFeature: (feature, layer) => {
      if (feature && feature.properties) {
        layer.bindPopup(popupHtml(feature.properties));
      }
    },
  });
}

async function fetchCityUnionGeometry() {
  const res = await fetch(
    `/api/geojson?layer=dhaka_city_union&bbox=${encodeURIComponent(CITY_UNION_FETCH_BBOX)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Unable to load city boundary (${res.status})`);
  }

  const geojson = await res.json();
  if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
    throw new Error("City boundary was empty");
  }
  return geojson;
}

function collectOuterRings(geometry, holes) {
  if (!geometry) return;

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    holes.push(geometry.coordinates[0]);
    return;
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    for (const poly of geometry.coordinates) {
      if (Array.isArray(poly) && poly.length > 0) {
        holes.push(poly[0]);
      }
    }
  }
}

function buildOutsideMaskFeature(cityGeojson) {
  const holes = [];
  for (const feature of cityGeojson.features || []) {
    collectOuterRings(feature.geometry, holes);
  }

  const worldRing = [
    [-180, -90],
    [-180, 90],
    [180, 90],
    [180, -90],
    [-180, -90],
  ];

  return {
    type: "Feature",
    properties: {
      name: "Outside Dhaka Mask",
    },
    geometry: {
      type: "Polygon",
      coordinates: [worldRing, ...holes],
    },
  };
}

function applyDhakaFence(cityGeojson) {
  const boundaryLayer = L.geoJSON(cityGeojson);
  const cityBounds = boundaryLayer.getBounds();
  if (!cityBounds.isValid()) {
    throw new Error("City boundary has invalid geometry");
  }

  state.map.fitBounds(cityBounds.pad(0.04), { animate: false });
  state.map.setMaxBounds(cityBounds.pad(0.08));
  state.map.options.maxBoundsViscosity = 1.0;

  const minZoom = state.map.getBoundsZoom(cityBounds.pad(0.22));
  state.map.setMinZoom(minZoom);

  createBaseLayer(cityBounds.pad(0.10));

  if (!state.map.getPane("dhaka-mask-pane")) {
    const pane = state.map.createPane("dhaka-mask-pane");
    pane.style.zIndex = "650";
    pane.style.pointerEvents = "none";
  }

  if (!state.map.getPane("dhaka-fence-pane")) {
    const pane = state.map.createPane("dhaka-fence-pane");
    pane.style.zIndex = "660";
    pane.style.pointerEvents = "none";
  }

  if (state.cityMaskLayer) {
    state.map.removeLayer(state.cityMaskLayer);
  }
  const maskFeature = buildOutsideMaskFeature(cityGeojson);
  state.cityMaskLayer = L.geoJSON(maskFeature, {
    pane: "dhaka-mask-pane",
    interactive: false,
    style: {
      stroke: false,
      fillColor: "#000000",
      fillOpacity: 1,
    },
  }).addTo(state.map);

  if (state.cityFenceLayer) {
    state.map.removeLayer(state.cityFenceLayer);
  }
  state.cityFenceLayer = L.geoJSON(cityGeojson, {
    pane: "dhaka-fence-pane",
    interactive: false,
    style: {
      color: "#22d3ee",
      weight: 2.4,
      opacity: 1,
      fillOpacity: 0,
    },
  }).addTo(state.map);
}

async function loadLayerData(def, holder) {
  const requestId = ++holder.requestId;
  const url = `/api/geojson?layer=${encodeURIComponent(def.id)}&bbox=${encodeURIComponent(mapBoundsParam())}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const errPayload = await res.json().catch(() => ({}));
      throw new Error(errPayload.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!state.activeLayers.has(def.id) || holder.requestId !== requestId) {
      return;
    }

    holder.layer.clearLayers();
    holder.layer.addData(data);

    const count = Array.isArray(data.features) ? data.features.length : 0;
    const cap = Number(res.headers.get("X-Max-Features"));
    if (Number.isFinite(cap) && cap > 0 && count >= cap) {
      setToast(`${def.label}: showing first ${cap} features in current extent`, true);
    } else {
      setToast(`${def.label}: ${count} features`);
    }
  } catch (err) {
    if (state.activeLayers.has(def.id)) {
      setToast(`${def.label}: ${err.message}`, true);
    }
  }
}

function queueRefresh() {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
  }
  state.refreshTimer = setTimeout(() => {
    for (const [_, holder] of state.activeLayers) {
      loadLayerData(holder.def, holder);
    }
  }, 280);
}

function activateLayer(def) {
  if (state.activeLayers.has(def.id)) return;

  const layer = createGeoJsonLayer(def).addTo(state.map);
  const holder = {
    def,
    layer,
    requestId: 0,
  };
  state.activeLayers.set(def.id, holder);
  updateActiveCount();
  loadLayerData(def, holder);
}

function deactivateLayer(def) {
  const holder = state.activeLayers.get(def.id);
  if (!holder) return;

  state.map.removeLayer(holder.layer);
  state.activeLayers.delete(def.id);
  updateActiveCount();
  setToast(`${def.label}: hidden`);
}

function renderLayerGroups(layerDefs) {
  const byCategory = new Map();
  for (const def of layerDefs) {
    if (!byCategory.has(def.category)) {
      byCategory.set(def.category, []);
    }
    byCategory.get(def.category).push(def);
  }

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  for (const category of categories) {
    const group = document.createElement("section");
    group.className = "group";

    const heading = document.createElement("h3");
    heading.textContent = category;
    group.appendChild(heading);

    const defs = byCategory.get(category).sort((a, b) => a.label.localeCompare(b.label));
    for (const def of defs) {
      const row = document.createElement("label");
      row.className = "layer-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(def.defaultVisible);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          activateLayer(def);
        } else {
          deactivateLayer(def);
        }
      });

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = def.label;

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = def.fillColor?.endsWith("00") ? def.color : def.fillColor;
      swatch.style.borderColor = def.color;

      row.appendChild(checkbox);
      row.appendChild(name);
      row.appendChild(swatch);
      group.appendChild(row);

      if (checkbox.checked) {
        activateLayer(def);
      }
    }

    groupRoot.appendChild(group);
  }
}

async function loadLayerMetadata() {
  const res = await fetch("/api/layers", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Unable to load layers (${res.status})`);
  }
  const payload = await res.json();
  return payload.layers || [];
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    minZoom: 10,
    maxZoom: 18,
  }).setView([23.79, 90.40], 12);

  createBaseLayer();

  state.map.on("moveend", queueRefresh);
  state.map.on("zoomend", queueRefresh);
}

async function bootstrap() {
  try {
    initMap();
    state.layerDefs = await loadLayerMetadata();
    const cityUnionGeojson = await fetchCityUnionGeometry();
    applyDhakaFence(cityUnionGeojson);
    renderLayerGroups(state.layerDefs);
    updateActiveCount();
    setToast("Dhaka-only map boundary applied");
  } catch (err) {
    setToast(err.message, true);
  }
}

bootstrap();
