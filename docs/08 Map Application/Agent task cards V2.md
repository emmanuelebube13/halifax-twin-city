# Agent task cards V2: T01 to T31 and M01

21 Nov 2026\. V2 of "Agent task cards T01 to T30" (15 Nov 2026, Drive folder 08 Map Application), with the overrides of the main build handoff note (section 2\) and the architect's decisions of 21 Nov evening applied (`engineering/decisions/`). The Drive original is left untouched.

Card numbers are kept. Each card carries a **V2 status**:

- **Unchanged:** only paths and wording brought up to date (`docs/` to `engineering/`, AGENTS.md rules).  
- **Changed:** the card's work or acceptance changed. A "Changed" and a "Why" line say what and why.  
- **Replaced:** the card's purpose stays, the method is new.  
- **Withdrawn:** not needed as a build step; kept for the record.  
- **New:** T31 (port the GTFS schedule loader) and M01 (model tooling).

Changes that apply to every card, and are not repeated on each:

| V1 | V2 | Why |
| :---- | :---- | :---- |
| `docs/plan.md`, `docs/contract/`, `docs/sources/`, `docs/learning/`, `docs/decisions/`, `docs/runbooks/` | `engineering/build-plan.md`, `engineering/contract/`, `engineering/sources/`, `engineering/learning/`, `engineering/decisions/`, `engineering/runbooks/` | The Drive sync deletes anything written in `docs/` |
| `docs/wireframes/` | `drive/08 Map Application/Wireframes/` (read only) | Same |
| GitHub secrets and cloud app settings | Environment variables or git-ignored local config | No cloud; public repository |
| Azure anything | Local on the build machine | No Azure, no paid cloud (16 Nov) |
| DuckDB | PostgreSQL \+ PostGIS | Decided 20 Nov |
| Keep all raw data | Raw files kept 7 days; parsed history and `bronze.feed_fetch` rows kept | Decided 21 Nov |
| Plan facts as of 15 Nov | Design facts date from 12 to 20 Nov; confirm everything at build time | Rule 4 |

## How to give a card to an agent

Open each prompt with these two lines, then paste the card from "Card" down:

```
You are the <role> on the Halifax Digital Twin map application.
Follow the rules in AGENTS.md and read CLAUDE.md, PROJECT_CONTEXT.md and engineering/build-plan.md first.
```

## Order of work

| Order | Cards | Note |
| :---- | :---- | :---- |
| Release 1 | Session 0 documents; T03 with T31; T20 and T21 (PWK-Q13, HRE-Q29 only); T05 with T08; T06, T07, T09, T10; the Cesium part of T29 | Five workstreams in parallel (`engineering/build-plan.md`, section 7). Three sectors come before Gate 2 in this release |
| Gate 0 |  | 48 hours archived with no gap over 2 minutes; contract approved; shell opens on a phone |
| Next | T04, T02 (for the record), T11, T12 | Unattended collector, source note, verification of TRN-Q01 |
| Gate 1 |  | Live answer checked against the raw feed |
| After release 1 | M01; T19; T27, T28, T30, then the rest of T29 | Model tooling, Replay, 3D settings, own 3D model, pins |
| History | T13, then T14, T16, T17, T18 | First history stories |
| Gate 2 |  | One story served from Gold, end to end, checked with SQL |
| Sectors | T22, T23 (remaining wave D stories) |  |
| Gate 3 |  | Three sectors live in City view |
| City | T24, T25, T26 |  |
| Gate 4 |  | One cross-sector story and one embedded BI panel |
| Optional | T15 | Learning sprint only |

## Standard rules

The rules are in `AGENTS.md` and apply to every card. Stop and ask the architect when a source is not open or its licence is unclear, when a business rule or model name is missing, when the acceptance check cannot be met as written, when a step would cost money, or when you need a key or account you were not given.

---

## Stage 0: Foundations

### T01 Scaffold the repository

Role: Lead. After: none. **V2 status: changed.**

Changed: the repository exists; session 0 (branches `s00-initialize` and `s00-docs`) wrote `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.env.example`, the build plan, decisions and the setup runbook. Engineering folders are under `engineering/`, not `docs/`. No `data/` folder for DuckDB SQL. The plan is not copied into `docs/`. `config/business-rules.yaml` and `config/sectors.json` are written by the serving API workstream (T05) in release 1\. What remains is CI, the emoji check, the pull request template and secret scanning. Why: work done since 15 Nov; the Drive sync deletes anything in `docs/`; DuckDB not needed.

Card T01: Scaffold the repository Question served: Foundation Depends on: none

Goal: Give every later card a place to work, with checks that run on every pull request.

Build:

- Confirm the folders in the build plan, section 4, exist or are created by their workstreams: `apps/web`, `services/collector`, `services/api`, `config`, `database/gold`, `assets/pins`, `engineering` (`contract`, `decisions`, `runbooks`, `learning`, `sources`), `scripts`.  
- Add CI on GitHub Actions (free for public repositories; confirm at build time): lint and tests for the web app, the collector and the API on every pull request. Tests that need PostgreSQL use a PostGIS service container.  
- Add a CI check that fails when an emoji code point appears in source, interface text or documents (excluding `drive/` and `docs/`, which are Drive copies).  
- Add a pull request template with two required headings: How I verified, and Learning note.  
- Turn on GitHub secret scanning and push protection (free for public repositories) and check `.gitignore` excludes `.env`, `.env.*` except `.env.example`, and `*.local.json`.  
- Update the README so it explains how to run each part locally.

Done when: CI is green on each part's tests. The README runs each part.

