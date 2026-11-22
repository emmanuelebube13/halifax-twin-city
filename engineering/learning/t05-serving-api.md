# Learning note: t05-serving-api (contract v0)

## What was built and why

- **A contract first.** `engineering/contract/openapi.yaml` describes every endpoint before the code, with example responses in `engineering/contract/examples/`. The web app built against those files while the API was still being written. Tests check every live response against the same file, so the code cannot drift from the contract unnoticed.
- **One envelope.** Every answer, errors included, carries `data`, `as_of`, `source`, `reliability_tier` and `licence`. The map can always show where a number came from and how old it is.
- **Layers are configuration.** `config/layers.json` names a kind (location, asset, event), a type code and a subsector. Road closures and building permits are served by the same query shape; a new sector adds a JSON entry, not code.
- **Honest stories.** Each story in `config/stories/` can list checks (`requires`). If the archive is too short or a gold function is missing, the story reports `collecting_data`; if the source lacks a field it reports `source_incomplete`, with a sentence saying why. Null is used for "no data", never zero.
- **Failure stays small.** A failing query returns HTTP 503 with a plain sentence for that one layer; other layers keep working. If the database cannot be reached at all, the API answers "unavailable" at once for 10 seconds instead of making every request wait.
- **Spatial joins without touching silver.** "Which closures are on bus routes" is computed in the API by measuring distance in UTM zone 20N (EPSG:32620), where one unit is one metre.

## How to run it

```powershell
cd services\api
.venv\Scripts\python -m uvicorn halifax_api.main:app --host 127.0.0.1 --port 8010
```

Open http://127.0.0.1:8010/v1/docs, or http://127.0.0.1:8010/v1/stories.

## Hands-on exercise

1. Open `config/layers.json` and copy the `road-closures` entry to a new layer called `event-closures` with `"subsector_ids": ["TRN-09"]` (special events and block parties).
2. Restart the API and open http://127.0.0.1:8010/v1/layers/event-closures. You have added a map layer without writing code.
3. In pgAdmin, run `SELECT subsector_id, count(*) FROM silver.event WHERE event_type_code = 'Road Closure' GROUP BY 1;` and compare with the layer's feature count (the layer shows only closures in effect now). Explain the difference in one sentence.

## Enterprise mapping

REST API design with OpenAPI contracts and contract testing (API management, for example Azure API Management or Apigee; the "design-first API" topic in API and integration certifications), plus PostGIS spatial joins (GIS and spatial analytics credentials).
