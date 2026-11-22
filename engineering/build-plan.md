# Build plan: release 1 (three sectors on one map)

21 Nov 2026. Written for the builder agents and for the architect's review. It applies the architect's instructions of 21 Nov evening on top of the handoff note and `PROJECT_CONTEXT.md`. Where this plan disagrees with them, this plan records the newer instruction.

## 1. Goal

A working first release of the Halifax Digital Twin map application, running locally on the build machine, good enough to show publicly (screenshots or a screen recording for a LinkedIn post):

- one web map, laptop and phone layouts, built from the six wireframes;
- three sectors with real data: Transportation, Public Works, Housing & Real Estate;
- one story per sector, each answering a registered business question;
- Live and Analytics lenses for transit; a list view equal to the map;
- 2D always works; realistic 3D when a Cesium ion token is present.

Power BI or Tableau panels come after this release and read the same database.

## 2. Decisions taken on 21 Nov (evening)

| Topic | Decision |
| :---- | :---- |
| erwin | Retired. The model lives in `database/generator/logical_model_spec.py`. Diagrams and the data dictionary will be generated from the spec (card M01, after release 1). pgAdmin is used for browsing. |
| PostgreSQL | Version 16 stays. No need to match the demo PC. |
| Raw data retention | Stream for the live map; keep parsed history in the database; keep raw files for a rolling 7 days, then delete them. `bronze.feed_fetch` rows are kept. This replaces the interim rule "keep all raw data". |
| Pace | Session 0 and the first build cards run together tonight. The architect still reviews and merges every pull request. |
| Builders | Opus agents build from this plan, one workstream each. The lead session plans, integrates and verifies. |

Still in force: every rule in `CLAUDE.md` and the handoff note, section 5. Spend nothing. No secrets in the repo. Use the model's names exactly. Never change `silver`. Never write into `drive/` or `docs/`. No emoji, sentence case, Canadian spelling, Halifax time, 24-hour clock, dates as 21 Nov 2026.

## 3. The build machine as set up

| Item | Value |
| :---- | :---- |
| Repository | `C:\Users\emman\OneDrive\Documents\Project\Halifax_Twin_city\halifax-twin-city` (inside OneDrive: keep data and heavy folders out of it) |
| Data root | `C:\halifax-twin-data` (outside OneDrive): `bronze\` raw files, `logs\`, `tiles\`, `worktrees\` |
| Database server | Portable PostgreSQL 16.15 + PostGIS 3.7 in `C:\halifax-twin-data\pgsql`, data in `C:\halifax-twin-data\pgdata`, `localhost:5433`, server time zone UTC. It does not touch the PostgreSQL 16 service already on port 5432. |
| Database | `halifax_twin`, built from `database/sql/run_all.sql`; smoke test passed 21 Nov. |
| Login | User `postgres`. The password is only in `%APPDATA%\postgresql\pgpass.conf`, which `psql` and `psycopg` read by themselves. Never print it, copy it or put it in a file in the repo. |
| Connection string | `postgresql://postgres@localhost:5433/halifax_twin` (no password in it). Environment variable `HALIFAX_TWIN_DB_URL`. |
| psql | `C:\halifax-twin-data\pgsql\bin\psql.exe -h localhost -p 5433 -U postgres -w -d halifax_twin` |
| Python | Use 3.12: `py -3.12 -m venv .venv`. (3.14 and 3.15 are installed but library wheels may be missing.) |
| Node | 24, npm 11. |
| Cesium ion token | Not set yet. Read it from `CESIUM_ION_TOKEN`. Everything must work without it (2D). |

Tests never run against `halifax_twin`. Each workstream creates its own scratch database (for example `halifax_twin_test_api`) with `CREATE DATABASE` and `run_all.sql`, and drops it afterwards or reuses it.

## 4. Repository layout