Also stop and ask when: ask which open-source licence the repository should carry before adding one.

### T02 Source note for Halifax Transit

Role: Source scout. After: T01. **V2 status: changed.**

Changed: the demo confirmed the four addresses on 20 Nov (all on http) and the transit collector already runs; this card now records the facts properly rather than unblocking the collector. Output goes to `engineering/sources/halifax-transit.md`; fixtures go beside the collector's tests. Why: work done in the demo; `docs/` is a mirror.

Card T02: Source note for Halifax Transit Question served: TRN-Q01 and every later transit question Depends on: T01

Goal: Establish the facts about the transit feeds that every later card depends on.

Build:

- Confirm the four addresses and whether each answers on https: the schedule file `gtfs.halifax.ca/static/google_transit.zip`, and the live feeds `gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb`, `.../TripUpdate/TripUpdates.pb` and `.../Alert/Alerts.pb`. Check them against the HRM open data page.  
- Poll each live feed every 10 s for 2 hours, or measure from `bronze.feed_fetch` if the collector already runs. Record how often the feed header timestamp changes, the payload size, and the number of entities.  
- Record which fields are filled in: position, bearing, speed, trip and route ids, stop sequence, delay, occupancy.  
- Check whether ferries appear in the schedule and in the live feeds.  
- Copy the licence name, the licence address and the exact attribution wording HRM asks for.  
- Note any stated rate limit or fair-use rule, and whether HRM still calls the feed a beta.  
- Save three sample payloads of each feed under the collector's `tests/fixtures/`.  
- Write everything to `engineering/sources/halifax-transit.md`.

Done when: the note has the addresses, measured refresh rate, sizes, fields, ferry finding, licence and attribution.

Also stop and ask when: a feed is unreachable for more than an hour, or the licence does not clearly allow this use.

### T03 Transit collector (port of the demo collector)

Role: Collector engineer. After: T01. **V2 status: replaced.** Release 1, workstream B, branch `t03-transit-collector`.

Changed: port the working demo collector (`origin/d08a-live-summary`: `demo/loaders/common.py`, `demo/loaders/transit_realtime/`) instead of writing one from scratch. It writes raw files plus one `bronze.feed_fetch` row per download (instead of hourly manifest files) and parses into Silver in the same cycle. Storage is local only; the Azure Blob Storage implementation is dropped. Raw files are deleted after 7 days. The live-cache hook is not needed in release 1 because the API reads the latest rows from Silver. Why: the demo collector works and writes the real Silver tables; no Azure; Bronze register decided 16 and 20 Nov; retention decided 21 Nov.

Card T03: Transit collector Question served: TRN-Q01 and all history questions Depends on: T01

Goal: Archive every raw response from the transit feeds and load it into Silver, unattended, so history starts as early as possible.

Build:

- Port `common.py` and `transit_realtime/` into `services/collector/`, one package for this source, with their tests, the README mapping table and the learning notes. Keep behaviour.  
- Replace the demo's import of `api.settings` with the collector's own settings, reading `HALIFAX_TWIN_DB_URL` and `HALIFAX_TWIN_DATA_DIR`.  
- Poll each live feed on the interval in the settings (30 s). Save raw bytes gzipped under the data root; store forward-slash relative paths in `bronze.feed_fetch.file_path`.  
- Write vehicle positions, trips, stop arrivals and service alerts into Silver in one transaction per cycle, with the model's names exactly. Keep `trip.scheduled_trip_id` empty as the demo does (open question on `ak1_trip`).  
- Once a day, delete raw files older than `raw_retention_days` (7, from `config/business-rules.yaml`; same default in code if the file is absent). Never delete `bronze.feed_fetch` rows.  
- Retry with backoff. A failed poll is logged and recorded, and the loop carries on.  
- Add scratch-database tests for the store (the demo had none).  
- Write `scripts/collector-start.ps1` and `scripts/collector-stop.ps1` (stopping both Python processes the venv launcher starts).

Done when: tests pass, the collector runs detached against `halifax_twin`, positions and arrivals accumulate, and `bronze.feed_gap` shows no gap over 2 minutes in the first hour.

Also stop and ask when: the feed format differs from GTFS Realtime in a way that breaks parsing, or a needed Silver column does not exist.

### T04 Run the collector unattended and watch it

Role: Collector engineer. After: T03. **V2 status: replaced.**

