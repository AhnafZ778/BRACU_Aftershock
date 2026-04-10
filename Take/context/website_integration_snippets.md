# Website Integration Snippets

## 1) Minimal Leaflet Integration (Vanilla JS)

```html
<div id="map"></div>
<script>
async function boot() {
  const map = L.map('map').setView([23.79, 90.40], 12);
  const layersMeta = await fetch('/api/layers').then(r => r.json());

  const active = new Map();

  async function refreshLayer(def) {
    const b = map.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    const geojson = await fetch(`/api/geojson?layer=${def.id}&bbox=${encodeURIComponent(bbox)}`).then(r => r.json());
    if (!active.has(def.id)) {
      active.set(def.id, L.geoJSON(geojson).addTo(map));
    } else {
      const l = active.get(def.id);
      l.clearLayers();
      l.addData(geojson);
    }
  }

  const defaults = layersMeta.layers.filter(x => x.defaultVisible);
  for (const def of defaults) await refreshLayer(def);

  map.on('moveend', async () => {
    for (const def of defaults) await refreshLayer(def);
  });
}
boot();
</script>
```

## 2) React + Leaflet Pattern

- At app init, GET /api/layers.
- Store toggle state in React state keyed by layer id.
- On map move/zoom, fetch only active layers.
- Use debounced refresh (200-300 ms).
- Keep buildings off by default and lazy load.

## 3) Next.js API Proxy Pattern

If your frontend and map server are on different hosts, create a route handler:

- GET /api/map/layers -> proxy to 127.0.0.1:8080/api/layers
- GET /api/map/geojson -> proxy query to 127.0.0.1:8080/api/geojson

## 4) Required Runtime Policies

- Enforce Dhaka-only mask/fence in frontend.
- Keep default visible to water-related layers only.
- Keep max feature caps for heavy layers.
- Use viewport-based querying only.
