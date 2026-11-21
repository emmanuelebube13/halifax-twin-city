# 00 Start here: agent brief, DEMO build

20 Nov 2026 · Architect: Emmanuel Mbachu

**This brief is for the demo build only.** It's a copy of the main agent brief, cut down and changed for one purpose: a working demo of the Halifax Digital Twin across its three Phase 1 domains, running on one small Windows PC. The main build follows the original brief and the 30 task cards later. Nothing here changes them.

## What the demo must show

One realistic 3D map of Halifax, built from the wireframes, that answers registered business questions for all three Phase 1 domains, using real open data stored in the project's own PostgreSQL database.

| Domain | Status today | Demo goal |
| :---- | :---- | :---- |
| Transportation | Live bus positions already flow into the database (`live-buses` script) | Live buses with on-time status, stops, routes, closures, collisions, bike network |
| Public Works | Tables exist, no data | 311 requests, work orders, capital projects, winter maintenance, parks, trees, streetlights, flood extents |
| Housing & Real Estate | Tables exist, no data | Parcels, buildings, building permits, planning applications, zoning, rental registry, CMHC rental and starts |
| City view | Not started | All three domains as layers on one map, plus one cross-sector story |

## Constraints that shape everything

- **Local and free.** It runs on the architect's Windows PC (8 GB RAM, integrated graphics). No cloud, no paid services, no Azure. Spend nothing; stop and ask if anything would cost money.  
- **Demo quality, clean code.** It may skip features, but what exists must work every time it's opened, and must be easy to start: one command for loaders, one for the app.  
- **Internet is used only for:** downloading open data, the Halifax Transit feeds, Cesium tiles and CDN scripts.  
- **Learning and documentation are first-class.** The architect is learning from this project, so every task ends with a short learning note (rule 9).

## What already exists (use it, don't rebuild it)

| Item | Where |
| :---- | :---- |
| PostgreSQL 18 \+ PostGIS database `halifax_twin`, built and tested on the demo PC | Repository `database/`; setup in `database/README.md` |
| Physical model: 63 silver tables, SCD2 history, partitions, bronze fetch register, reference data | `database/sql/`; design in `database/docs/physical-model-v1.md` |
| Logical model (names are final; do not invent entity or column names) | `database/generator/logical_model_spec.py`; Drive `05 Logical Model` |
| Live bus collector and simple 2D map (TRN-Q01) | `live-buses` package; becomes task D02 |
| Wireframes (6 screens) | Drive `08 Map Application/Wireframes` |
| Sources, questions, domain map | Source Inventory V1, Business Questions register, Domain Mapping (Drive) |

## Sources for the demo

Use only sources marked **Open** with an **API** or **file download** in Source Inventory V1. Leave every Partner, Private, PDF or manual-extract source out of the demo. Confirm each endpoint and its fields at build time; the inventory was checked on 12 Nov 2026\.

| Domain | Sources | Load into (silver tables) |
| :---- | :---- | :---- |
| Core / shared | SRC-027 Street Network, SRC-028 Intersections, SRC-029 Civic Addresses, SRC-030 Parcels with accounts, SRC-031 General Service Areas, SRC-032 Census 2021 tracts, SRC-033 Census profile, SRC-034 hourly weather | location, street, street\_segment, intersection, civic\_address, parcel, area, location\_containment, area\_statistic, weather\_observation |
| Transportation | SRC-001 vehicle positions (done), SRC-002 trip updates, SRC-003 service alerts, SRC-004 GTFS schedule, SRC-005 stops, routes and shelters, SRC-012 collisions, SRC-015 street closures, SRC-016 bike infrastructure | vehicle\_position, trip, stop\_arrival, service\_alert, schedule\_version, service\_calendar, scheduled\_trip, scheduled\_stop\_time, route, stop, collision, road\_closure, event\_coverage |
| Public Works | SRC-036 311 service requests, SRC-037 work orders, SRC-038 capital projects, SRC-040 right-of-way permits, SRC-041 winter maintenance areas, SRC-044 waste collection areas, SRC-046 parks, SRC-047 public trees, SRC-048 tree canopy by dissemination area, SRC-053 water quality, SRC-054 flood extents, SRC-056 streetlights | service\_request, work\_order, capital\_project, area, infrastructure\_asset, facility, water\_quality\_reading |
| Housing & Real Estate | SRC-061 CMHC rental market, SRC-062 CMHC starts and completions, SRC-064 short-term rental registry, SRC-065 rental registry, SRC-066 building permits, SRC-069 planning applications, SRC-070 zoning, SRC-071 building footprints, SRC-059 PVSC assessments (check licence and attribution first) | rental\_market\_observation, short\_term\_rental\_registration, dwelling\_unit, building\_permit, development\_project, area, building, property\_assessment |