```
apps/web/                 React + TypeScript + Vite app (workstream E)
services/collector/       Python collectors, one package per source (B: transit; C: hrm_arcgis)
services/api/             FastAPI serving API, contract v0 (D)
config/                   business-rules.yaml, sectors.json, layers.json, stories/*.json (D)
database/                 exists: generator, sql, docs. gold SQL goes in database/gold/
engineering/              build-plan.md, contract/, decisions/, runbooks/, learning/, V2 brief and cards (A)
scripts/                  PowerShell helpers
drive/, docs/             Drive mirror. Never write here.
```

## 5. The three stories

| Story | Question | Source | Silver target | Lens |
| :---- | :---- | :---- | :---- | :---- |
| TRN-Q01 | Where is every bus right now, and is it on time? | SRC-001 to 004 (Halifax Transit feeds and schedule) | `vehicle_position`, `trip`, `stop_arrival`, `service_alert`, `route`, `stop` | Live, Analytics |
| PWK-Q13 | Utility work restricting street access | The street closure or right-of-way permit source in the inventory (confirm the ID and address at build time) | `event` + `road_closure` (+ `event_coverage` only if street segments are loaded) | Live (current closures) |
| HRE-Q29 | Building permits | The HRM building permit source in the inventory (confirm at build time) | `event` + `building_permit` | Analytics (by year and type), map of recent permits |

Take the exact question wording from `docs/01 Requirements and Domains/` or `drive/01 Requirements and Domains/Buisness_Questions .xlsx` (all three tabs). If a source cannot be confirmed open and reachable, pick the next Open, High priority question of the same sector from the plan's waves D and E, say so in the report, and do not invent data.

`event_type_code` and `asset_type_code` hold the entity name from the spec, as the demo loaders do ("Trip", "Stop Arrival", "Road Closure", "Building Permit").

## 6. Serving API: contract v0

Read-only. Base path `/v1`. Every response uses the envelope:

```json
{ "data": ..., "as_of": "2026-11-21T23:15:04Z", "source": [{"source_id": "SRC-001", "name": "...", "publisher": "..."}], "reliability_tier": "Tier 1", "licence": "Contains information licensed under the Open Government Licence – Halifax" }
```

| Endpoint | `data` |
| :---- | :---- |
| `GET /v1/stories` | List: `id`, `question`, `sector_id`, `subsector_id`, `lenses`, `status` |
| `GET /v1/stories/{id}` | One story configuration: `question`, `answer` (`template` with `{number_id}` placeholders, `numbers`), `evidence` (`layers`, each `layer`, `path` live or layers, `legend`), `context` (`number_id` of a series, `title`), `trust` (`source_ids`) |
| `GET /v1/live/{layer}` | GeoJSON FeatureCollection. Release 1: `vehicles` |
| `GET /v1/layers/{layer}` | GeoJSON FeatureCollection. Release 1: `routes`, `stops`, `road-closures`, `building-permits`. Optional `bbox`, `limit` |
| `GET /v1/numbers/{id}` | `id`, `label`, `value`, `unit`, optional `series` of `{ "t": ..., "value": ... }` |
| `GET /v1/features/{kind}/{id}` | Detail for one location, asset or event: `properties`, `history` |
| `GET /v1/sources` | `source_id`, `dataset_name`, `publisher`, `licence`, `reliability_tier`, `last_loaded_ts`, `status` (ok, stale, down) |

Every feature's `properties` carry `kind` (location, asset or event), `sector_id`, `subsector_id`, `id`, `source_key`, plus layer fields. For `vehicles`: `label`, `route_short_name`, `headsign`, `status` (on_time, late, early, unknown), `delay_seconds`, `next_stop_name`, `bearing`, `position_ts`.

Numbers for release 1: `trn.buses_live`, `trn.on_time_share`, `trn.on_time_count`, `trn.late_count`, `trn.early_count`, `trn.on_time_share_24h` (series by hour), `pwk.closures_active`, `hre.permits_ytd`, `hre.permits_by_year` (series). Add others only if a story needs them.