Changed: instead of deploying to Azure Functions with Blob Storage and a US\$5 budget alert, the collector runs on the build machine, started at logon by Windows Task Scheduler. The gap report reads `bronze.feed_gap` instead of manifest files. The stale alert is local (log and the API's `/v1/sources` status), not a cloud alert. No infrastructure as code. Why: no Azure, no paid cloud (16 Nov); collector hosting decided 16 Nov; Bronze register.

Card T04: Run the collector unattended and watch it Question served: TRN-Q01 and all history questions Depends on: T03

Goal: Keep the collector running day and night on the build machine, and know within minutes when it stops.

Build:

- Write `scripts/collector-register-task.ps1`: a Windows Task Scheduler task at logon that starts the database if needed, then the collector. The architect runs it after reading it.  
- Write a gap report (SQL over `bronze.feed_gap`) that lists every gap over 2 minutes for any window.  
- Mark the transit source "down" in `/v1/sources` when no fetch has succeeded for 5 minutes, and write a warning to the collector log.  
- Check the Windows power settings that would stop the collector (sleep, hibernate, updates restarting the machine) and list them for the architect.  
- Measure raw storage used per day after 48 hours and the steady size under the 7-day retention; record both in the source note.  
- Write `engineering/runbooks/collector.md`: how to start, stop, check, restart after a reboot, and read the gap report.

Done when: 48 hours are archived with no gap over 2 minutes (Gate 0). Storage per day is measured and recorded.

Also stop and ask when: the machine cannot stay on and awake for 48 hours, or the architect has not chosen which machine runs the collector.

### T05 Contract version 0

Role: API engineer. After: T01. **V2 status: changed.** Release 1, workstream D, branch `t05-serving-api`.

Changed: the file is `engineering/contract/openapi.yaml` with examples in `engineering/contract/examples/`. The endpoints, envelope, feature properties and release 1 numbers are fixed in the build plan, section 6\. Two additions are proposed, not approved: `GET /v1/sectors` and `GET /v1/replay/{layer}`. `config/business-rules.yaml`, `config/sectors.json`, `config/layers.json` and the story files are written here in release 1\. The mock server is optional: the web app builds against the example files. Why: `docs/` is a mirror; the contract was settled in more detail on 21 Nov; workstream ownership.

Card T05: Contract version 0 Question served: Foundation Depends on: T01

Goal: Write down the one thing the map is allowed to read, before anything is built on either side of it.

Build:

- Write `engineering/contract/openapi.yaml` in OpenAPI 3.1 with the seven read-only endpoints in the build plan, section 6, and example responses for each.  
- Define the envelope every response uses: `data`, `as_of`, `source`, `reliability_tier`, `licence`.  
- Define a feature as GeoJSON with the conformed-core keys: `kind` (location, asset or event), `sector_id`, `subsector_id`, `id`, `source_key`, plus layer fields.  
- Give the worked example for vehicles: `label`, `route_short_name`, `headsign`, `status` (on\_time, late, early, unknown), `delay_seconds`, `next_stop_name`, `bearing`, `position_ts`.  
- Define a story: id, question, sector and subsector, lenses, answer template and numbers, evidence layers, context series, trust.  
- Define the error format and the rule for version changes.  
- Mark the two proposed endpoints clearly as proposals.  
- Add a contract test the API must pass.

Done when: the architect approves the file. The examples validate against it.

Also stop and ask when: an endpoint needs an entity or column name that the logical model has not fixed.

### T06 Map shell

Role: Map engineer. After: T05. **V2 status: changed.** Release 1, workstream E, branch `t06-web-app`.

Changed: no Azure Static Web Apps and no per-pull-request preview links; the app runs locally. Phone checks use a phone-sized viewport or a phone on the home network. The basemap is a Protomaps PMTiles extract of the Halifax area kept in `C:\halifax-twin-data\tiles\`, not committed; no hot-linked OpenStreetMap tiles for anything public. The 3D switch is driven by `/v1/client-config` (Cesium ion), not a Google key. Why: no Azure (16 Nov); web hosting local first (16 Nov); 3D through Cesium ion (20 Nov).

Card T06: Map shell Question served: Foundation Depends on: T05

Goal: Stand up the application on phone and laptop, laid out as the wireframes show.

Build:

- React \+ TypeScript \+ Vite. Draw the 2D map with MapLibre GL JS and the Protomaps extract, with the OpenStreetMap credit.  
- Laptop layout: header with search, left rail of pinned sectors, map, right panel. Follow wireframes 01 to 03\.  
- Phone layout: search, a scrolling chip row of pinned sectors, map, and a bottom sheet with three heights. Follow wireframes 04 to 06\.  
- Add the lens switch (Live, Replay, Analytics), the 2D and 3D switch, and the list view entry.  
- Load stories from `GET /v1/stories` (example files until the API is up).  
- Design the loading, empty, error, stale and source-down states. Use skeletons, not spinners.  
- Keep story, lens, time and selection in the address so any view can be shared.  
- Create the language file (French-ready) and the shared number and date formatter (units always shown, 24-hour clock, dates as 21 Nov 2026).  
- Make it installable as a PWA. Cache the app shell only. Never cache Google tiles.

Done when: it opens at laptop and phone sizes, the first map shows in under 3 seconds on a mid-range phone profile, and it installs.

Also stop and ask when: the basemap extract cannot be made for free; then use a plain vector fallback and say so.

### T07 Design tokens and parts

Role: Map engineer. After: T06. **V2 status: unchanged.** Release 1, workstream E.

Card T07: Design tokens and parts Question served: Foundation Depends on: T06

Goal: Build the small set of parts every story reuses, to the interface rules.

Build:

- Define tokens for colour, type sizes and spacing as CSS variables. One typeface family (IBM Plex Sans) with tabular figures.  
- Build the parts: rail item, sector chip, All sectors browser (from `config/sectors.json`: 17 sectors, 5 groups, at most 5 pins), search box, bottom sheet, answer sentence, numbers strip, legend, trust footer.  
- Show status by shape as well as colour: disc for on time, diamond for late, ring for early.  
- Add a gallery page that shows every part in every state.  
- Add automated accessibility checks. Check keyboard use and the focus outline by hand. 44 px touch targets; respect reduced motion.

Done when: every part renders in the gallery. Contrast meets WCAG 2.2 AA. The automated checks pass.

Also stop and ask when: a wireframe and an interface rule disagree.

### T27 3D settings and handover height

Role: Map engineer. After: T01. **V2 status: changed.**

Changed: the engine is chosen (CesiumJS, proved in the demo on 20 Nov) and the tiles come through Cesium ion with the architect's token, not a Google Maps Platform key. The three-engine comparison becomes optional; the card measures CesiumJS settings on the architect's devices and finds the handover height. Usage is counted against Cesium ion's free plan terms, confirmed at build time, instead of "1,000 Google sessions a month". Why: 3D decision of 20 Nov.

Card T27: 3D settings and handover height Question served: Foundation for the realistic 3D view Depends on: T01

Goal: Choose the CesiumJS settings and the handover height for the realistic 3D view from measurements on the architect's own devices.

Build:

- Build a minimal CesiumJS page that loads Google Photorealistic 3D Tiles through Cesium ion over downtown Halifax (about 44.6488 N, 63.5752 W), reading the token from the API on localhost only.  
- Fly a scripted camera path: citywide, then the harbour, then down toward a street.  
- Measure on the architect's phone and laptop: time to the first sharp view, average and worst frame time, memory, and tile requests. On the workstation, also with GPU throttling.  
- Find the camera height at which the mesh stops looking real. Start at 300 m from the ground.  
- Try the settings that trade detail for speed (maximum screen-space error, simultaneous requests, tile cache size, render on change, capped pixel ratio) and propose a small-device profile.  
- Confirm the Google and Cesium credits display correctly.  
- Record the usage the test consumed against the ion free plan, as reported by ion.  
- Optional: compare 3DTilesRendererJS or deck.gl only if CesiumJS cannot meet the frame-time target.  
- Write `engineering/decisions/<date>-3d-settings.md` with the numbers, recordings and a recommendation.

Done when: a one-page result with numbers and recordings. The architect picks the settings and the handover height.

Also stop and ask when: no Cesium ion token has been set, or Halifax is not covered at usable quality.

### T28 The twin's own 3D model

Role: Source scout, Data engineer. After: T01. **V2 status: unchanged.**

Card T28: The twin's own 3D model Question served: Foundation for the realistic 3D view Depends on: T01

Goal: Build a 3D city the project owns, from open data, for close-up views and as the fallback.

Build:

- Write source notes in `engineering/sources/` for HRM building outlines, the HRM 1 m LiDAR ground and surface models, and the provincial LiDAR point cloud. Check each licence.  
- Compute each building's height from the surface model minus the ground model inside its outline (PostGIS raster or a free GIS tool; record the choice).  
- Produce simple extruded buildings with height, ground elevation and a building id, on terrain from the ground model.  
- Publish them as 3D Tiles with a free, open-source tiler of your choice, written under `C:\halifax-twin-data\tiles\`, not committed. Record the choice and why.  
- Keep the building id and source key on every building so a story can colour it later.  
- Start with downtown Halifax and one suburb, then extend to the municipality.  
- Check the heights of 10 known buildings against published heights and report the differences.

Done when: downtown and one suburb load in the browser. The 10 height checks are reported.

Also stop and ask when: a source is not open, or the LiDAR is too old to match current buildings downtown.

---

## Stage 1: Live buses

### T08 Live adapter and the vehicles endpoint

Role: API engineer. After: T03, T05. **V2 status: changed.** Release 1, workstream D.

Changed: the API reads the latest vehicle positions, trips and stop arrivals that the collector writes into Silver, plus `gold.planned_stop_time`, instead of decoding the feeds itself into an in-memory cache. FastAPI with `psycopg` 3 and a pool, bound to 127.0.0.1 port 8010\. Release 1 implements every contract endpoint, not only the vehicle ones. Why: the ported collector already parses the feeds into Silver; one parser, one set of names.

Card T08: Live adapter and the vehicles endpoint Question served: TRN-Q01 Depends on: T03, T05

Goal: Serve every bus's position and on-time status within seconds of the collector storing it.

Build:

- Query the latest position per vehicle and its trip from Silver, with route name, headsign and next stop from the current schedule version.  
- Take the delay from the latest trip update for the next stop. When there is none, the status is unknown.  
- Apply the on-time rule from `config/business-rules.yaml`.  
- Serve `GET /v1/live/vehicles`, the TRN-Q01 numbers, `GET /v1/sources` and `GET /v1/features/asset/{id}`, all matching the contract.  
- Mark the source stale after 2 minutes. One failing source returns its own error and never breaks other layers. Never return raw exception text.  
- Drop any field that could identify a person.  
- Test with seeded rows in a scratch database and the contract test.

Done when: it passes the contract test and the scratch-database tests, and responds in under 300 ms.

Also stop and ask when: trip updates do not carry enough to compute a delay for most buses.

### T09 Story TRN-Q01 on the 2D map

Role: Map engineer. After: T06, T07, T08. **V2 status: changed.** Release 1, workstream E.

Changed: draw vehicles with MapLibre layers or deck.gl, whichever stays smooth on a mid-range phone (V1 required deck.gl). Why: the release 1 plan builds 2D on MapLibre; the choice is the map engineer's, measured.

Card T09: Story TRN-Q01 on the 2D map Question served: TRN-Q01: Where is every bus right now, and is it on time? Depends on: T06, T07, T08

Goal: Answer the first question on the map, in one sentence with its numbers.

Build:

- Draw the live vehicles over the MapLibre map.  
- Move each bus smoothly between updates. Never let it jump.  
- Show status by the base shape and colour, with the legend.  
- Add the route filter.  
- Write the answer sentence and the numbers strip from the numbers endpoint, through the formatter.  
- Refresh on an interval with backoff when the API is slow.

Done when: every bus in the feed is on the map. The layer stays smooth on a mid-range phone profile.

Also stop and ask when: the story needs something the contract does not provide.

### T10 Feature detail, trust footer and stale states

Role: Map engineer. After: T09. **V2 status: unchanged.** Release 1, workstream E.

Card T10: Feature detail, trust footer and stale states Question served: TRN-Q01 Depends on: T09

Goal: Let the user open one bus, and always show how far the data can be trusted.

Build:

- Open a card for the selected bus: route and destination, status in words, next stop, data age. Follow wireframes 03 and 06\.  
- Add Open detail and Follow.  
- Show the trust footer: source, time of last update, reliability tier, and a link to the sources page.  
- Show a running data-age clock. Mark the layer stale when the data is older than 2 minutes.  
- When the source is down, grey out only that layer and show the last good time.

Done when: cutting the feed in a test greys the layer and shows the last good time. Nothing else changes.

Also stop and ask when: none beyond the standard ones.

### T11 Verify TRN-Q01

Role: Verifier. After: T10. **V2 status: changed.**

Changed: raw files are kept for 7 days only, so the three sample moments must be inside that window and the raw files named in the report before they are deleted. Recompute with your own decoder and your own SQL; the definition of done is in `AGENTS.md`. Why: raw retention decided 21 Nov.

Card T11: Verify TRN-Q01 Question served: TRN-Q01 Depends on: T10

Goal: Check the answer independently, from the raw files, without reading the build's code.

Build:

- Work in a fresh session. Do not read the collector's or the API's code.  
- At three moments in the last 7 days, capture the API response and note the matching raw files (`bronze.feed_fetch`).  
- Decode those raw files with your own script and apply the on-time rule yourself.  
- Compare the count of buses and the count in each status with the API and the screen.  
- Go through the definition of done, item by item.  
- Report pass or fail with the evidence. Do not fix anything.

Done when: a pass or fail report against the definition of done.

Also stop and ask when: the raw files for a chosen moment are missing.

### T12 Demo script and learning note for Gate 1

Role: Lead. After: T11. **V2 status: changed.**

Changed: the demo opens the app on the build machine or on a phone on the home network, not from a hosted preview link. Cutting the feed means stopping the collector. Why: web hosting local first (16 Nov).

Card T12: Demo script and learning note for Gate 1 Question served: TRN-Q01 Depends on: T11

Goal: Let the architect run the Gate 1 demo alone and understand what was built.

Build:

- Write a step-by-step demo: start everything, open the app at phone size, find the story, read the answer, open a bus, stop the collector and watch the layer go stale.  
- Write one page on how live data travels from the feed to the screen, with the file, table and function names.  
- List three exercises the architect can do by hand, for example decoding one raw file in a notebook and finding the same bus in `silver.vehicle_position`.

Done when: the architect can run the demo alone.

Also stop and ask when: none beyond the standard ones.

### T29 Realistic 3D view

Role: Map engineer. After: T09, T27, T28. **V2 status: changed.** Release 1 builds the Cesium ion part only (workstream E).

Changed: tiles come through Cesium ion with the architect's token (`CESIUM_ION_TOKEN`, given to the page only on localhost), not a Google Maps Platform key. Usage limits are ion's free plan terms, confirmed at build time. With no token, the 3D switch is disabled with a note and 2D carries on; once T28 exists, the twin's own model becomes the no-token 3D fallback. Why: 3D decision of 20 Nov; secrets decision of 20 Nov.

Card T29: Realistic 3D view Question served: TRN-Q01 in 3D Depends on: T09, T27, T28

Goal: Show the city in realistic 3D, with live buses in it, without depending on Google.

Build:

- Use CesiumJS with the settings the architect chose after T27. Load CesiumJS only when `/v1/client-config` says 3D is available.  
- Draw Google Photorealistic 3D Tiles through Cesium ion from above. Hold a camera floor at the handover height.  
- Below that height, cross over to the twin's own model from T28.  
- Place the live buses in the scene, using the pins from T30 when they exist.  
- Display Google's logo and data credits, and Cesium's, as their terms require.  
- Stay within the ion free plan; when it would be exceeded, stop loading Google tiles and fall back to the twin's own model.  
- With no token, show the twin's own model, or 2D until T28 exists. On a weak device, start in 2D and offer 3D.  
- Turn off fly-through animation when the device asks for reduced motion.  
- Never store or cache Google tiles, and never derive data from them.

Done when: flying over downtown stays smooth on the test phone profile. Removing the token still leaves a working map.

Also stop and ask when: no token has been set and the twin's own model does not exist yet (ship 2D and say so).

### T30 Pin pipeline

Role: Map engineer. After: T27. **V2 status: changed.**

Changed: Blender is not installed on the build machine; it is free, and the architect installs it when this card starts. The architect's bus renders (front, rear, side) exist in the demo (`demo/web/img/`) and may serve as the flat far level until a model exists. Why: build machine state on 21 Nov; demo assets kept.

Card T30: Pin pipeline Question served: Foundation for all pins Depends on: T27

Goal: Turn one Blender file per pin family into everything the map needs, the same way every time.

Build:

- Write `assets/pins/README.md` for the Blender artist: build in metres, origin on the ground at the centre, one fixed forward direction, naming, materials, and the size budgets from the plan.  
- Write an export script that runs Blender from the command line and produces the near and middle models as compressed GLB and the far level as a flat image.  
- Write a check that fails when a file is over its budget.  
- Create `assets/pins/pins.json`, the register that maps each kind of thing to its pin files.  
- Draw the status base in the application, not in the model, so one model serves every status.  
- The bus is the first family. If no Blender model has been provided, use the demo renders for the flat level and a plain placeholder model, and say so clearly.

Done when: the bus pin shows at all three levels in 3D and as a flat image in 2D, inside the budget, with its status base.

Also stop and ask when: Blender is not installed, or CesiumJS cannot load the compressed format.

### T31 Port the GTFS schedule loader

Role: Collector engineer. After: T01. **V2 status: new.** Release 1, done with T03 on branch `t03-transit-collector`.

Why new: the demo built a working schedule loader for SRC-004 that V1 did not foresee (V1 only archived the schedule file). Stops, routes, scheduled trips and stop times in Silver are what the live adapter needs to name routes, headsigns and next stops, and what every on-time number is measured against.

Card T31: Port the GTFS schedule loader Question served: TRN-Q01 and every schedule-based transit question Depends on: T01

Goal: Load every Halifax Transit schedule version into Silver, keeping old versions beside new ones.

Build:

- Port `origin/d08a-live-summary:demo/loaders/gtfs_schedule/` into `services/collector/` as its own package, with its tests, README mapping table and learning note, and `demo/sql/gold_planned_stop_time.sql` into `database/gold/`.  
- Load stops and routes as location \+ asset \+ stop or route (route lines from shapes); retire missing ones as Inactive; load the schedule version, service calendars and exceptions, scheduled trips and scheduled stop times (COPY for volume). Model names exactly.  
- Give `calendar_dates.txt` services that have no `calendar.txt` row a calendar row with no weekdays spanning their dates, as the demo does.  
- Save the raw schedule file once per version (by hash) under the data root, with a `bronze.feed_fetch` row.  
- Add scratch-database tests; a second run of the same file adds no history rows.  
- Load the current file into `halifax_twin`. The current period ends 29 Nov 2026; note in the README how to load the next one.

Done when: tests pass, the schedule is loaded, `gold.planned_stop_time(day)` returns today's plan, and a re-run adds no history rows.

Also stop and ask when: a GTFS file uses a field or value the model has no column or code for.

---

## Stage 2: First history

### T13 Reconcile Silver with Bronze

Role: Data engineer. After: T04. **V2 status: replaced.**

Changed: V1 decoded the archive into Parquet with DuckDB as a prototype of Silver. Silver now exists in PostgreSQL and the collector writes it directly, so this card checks that Silver faithfully holds what Bronze received. Why: DuckDB not needed (20 Nov); the collector writes Silver.

Card T13: Reconcile Silver with Bronze Question served: all history questions Depends on: T04

Goal: Prove that the history in Silver matches the raw files, before anything is built on it.

Build:

- For a sample of fetches inside the 7-day raw window, decode the raw files independently and compare entity counts with the rows written to Silver for that fetch.  
- Write the comparison as repeatable SQL plus a small script; one command reruns it.  
- Report any fetch whose counts differ, and why (duplicates, entries with no trip id, filtering).  
- Describe it in `engineering/learning/t13-reconcile.md` as an example of pipeline reconciliation.

Done when: one command reruns the reconciliation, and differences are explained or fixed.

Also stop and ask when: a difference points to a model gap rather than a loader bug.

### T14 Story TRN-Q07

Role: Data engineer, Map engineer. After: T06, T31. **V2 status: changed.**

Changed: depends on the schedule in Silver (T31) instead of DuckDB tables (T13). The layer and numbers come from SQL (Gold) through the API, not from files. Why: PostgreSQL platform (20 Nov).

Card T14: Story TRN-Q07 Question served: TRN-Q07: Which neighbourhoods are more than a 5-minute walk from frequent service? Depends on: T06, T31

Goal: Answer the first analytics question while history builds up.

Build:

- Find and document an open source of neighbourhood boundaries in `engineering/sources/`.  
- From the schedule, find the stops with frequent service under the rule in `config/business-rules.yaml`.  
- Draw the area within the walking distance of those stops (PostGIS), and the neighbourhoods outside it.  
- Compute the answer sentence. Use only measures the data supports.  
- Put any new tables in `gold`, and serve the layer and numbers through `GET /v1/layers` and `GET /v1/numbers`.  
- Have the verifier check the result independently.

Done when: the story is live and passes verification.

Also stop and ask when: the architect has not confirmed the two rules and the interim defaults would mislead.

### T15 Platform test

Role: Data engineer. After: T04. **V2 status: withdrawn as a build step; optional learning sprint.**

Changed: the platform is decided (PostgreSQL \+ PostGIS). Loading a day of data into Databricks Free Edition remains available only as a learning exercise for the architect's certification track, never as a dependency. Why: platform decision of 20 Nov.

If run: export one day of Silver to files, load it into Databricks Free Edition, query it, and write `engineering/learning/t15-databricks.md`. Do not start the Microsoft Fabric trial; that is the architect's decision. Stop if the platform asks for payment details.

### T16 Silver to Gold for transit

Role: Data engineer, with the architect. After: T13 and the physical model. **V2 status: changed.**

Changed: Bronze to Silver is already done by the loaders, so this card is Silver to Gold: Kimball stars in the `gold` schema. The source-to-target mapping comes from each loader's mapping file and M01's generated documents. Reconcile against an independent SQL check, not T13's DuckDB tables. The tool for Silver to Gold is proposed in the card's pull request (dbt-core is a free candidate). Why: PostgreSQL platform (20 Nov); erwin retired (21 Nov).

Card T16: Silver to Gold for transit Question served: wave C questions Depends on: T13 and the physical model

Goal: Build the first Gold star for transit, exactly as modelled.

Build:

- Propose the Gold star (facts, dimensions, grain) for the wave C questions and get the architect's agreement.  
- Use the entity, column and key names from the model and the mapping. Invent none.  
- Add data quality checks at each layer, each with an id, a severity and a threshold.  
- Reconcile Gold against an independent SQL query over Silver for one sample week.  
- The architect builds the first pipeline by hand. Your part is to pair, review and then extend.

Done when: Gold reconciles with Silver on a sample week.

Also stop and ask when: the model or the mapping is missing something you need.

### T17 Serving Gold through the API

Role: API engineer. After: T16. **V2 status: changed.**

Changed: the API reads Gold directly with SQL; the map still never touches the database. Publishing results as files to storage is needed only if a measured performance problem calls for it, and then to local disk. Why: no cloud storage; the API already holds a database pool.

Card T17: Serving Gold through the API Question served: wave C questions Depends on: T16

Goal: Carry results from Gold to the map without the map ever querying the warehouse.

Build:

- Serve Gold results through `GET /v1/numbers` and `GET /v1/layers`, with `as_of`, source and reliability tier from the load metadata.  
- Add sensible cache headers.  
- Only if a response is too slow, precompute it to a file under the data root and serve that; record the measurement.

Done when: a change in Gold reaches the map with no code change.

Also stop and ask when: none beyond the standard ones.

### T18 Stories TRN-Q02, Q05, Q04, Q03, Q11

Role: Map engineer, Verifier. After: T17. **V2 status: changed.**

Changed: the verifier recomputes from Silver with independent SQL (and raw files inside the 7-day window), not from T13's DuckDB tables. These questions need 2 to 4 weeks of archived history. Why: PostgreSQL platform; raw retention.

Card T18: Stories TRN-Q02, Q05, Q04, Q03, Q11 Question served: TRN-Q02, TRN-Q05, TRN-Q04, TRN-Q03, TRN-Q11 Depends on: T17

Goal: Answer the history questions one at a time, each finished before the next starts.

Build:

- Before each story, write its definition in one paragraph and get the architect's agreement. For example, what counts as a trip that never ran.  
- Add the story file, its numbers, its layer and its chart.  
- Have the verifier recompute the answer with its own SQL over Silver.  
- Start the next story only when this one meets the definition of done.

Done when: each story meets the definition of done. The first one passes Gate 2\.

Also stop and ask when: a definition is not agreed, or there is not yet enough history.

### T19 Replay lens

Role: Map engineer, API engineer. After: T17. **V2 status: changed.**

Changed: the contract change is already proposed (`GET /v1/replay/{layer}?minutes=`, build plan section 6). Past positions come from `silver.vehicle_position` (monthly partitions), not from hourly files. Why: positions are kept in Silver; raw files only 7 days.

Card T19: Replay lens Question served: TRN-Q02, TRN-Q03 Depends on: T17

Goal: Play back any past window on the map.

Build:

- Get the proposed replay endpoint approved, or propose a change and wait.  
- Serve past positions for a window from Silver, thinned to what the map needs.  
- Add the time control: pick a window, play, pause, change speed.

Done when: yesterday's evening rush plays back on a phone profile.

Also stop and ask when: the contract change is not approved.

---

## Stage 3: Three sectors

### T20 Source notes for wave D

Role: Source scout. After: Gate 2\. **V2 status: changed.** Release 1 brings PWK-Q13 and HRE-Q29 forward (workstream C).

Changed: in release 1 the street closure or right-of-way permit source (PWK-Q13) and the building permit source (HRE-Q29) are confirmed now, ahead of Gate 2, and recorded in the loader README rather than separate notes. The rest of wave D follows after release 1, as notes in `engineering/sources/`. Why: the architect wants three sectors in release 1 (21 Nov).

Card T20: Source notes for wave D Question served: TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01 Depends on: Gate 2 (release 1: none, for PWK-Q13 and HRE-Q29)

Goal: Establish the facts about each new source before any collector is written.

Build:

- Write one note each for road closures, street and utility work, parks and tree canopy, building permits and property assessment.  
- For each: address, format, refresh rate, fields, licence and attribution, and the source id in the inventory.  
- Check each licence separately. Assessment data (PVSC) may not be under the HRM licence.

Done when: one note per source. Any source that is not open is flagged to the architect.

Also stop and ask when: a source needs an agreement or a fee.

### T21 Loaders for wave D

Role: Collector engineer. After: T20. **V2 status: changed.** Release 1, workstream C, branch `t21-sector-loaders`.

Changed: one small generic ArcGIS REST loader with one configuration per source (each run separately), instead of one package per source. Loaders land raw files and `bronze.feed_fetch` rows and also write Silver (`location` \+ `event` \+ the subtype) in one idempotent transaction. Release 1 covers PWK-Q13 (`road_closure`) and HRE-Q29 (`building_permit`). New `silver.source` rows go through the reference data generator, not hand-written SQL. Why: HRM sources share one ArcGIS REST pattern; the Bronze register and Silver exist (20 Nov); three sectors in release 1\.

Card T21: Loaders for wave D Question served: wave D questions Depends on: T20

Goal: Land each new source in Bronze and Silver, independently of the others.

Build:

- A generic ArcGIS REST loader (paged `query?where=1=1&outSR=4326&f=geojson`), one configuration per source; one source failing does not stop the others.  
- One `bronze.feed_fetch` row per download and the raw file under the data root.  
- Write `location` (geometry, source key) \+ `event` \+ the subtype in one set-based transaction, idempotent on the source key.  
- Add the needed `silver.source` rows by extending the generator and regenerating `08_reference_data.sql`. No schema changes.  
- README with a source-to-Silver mapping table per source and every code value you had to choose.  
- Tests on recorded fixtures, plus one scratch-database test per source.

Done when: each source's data is in Silver with geometry, re-running changes nothing, and stopping one affects no other.

Also stop and ask when: a needed column or code value does not exist in the model.

### T22 City view

Role: Map engineer. After: T21. **V2 status: unchanged.**

Card T22: City view Question served: the city as a whole Depends on: T21

Goal: Show every sector on one map, drawn from what the data says it is.

Build:

- Build the City view: pinned sectors, the All sectors browser, and one event feed.  
- Draw features with one generic renderer driven by `kind` and `sector_id`.  
- Read sectors and groups from `config/sectors.json`, and layers from `config/layers.json`.

Done when: a new sector's features draw with no new map code.

Also stop and ask when: none beyond the standard ones.

### T23 Stories TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01

Role: Data engineer, Map engineer, Verifier. After: T22. **V2 status: changed.** Release 1 does PWK-Q13 and HRE-Q29 first.

Changed: PWK-Q13 and HRE-Q29 are built in release 1 with interim definitions in their story files, labelled "not yet decided", for the architect to confirm at review. Why: three sectors in release 1 (21 Nov).

Card T23: Stories TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01 Question served: TRN-Q25, PWK-Q13, PWK-Q07, HRE-Q29, HRE-Q01 Depends on: T22

Goal: Bring the second and third sectors to life, one story at a time.

Build:

- Agree each story's definition with the architect first (or, in release 1, label it "not yet decided").  
- Take the question wording exactly from the Business Questions register.  
- Build, verify and finish one before starting the next.

Done when: each meets the definition of done. Three sectors are live.

Also stop and ask when: a definition is not agreed.

---

## Stage 4: City as a whole

### T24 Cross-sector stories

Role: Data engineer, Map engineer, Verifier. After: Gate 3\. **V2 status: unchanged.**

Card T24: Cross-sector stories Question served: TRN-Q09, PWK-Q16, HRE-Q07, TRN-Q08 Depends on: Gate 3

Goal: Answer questions that need more than one sector.

Build:

- Agree each definition with the architect first.  
- Join sectors on shared places and times in Gold, not in the browser.  
- Build, verify and finish one before starting the next.

Done when: one is accepted by the architect.

Also stop and ask when: a definition is not agreed.

### T25 Panel host and the first BI report

Role: Map engineer; the architect builds the report. After: T24. **V2 status: changed.**

Changed: the report reads Gold in the local PostgreSQL. Power BI Desktop is free, but publishing or embedding a report may need a paid licence or a trial; Tableau Public is free but publishes its data publicly (acceptable only for open data). Confirm the terms at build time and stop before any licence, trial or account. Comes after release 1\. Why: spend nothing (16 Nov); the handoff flagged T25 for a free-tier check.

Card T25: Panel host and the first BI report Question served: TRN-Q02 Depends on: T24

Goal: Show a report from another tool inside the map, filtered to what was clicked.

Build:

- Confirm which way of publishing a Power BI or Tableau report is free for this use, and report it to the architect before building.  
- Build the panel host: a registered panel opens inside a story or a feature's detail.  
- Level 1: show the published report.  
- Level 2: open it filtered to the clicked route.  
- The report reads Gold. A report that computes its own version of a number is not accepted.

Done when: clicking a route opens the report filtered to that route.

Also stop and ask when: publishing needs a licence, trial or account, or the report cannot be filtered from its address.

### T26 Data on buildings

Role: Map engineer. After: T23, T28. **V2 status: unchanged.**

Card T26: Data on buildings Question served: HRE-Q29 or HRE-Q01 Depends on: T23, T28

Goal: Show a housing answer on the buildings themselves.

Build:

- Colour and raise the twin's own buildings by a story's numbers, such as assessed value or permits.  
- Add the legend and the plain-number alternative in the panel.

Done when: one housing story shows its answer on the buildings themselves.

Also stop and ask when: none beyond the standard ones.

---

## Model tooling

### M01 Model tooling: diagrams, dictionary and checks from the spec

Role: Data engineer. After: release 1\. **V2 status: new.**

Why new: erwin was retired on 21 Nov. The logical model lives in `database/generator/logical_model_spec.py`, so diagrams, the data dictionary (design step 11\) and model checks are generated from it, which keeps them from drifting apart.

Card M01: Model tooling Question served: Foundation (design steps 11 and 12; feeds step 10\) Depends on: release 1 merged

Goal: Generate everything a modelling tool used to give the architect, from the one spec, and fail a test when the spec, the database and the loaders disagree.

Build:

- Generate entity-relationship diagrams from the spec, one per subject area (core, transportation, public works, housing) and one overview, as text-based diagrams (for example Mermaid or Graphviz, both free) rendered to images. Record the choice.  
- Generate the data dictionary from the spec: entity and attribute definitions, data types, keys, domains and valid values, history behaviour, source. Markdown per subject area plus one CSV.  
- Check the dictionary against the live catalogue (`information_schema` and the `COMMENT ON` text) in a scratch database, so a column missing on either side fails a test.  
- Write the naming and typing standards already used (snake\_case, `_ts`, key prefixes, UTC `timestamptz`, `geometry(...,4326)`, audit columns) once, and enforce them with a lint test over the spec and the generated SQL.  
- Check each loader's mapping table or file against the spec: a test fails if a mapping names a column the model does not have.  
- Propose (do not build without approval) where data quality results are recorded.  
- Write `engineering/learning/m01-model-tooling.md` with one exercise: change a definition in the spec, regenerate, and see it in the dictionary and the database comments.

Done when: one command regenerates the diagrams and dictionary; the checks pass on the current model and fail on a deliberately broken copy.

Also stop and ask when: the spec and the database disagree on a name (never "fix" the database to match without approval).