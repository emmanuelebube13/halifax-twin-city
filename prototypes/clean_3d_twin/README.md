# Clean 3D street engine prototype

Standalone, zero-cost (`$0`) prototype demonstrating crisp street-level 3D rendering for Halifax neighbourhoods using local CesiumJS and Halifax Regional Municipality (HRM) open data schemas.

## Why this prototype exists

Photorealistic 3D tiles (such as Google Photorealistic 3D Tiles) look convincing from city-wide altitudes, but zooming down to residential streets around North Street, Gottingen Street, Fuller Terrace, Maynard Street, and Agricola Street exposes photogrammetry limits: dark baked shadows, blobby canopies, jagged rooflines, and melted parked vehicles.

A hybrid level-of-detail (LOD) architecture solves this cleanly:

1. **Above ~300 m camera height:** Keep regional 3D context tiles for skyline, harbour, and peninsula orientation.
2. **Below ~300 m camera height:** Cross-fade to clean, procedurally textured 3D geometry built from HRM Open Data layers (`SRC-077` Building Footprints, `SRC-027` Street Centrelines, `SRC-051` Street Trees, `SRC-005` Bus Stops, `SRC-015` Closures, and `SRC-066` Building Permits) paired with Nova Scotia LiDAR ridge/eave heights.

This standalone prototype validates the close-up street engine first—using only local assets (`../cesium/Cesium.js`, `../models/bus-near.glb`, and `../img/bus-side.png`) with no Cesium ion token and no paid APIs.

## What is included

- `apps/web/public/twin-preview/index.html` — Harbour-chart UI chrome with camera presets (`Residential close-up`, `North & Gottingen intersection`, `Street-level bus view`, `Neighbourhood overview`), layer checkboxes, a 24-hour Halifax sun-angle slider (`07:00` to `19:00`), and an interactive object inspector.
- `apps/web/public/twin-preview/engine.js` — Procedural HTML5 Canvas texture generators (Maritime clapboard siding, multi-pane windows, brick storefronts, shingle roofs, rooftop solar arrays, smooth asphalt, concrete sidewalks with 3D curbs, zebra crosswalks, and the Harbour-teal Gottingen Street bus-only lane), true 3D gable and hip roof meshes, multi-lobe 3D trees, 3D glass bus shelters, and animated Halifax Transit buses dwelling at shelters.
- `apps/web/public/twin-preview/sample-north-gottingen.json` — Detailed North Street & Gottingen Street / Fuller Terrace / Maynard Street / Agricola Street corridor dataset (57 buildings, 74 trees, 9 streets, 4 stops, 3 events, 4 routes, and 4 animated buses).
- `prototypes/clean_3d_twin/build_halifax_scene.py` — Standard-library Python 3 builder that queries HRM ArcGIS REST endpoints for any Halifax bounding box and writes a compatible scene JSON.

## Opening the prototype

Start the local web dev server (or preview server) inside `apps/web` and open:

```text
http://127.0.0.1:5173/twin-preview/
```

No Cesium ion token or external internet connection is required to view the prototype.

## Hands-on exercise: build a scene for another Halifax neighbourhood

Use `build_halifax_scene.py` to pull live HRM Open Data layers (`outSR=4326&f=geojson`) for any Halifax Peninsula or Dartmouth bounding box:

```powershell
python prototypes/clean_3d_twin/build_halifax_scene.py `
  --bbox -63.5835,44.6445,-63.5750,44.6510 `
  --out apps/web/public/twin-preview/spring-garden.json
```

If you have local Nova Scotia GeoNOVA 1 m LiDAR GeoTIFFs (`DSM` and `DTM`) and `rasterio` installed, pass `--lidar-dsm` and `--lidar-dtm` to sample real building ridge heights from `DSM - DTM` instead of footprint-area height estimates.