Proposed additions, flagged for the architect's approval (the contract has seven endpoints; these are not in it): `GET /v1/sectors` (the sector register: 17 sectors, 5 groups, pinned, question counts, status live or planned) and `GET /v1/replay/{layer}?minutes=` (recent positions for the Replay lens). Operational endpoints outside the contract: `GET /v1/health`, `GET /v1/client-config` (business rules for display, whether 3D is available, and the Cesium token only when the request comes from localhost).

The API workstream writes `engineering/contract/openapi.yaml` and example responses in `engineering/contract/examples/` first, so the web workstream can build against them.

## 7. Workstreams

Each workstream has its own branch and git worktree under `C:\halifax-twin-data\worktrees\`, and owns the paths listed. Do not edit paths another workstream owns; you may read other worktrees. Commit to your branch. Do not push, do not open pull requests, do not merge: the lead session integrates.

| Id | Branch | Owns | Delivers |
| :---- | :---- | :---- | :---- |
| A | `s00-docs` | `CLAUDE.md`, `AGENTS.md`, `.env.example`, `engineering/runbooks/`, `engineering/decisions/`, `engineering/agent-brief-v2.md`, `engineering/task-cards-v2.md` | Session 0 documents |
| B | `t03-transit-collector` | `services/collector/` except `hrm_arcgis/`; `database/gold/`; `scripts/collector-*.ps1` | Transit collector and schedule loader, ported and running |
| C | `t21-sector-loaders` | `services/collector/hrm_arcgis/`; `database/generator/build_reference_and_tests_sql.py` and the regenerated `database/sql/08_reference_data.sql` (reference rows only) | Public Works and Housing data in silver |
| D | `t05-serving-api` | `services/api/`, `config/`, `engineering/contract/` | Contract v0 implemented and tested |
| E | `t06-web-app` | `apps/web/` | The web application |

### A. Session 0 documents

- Extend `CLAUDE.md` (keep it short): layout, where not to write, how to run the database, tests and the app, the decisions table from section 2.
- `AGENTS.md`: the handoff's section 5 rules, updated from `drive/08 Map Application/Repository files/AGENTS.md` (remove Azure, DuckDB and "cloud app settings").
- `.env.example`: placeholders only (`HALIFAX_TWIN_DB_URL`, `HALIFAX_TWIN_DATA_DIR`, `CESIUM_ION_TOKEN`).
- `engineering/runbooks/setup-windows.md`: how this machine was set up (section 3), how to start and stop the portable database, PostgreSQL memory settings for 32 GB with a one-line reason each, how to rebuild `halifax_twin`, how to set the Cesium token, and what the architect must do by hand.
- `engineering/decisions/`: one short dated note per decision in section 2 and in the handoff's table.
- `engineering/agent-brief-v2.md` and `engineering/task-cards-v2.md`: the 15 Nov brief and cards T01 to T30 with the overrides applied. Keep card numbers. Mark each changed card with what changed and why. Add cards for porting the demo loaders and for M01 (model tooling: diagrams, dictionary and checks generated from the spec).
- Done when: every file exists, no Azure, DuckDB or Google Maps key instruction survives uncorrected, and a text search finds no emoji.

### B. Transit collector

- Port from branch `origin/d08a-live-summary`: `demo/loaders/common.py`, `demo/loaders/transit_realtime/`, `demo/loaders/gtfs_schedule/`, `demo/sql/gold_planned_stop_time.sql`, their tests, READMEs (the mapping tables) and learning notes. Keep behaviour; fix the import hack on `api.settings` (own settings module reading `HALIFAX_TWIN_DB_URL` and `HALIFAX_TWIN_DATA_DIR`); store forward-slash relative paths in `file_path`.
- Retention: delete raw files older than `raw_retention_days` (7, in `config/business-rules.yaml`; default in code if the file is absent) once a day; never delete `bronze.feed_fetch` rows.
- Keep `trip.scheduled_trip_id` empty as the demo does (open question 7 on `ak1_trip`).
- Add tests that touch a scratch database for `store.py` and the schedule loader (the demo had none).
- Scripts: `scripts/collector-start.ps1`, `collector-stop.ps1`, and `collector-register-task.ps1` (Windows Task Scheduler at logon; write it, do not run it).
- Run: load the current GTFS schedule into `halifax_twin`, then start the realtime collector as a detached background process writing to `halifax_twin` and leave it running. Report the process id, row counts after ten minutes and the largest gap from `bronze.feed_gap`.
- Done when: tests pass, the schedule is loaded, positions and arrivals are accumulating, and a re-run of the schedule loader adds no history rows.

### C. Public Works and Housing loaders

- A small, generic ArcGIS REST loader (paged `query?where=1=1&outSR=4326&f=geojson`), one configuration per source, each source its own run so one failure does not stop the others.
- Confirm each source yourself now: address, fields, licence (rule 4). Read `docs/02 Sources/Source Inventory V1.csv`.
- Write `location` (geometry, source key) + `event` + the subtype (`road_closure`, `building_permit`) in one set-based transaction, idempotent on the source key (AK1), with one `bronze.feed_fetch` row per download and the raw file saved under the data root.
- Add the `silver.source` rows you need by extending the reference lists in the generator and regenerating script 08 (it is `ON CONFLICT DO NOTHING`); apply it to `halifax_twin`. No schema changes.
- Until the shared helper from B exists, keep your fetch logging self-contained and matching `bronze.feed_fetch`; the lead unifies at integration.
- README with a source-to-silver mapping table per source, and a list of every code value you had to choose where the model gives none (these become questions for the architect).
- Tests: parsing on recorded fixtures; one scratch-database test per source.
- Run: load both sources into `halifax_twin`. Report row counts and date ranges.
- Done when: both stories' data is in silver with geometry, re-running changes nothing, tests pass.

### D. Serving API

- FastAPI, `psycopg` 3 with a connection pool, bound to 127.0.0.1, port 8010.
- First: `engineering/contract/openapi.yaml` and `engineering/contract/examples/*.json` for every endpoint in section 6, committed early.
- `config/business-rules.yaml` (interim rules, labelled "not yet decided", plus `raw_retention_days: 7`), `config/sectors.json` (17 sectors in the plan's 5 groups, three pinned), `config/layers.json`, `config/stories/TRN-Q01.json`, `PWK-Q13.json`, `HRE-Q29.json`.
- Implement section 6 against silver and `gold.planned_stop_time`. Port the demo's working queries from `origin/d08a-live-summary:demo/api/` where they fit. Layers are generic over the conformed core: a layer is a type code plus a subsector, so a new sector is configuration.
- Mark a source stale after 2 minutes for live feeds; one failing source returns its own error and never breaks other layers. Do not return raw exception text.
- Tests: contract test (responses validate against the OpenAPI file), scratch-database tests with a few seeded rows, envelope on every endpoint, token withheld from non-local callers.
- Done when: tests pass and `uvicorn` serves every endpoint against `halifax_twin` (empty layers are valid while loaders are still running).

### E. Web application

- React + TypeScript + Vite, installable (manifest and service worker). MapLibre GL JS for 2D. CesiumJS with Google Photorealistic 3D Tiles through Cesium ion for 3D, loaded only when the API says 3D is available; otherwise the 3D switch is disabled with a short note.
- Build the six screens in `drive/08 Map Application/Wireframes/` (open the PNGs): laptop and phone city view, all sectors browser, story with a selected bus. Read the interface rules in `docs/08 Map Application/Halifax Digital Twin – Map Application Plan V1.md` and the handoff's section 3.
- Must have: sector rail (laptop) and chip row (phone); lens switch (Live, Replay, Analytics; Replay may be disabled with a note if the endpoint is not ready); story panel with question, answer sentence, evidence legend, context chart, trust footer (source, data age, reliability tier); bus status by shape and colour (disc on time, diamond late, ring early); bus popup and detail; list view equal to the map; all sectors browser with 17 sectors in 5 groups and pins (max 5); one search box; phone bottom sheet with three heights; stale and source-down states; story, lens and selection in the URL.
- One shared number formatter (units always shown, 24-hour clock, dates as 21 Nov 2026), all text in a language file (French-ready), IBM Plex Sans, WCAG 2.2 AA, 44 px touch targets, reduced motion respected, no emoji.
- 2D basemap: Protomaps PMTiles extract of the Halifax area stored in `C:\halifax-twin-data\tiles\` (free, not committed). If the extract cannot be made, use a plain vector fallback and say so; do not hot-link OpenStreetMap tiles for anything public.
- Reads only the serving API (`VITE_API_BASE`, default `http://127.0.0.1:8010`). Build against `engineering/contract/examples` from the API worktree until the API is up.
- Tests: unit tests for the formatter, status rules and story rendering; a Playwright script that opens the app at laptop and phone sizes and saves screenshots to `apps/web/screenshots/` (git-ignored).
- Done when: `npm run build` and the tests pass, and the app shows all three stories against the running API.

## 8. Every workstream

- Read first: `CLAUDE.md`, `PROJECT_CONTEXT.md`, the handoff note in `docs/08 Map Application/`, this plan.
- Tests and a "How I verified" section (commands and their output) in your final report.
- A learning note at `engineering/learning/<branch>.md`: what was built and why, how to run it, one hands-on exercise, and one line naming the enterprise tool or certification topic it maps to.
- Stop and report instead of guessing when a step needs money, a key, an unclear licence or a missing model name.
- Final report: what is done, evidence, what is blocked, numbered questions for the architect.

## 9. Integration and release (lead session)

1. Merge A to E into `release-1` locally; resolve overlaps (shared collector helper).
2. Start database, collector, API and web app; walk through the three stories at laptop and phone sizes; fix what fails.
3. Push the branches and open one pull request per workstream, each with "How I verified".
4. Hand the architect: how to start everything with one command, the screenshots, the open questions.

After release 1: M01 model tooling; Replay lens; the twin's own 3D model; remaining stories in waves; Power BI and Tableau panels; Gate 0 evidence (48 hours of archive with no gap over 2 minutes) once the collector has run long enough.

## 10. Needed from the architect

1. A rotated Cesium ion token, set as the user environment variable `CESIUM_ION_TOKEN` on this machine (not pasted into a chat). Without it the release is 2D only.
2. Approval of the two proposed contract additions (section 6).
3. Review and merge of the pull requests.

## 11. Scope changes during the build (21 and 22 Nov 2026)

Two scope changes reached the lead session on 21 Nov 2026 as messages from the session that wrote the lead prompt, which said the architect had approved them. The lead acted on them and records them here so the architect can confirm or reverse them at review.

1. **Thirteen stories instead of three.** The original three (TRN-Q01, PWK-Q13, HRE-Q29) come first. Added on data already being loaded: TRN-Q02, TRN-Q03, TRN-Q04, TRN-Q05, TRN-Q11 (bus feed and schedule, gold measures by B); PWK-Q16, TRN-Q25, TRN-Q09 (road closures); HRE-Q08, HRE-Q30 (building permits). The numbers and layers these stories need are added to section 6 with the envelope and endpoint shapes unchanged; spatial joins between closures and bus routes live in the API, not silver. A story without enough history or without a source field ships with a status ("collecting data", "source incomplete") and never a made-up answer.
2. **Project Tracker deliverables and design.** New workstream F, branch `m01-model-deliverables`, owns `engineering/model/` (source-to-target mapping, data dictionary, standards and data quality rules), `transform/dbt/` (read-only dbt checks) and new generator scripts. D adds unverified Docker files for the API (Docker is not installed). A adds a GitHub Pages project site in `site/` and a manual workflow, not enabled. E writes `apps/web/design/direction.md` and runs at least two rounds of independent design critique.