Any source not yet in `silver.source` is added to it, with its licence and URL, before its data is loaded. Every loader also writes one row per download into `bronze.feed_fetch` and keeps the raw file under `data/bronze/<source>/<date>/`.

## Demo stories

Each story follows the wireframe's story panel: question, answer sentence with its number, evidence layers, context, and trust (source, as-of, reliability tier). Read each question's exact wording from the Business Questions register.

| Story | Domain | Needs |
| :---- | :---- | :---- |
| TRN-Q01 Where is every bus right now, and is it on time? | Transportation | Live feeds, stops, routes |
| TRN-Q24 or a collision hot-spot view | Transportation | SRC-012 |
| PWK-Q13 Where does utility work restrict street access or parking, and for how long? | Public Works | SRC-015, SRC-040 |
| PWK-Q07 Which neighbourhoods have the least park space and tree canopy per resident? | Public Works | SRC-046, SRC-048, census |
| HRE-Q08 How many new rental units are being added each year, and where? | Housing | SRC-066, SRC-062 |
| HRE-Q03 Which residential parcels sit in flood or coastal risk zones? | Housing and Public Works (cross-sector) | SRC-030, SRC-054 |

## Stack (keep it light)

- **Loaders and collector:** Python 3.12+, `psycopg`, `requests`, `gtfs-realtime-bindings`. ArcGIS REST loaders page through `query?where=1=1&outSR=4326&f=geojson`.  
- **API:** FastAPI \+ Uvicorn, read-only, serving GeoJSON and story numbers straight from the silver schema. It also serves the web page, so the demo is one process.  
- **Web:** one page built from the wireframes, plain HTML, CSS and JavaScript modules (no build step), CesiumJS from its CDN. IBM Plex Sans, matching the wireframes.  
- **Database:** the existing `halifax_twin` database. New tables, if truly needed, go in the `gold` schema and are written up in the pull request. Never change `silver`; propose the change instead.

## Realistic 3D with Cesium

- Google Photorealistic 3D Tiles through **Cesium ion**, using the architect's own ion access token. Confirm the asset ID in the ion Asset Depot at build time.  
- **The token is never written into the repository, a document or a chat.** The repository is public. The app reads it from the environment variable `CESIUM_ION_TOKEN`, or from `demo/config.local.json`, which is listed in `.gitignore`. The API passes it to the page only on `localhost`. Commit `config.example.json` with a placeholder only. The architect pastes the real token on the demo PC and restricts it to `localhost` in the ion dashboard.  
- **Small-PC settings:**  
  - render only when something changes (`requestRenderMode`);  
  - raise `maximumScreenSpaceError` on integrated graphics;  
  - cap the device pixel ratio;  
  - keep a **2D button** (OpenStreetMap imagery, no 3D tiles) that always works.  
- Show the Google and Cesium attribution on screen, as the tiles' terms require.

## Rules

1. Read this brief, `database/README.md`, `database/docs/physical-model-v1.md` and the wireframes before starting.  
     
2. All demo code lives in the repository's `demo/` folder:  
     
   - `demo/loaders/`: one module per source;  
   - `demo/api/`;  
   - `demo/web/`;  
   - `demo/config/`.

   

   Never write into `drive/` or `docs/`: `scripts/sync-drive.ps1` overwrites them.

   

3. One task, one branch, one pull request. Name the branch after the task, for example `d03-gtfs-schedule-loader`. The architect reviews and merges.  
     
4. Use the model's names exactly. Map every source field to a silver column in a small mapping table inside the loader's README. Those tables become step 10 (source-to-target mapping) later.  
     
5. No personal data. Show the licence attribution wherever data appears ("Contains information licensed under the Open Government Licence – Halifax", plus each source's own).  
     
6. Never commit a key, token or password. Commit only example config files.  
     
7. No emoji anywhere. Sentence case. Canadian spelling. Times in Halifax time, 24-hour clock.  
     
8. Every pull request includes a test and a section headed "How I verified", with the commands run and their output.  
     
9. Every task ends with `demo/learning/<task>.md`, written for the architect:  
     
   - what was built and why;  
   - how to run it;  
   - one hands-on exercise.

   

10. Spend nothing. If a step needs a paid service, a key you weren't given, or a source that isn't open, stop and ask.  
      
11. Interim business rules (not yet decided, keep them in `demo/config/business-rules.yaml`):  
      
    - on time \= 60 s early to 300 s late;  
    - frequent service \= every 15 min or better;  
    - 5-minute walk \= 400 m.

Stop and ask the architect when: a source's licence is unclear; a model name is missing; the acceptance check can't be met; something would cost money; or you need a key or account.

## Tasks

| Task | What | Done when |
| :---- | :---- | :---- |
| D01 | `demo/` skeleton, config example, `.gitignore` entries, one start script (`demo/start.ps1`) | The architect starts the empty app with one command |
| D02 | Fold the `live-buses` collector into `demo/loaders/transit_realtime/`: vehicle positions, trip updates and alerts, written to the database | Positions, arrivals and alerts land in silver; feed gaps show in `bronze.feed_gap` |
| D03 | GTFS schedule loader (SRC-004) into the schedule tables, plus stops and routes as assets | One schedule version loaded; planned stop times for today queryable |
| D04 | Core loaders: streets, intersections, civic addresses, parcels, areas, census tracts and profile | Location tables filled; parcels and stops placed in their census tract through `location_containment` |
| D05 | Transportation loaders: collisions, street closures, bike infrastructure | Rows in collision, road\_closure, event\_coverage |
| D06 | Public Works loaders: 311, work orders, capital projects, right-of-way permits, winter areas, waste areas, parks, trees, tree canopy, streetlights, water quality, flood extents | Every listed source loaded, with its fetch logged |
| D07 | Housing loaders: permits, planning applications, zoning, buildings, rental registry, short-term rentals, CMHC tables, PVSC (licence permitting) | Every listed source loaded, with its fetch logged |
| D08 | Read-only API: layers per domain, story numbers, `as_of` and source on every response | Each endpoint returns GeoJSON in under 2 s on the demo PC |
| D09 | Web app from the wireframes: header, sector rail (City, Transportation, Public Works, Housing, All sectors), Live lens, story panel, legend, list view, 2D / 3D switch, Cesium photorealistic view | Matches the laptop wireframes; 2D works with no token |
| D10 | Stories: the six above, each with an answer sentence and evidence layers | Each story's number matches a SQL check written in its learning note |
| D11 | City view: all three domains as layers, each greying out alone if its source fails | Turn one loader off: only its layer greys out |
| D12 | Demo script and rehearsal note: start, what to click, what to say, fallback if the internet drops | The architect runs the demo start to finish from the note |

**Order:** D01, then D02 to D07 (loaders can run side by side), then D08, D09, D10, D11, and D12 last.

## First prompt

Paste this to the agent working in the `halifax-twin-city` repository:

> You are building the DEMO of the Halifax Digital Twin, not the main build. Read "00 Start here: agent brief, DEMO build" in Drive folder 08 Map Application, then `database/README.md`, `database/docs/physical-model-v1.md`, and the wireframes in `08 Map Application/Wireframes`. The PostgreSQL database `halifax_twin` already exists on the demo PC; use it, and use the model's names exactly. Do task D01, open a pull request, and wait for review. Then work through D02 to D12 in order, one pull request each. Never commit the Cesium token or any password; read the token from `CESIUM_ION_TOKEN` or `demo/config.local.json`. End each session with: what is done, the evidence, what is blocked, and your questions for me.

## Demo acceptance

- One command starts everything on the demo PC, and the map opens in 3D over Halifax.  
- Live buses move, coloured by on-time status, with stops and routes.  
- Each of the three domains has visible layers and at least one story with a real number from the database.  
- One cross-sector story (parcels in flood zones).  
- The 2D fallback works with no token and no 3D tiles.  
- Every screen shows its source, as-of time and licence.  
- Learning notes exist for every task.