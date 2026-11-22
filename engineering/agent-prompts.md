# Builder prompts: release 1

21 Nov 2026. One prompt per workstream in `engineering/build-plan.md`. Each builder runs in its own folder (a git worktree on its own branch), so they can run at the same time without touching each other's files.

## How to start a builder

Open a terminal for each one, go to its folder, start Claude Code on Opus, and paste the prompt.

```powershell
cd C:\halifax-twin-data\worktrees\<folder>
claude --model opus
```

| Workstream | Folder | Branch | Can start |
| :---- | :---- | :---- | :---- |
| A. Session 0 documents | `docs` | `s00-docs` | Any time |
| B. Transit collector | `collector` | `t03-transit-collector` | Any time (start early: it begins the feed archive) |
| C. Public Works and Housing loaders | `sector` | `t21-sector-loaders` | Any time |
| D. Serving API | `api` | `t05-serving-api` | Any time, but before or with E |
| E. Web application | `web` | `t06-web-app` | With D, or a few minutes after it |

Before starting any of them, make sure the database is running:

```powershell
C:\halifax-twin-data\pgsql\bin\pg_isready.exe -h localhost -p 5433
# if it is not accepting connections:
C:\halifax-twin-data\pgsql\bin\pg_ctl.exe -D C:\halifax-twin-data\pgdata -l C:\halifax-twin-data\logs\postgres.log start
```

Builders commit to their own branch and do not push. When they finish, the lead session (or you) merges the five branches into `release-1`, runs everything together, then opens the pull requests.

---

## A. Session 0 documents

```text
You are a builder on the Halifax Digital Twin (a city data model and web map for Halifax, Nova Scotia). You own workstream A, "Session 0 documents".

Your git worktree (already created, branch s00-docs): C:\halifax-twin-data\worktrees\docs . Work only there.

Read first, in this order, inside your worktree: CLAUDE.md, PROJECT_CONTEXT.md, "docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md", then engineering/build-plan.md. The build plan is your specification: do everything under "A. Session 0 documents" and "8. Every workstream", and respect the ownership table in section 7 (only edit the paths workstream A owns, plus engineering/learning/s00-docs.md). Source material for the V2 brief and cards: "docs/08 Map Application/00 Start here： agent brief.md", "docs/08 Map Application/Agent task cards T01 to T30.md", "drive/08 Map Application/Repository files/AGENTS.md".

Hard rules: never write into drive/ or docs/; never print, copy or commit any key, token or password (do not open %APPDATA%\postgresql\pgpass.conf); no emoji, sentence case, Canadian spelling, 24-hour clock, dates as 21 Nov 2026; spend nothing. Commit to your branch with clear messages. Do NOT push, open pull requests, merge, or touch other worktrees or branches. Do not install system software.

Facts for the runbook you would not otherwise know: the portable PostgreSQL was made by extracting the EDB "postgresql-16.15-1-windows-x64-binaries.zip" to C:\halifax-twin-data\pgsql, copying the OSGeo "postgis-bundle-pg16-3.7.0x64.zip" contents over it, then restoring the EDB copy of bin\libcurl.dll (the bundle's copy needs libbrotlidec.dll and libnghttp2-14.dll, which are absent, and PostGIS then fails to load with "The specified module could not be found"). initdb -U postgres -E UTF8 --locale=C with scram-sha-256 auth; settings appended to postgresql.conf: port 5433, listen_addresses localhost, timezone UTC, log_timezone America/Halifax, shared_buffers 4GB, effective_cache_size 16GB, work_mem 64MB, maintenance_work_mem 1GB, max_wal_size 4GB. Start: C:\halifax-twin-data\pgsql\bin\pg_ctl.exe -D C:\halifax-twin-data\pgdata -l C:\halifax-twin-data\logs\postgres.log start (it is not a Windows service, so it must be started after a reboot; installing it as a service needs administrator rights). The machine: Windows 11, Ryzen 7 7700, 32 GB RAM, NVIDIA RTX 5070; a PostgreSQL 16 service is also present on port 5432 (not used, no PostGIS). Blender is not installed.

Finish with a final report: what is done (files and commit hashes), "How I verified" (commands and output), what is blocked, and numbered questions for the architect, each answerable in one line.
```

---

## B. Transit collector

```text
You are a builder on the Halifax Digital Twin (a city data model and web map for Halifax, Nova Scotia, PostgreSQL + PostGIS). You own workstream B, "Transit collector".

Your git worktree (already created, branch t03-transit-collector): C:\halifax-twin-data\worktrees\collector . Work only there. The demo code to port is on branch origin/d08a-live-summary (use "git show origin/d08a-live-summary:demo/..." to read it; do not leave a demo/ folder in your branch).

Read first, inside your worktree: CLAUDE.md, PROJECT_CONTEXT.md (sections 6, 7, 9, 12, 13 matter most), "docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md", then engineering/build-plan.md. The build plan is your specification: do everything under "B. Transit collector" and "8. Every workstream", use the machine facts in section 3, and respect the ownership table in section 7. Also read database/README.md and database/generator/logical_model_spec.py for names.

Hard rules: use the logical model's names exactly and never change the silver schema; never write into drive/ or docs/; never print, copy or commit any key, token or password (the database password lives only in pgpass.conf, which psql and psycopg read on their own: do not open that file); no emoji, sentence case, Canadian spelling; spend nothing; confirm the feed addresses yourself. Use Python 3.12 (py -3.12 -m venv .venv). Tests run against your own scratch database (for example halifax_twin_test_collector, created with database/sql/run_all.sql), never against halifax_twin. Raw files go under C:\halifax-twin-data\bronze, logs under C:\halifax-twin-data\logs. Another workstream (C) is adding services/collector/hrm_arcgis/; do not create that folder. The file config/business-rules.yaml is owned by workstream D: read it if present, with a default in code.

When you start the realtime collector against halifax_twin, start it detached (for example PowerShell Start-Process -WindowStyle Hidden with output redirected to a log file) so it keeps running after you finish, and make sure only one copy runs. Commit to your branch with clear messages. Do NOT push, open pull requests, merge, register scheduled tasks, or touch other worktrees.

Finish with a final report: what is done (files and commit hashes), "How I verified" (commands and output, including test results, row counts and the largest feed gap), the collector's process id and how to stop it, what is blocked, and numbered questions for the architect, each answerable in one line.
```

---

## C. Public Works and Housing loaders

```text
You are a builder on the Halifax Digital Twin (a city data model and web map for Halifax, Nova Scotia, PostgreSQL + PostGIS). You own workstream C, "Public Works and Housing loaders".

Your git worktree (already created, branch t21-sector-loaders): C:\halifax-twin-data\worktrees\sector . Work only there.

Read first, inside your worktree: CLAUDE.md, PROJECT_CONTEXT.md (sections 5, 6, 7, 12, 13 matter most), "docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md", then engineering/build-plan.md. The build plan is your specification: do everything under "C. Public Works and Housing loaders" and "8. Every workstream", use the machine facts in section 3 and the story table in section 5, and respect the ownership table in section 7. Read "docs/02 Sources/Source Inventory V1.csv", database/README.md, database/generator/logical_model_spec.py (entities Location, Event, Road Closure, Building Permit, Event Coverage, Source) and database/sql/02_silver_tables.sql for exact column names. For a worked pattern of writing location + event + subtype rows idempotently, see the demo loaders: "git show origin/d08a-live-summary:demo/loaders/transit_realtime/store.py", ".../gtfs_schedule/loader.py" and ".../common.py".

Hard rules: use the logical model's names exactly and never change the silver schema (reference rows in silver.source through the generator are allowed, as the plan says); where the model gives no code value, choose a sensible one and list it as a question; never invent data; never write into drive/ or docs/; never print, copy or commit any key, token or password (the database password lives only in pgpass.conf, which psql and psycopg read on their own: do not open that file); open data only, no personal data (drop any owner or applicant name fields); confirm each source's address, fields and licence yourself now and be polite to the servers (paged requests, a descriptive User-Agent without personal details, no hammering); no emoji, sentence case, Canadian spelling; spend nothing. Use Python 3.12 (py -3.12 -m venv .venv). Tests run against your own scratch database (for example halifax_twin_test_sector), never against halifax_twin. Raw files go under C:\halifax-twin-data\bronze. Workstream B owns the rest of services/collector/; create only services/collector/hrm_arcgis/ there (with its own requirements file and tests inside it).

If a story's source cannot be confirmed open and reachable, follow the fallback rule in section 5 of the plan and say exactly what you chose and why. Commit to your branch with clear messages. Do NOT push, open pull requests, merge, or touch other worktrees.

Finish with a final report: what is done (files and commit hashes), the confirmed source addresses and licences, the event_type_code and other code values you wrote (the API workstream needs these), row counts and date ranges loaded into halifax_twin, "How I verified" (commands and output), what is blocked, and numbered questions for the architect, each answerable in one line.
```

---

## D. Serving API

```text
You are a builder on the Halifax Digital Twin (a city data model and web map for Halifax, Nova Scotia, PostgreSQL + PostGIS). You own workstream D, "Serving API".

Your git worktree (already created, branch t05-serving-api): C:\halifax-twin-data\worktrees\api . Work only there.

Read first, inside your worktree: CLAUDE.md, PROJECT_CONTEXT.md (sections 7, 8, 9, 12 matter most), "docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md", then engineering/build-plan.md. The build plan is your specification: do everything under "D. Serving API" and "8. Every workstream", implement the contract in section 6, use the machine facts in section 3 and the stories in section 5, and respect the ownership table in section 7. Read database/README.md, database/generator/logical_model_spec.py and database/sql/02_silver_tables.sql for exact names, and the contract and sector groups in "docs/08 Map Application/Halifax Digital Twin – Map Application Plan V1.md" (it embeds base64 images: skip those). The demo's working queries are at "git show origin/d08a-live-summary:demo/api/main.py" and ".../demo/api/layers.py", and the gold function at ".../demo/sql/gold_planned_stop_time.sql".

FIRST deliverable, within your first few steps: write and commit engineering/contract/openapi.yaml and engineering/contract/examples/*.json (one realistic example response per endpoint, including /v1/sectors, /v1/replay/vehicles and /v1/client-config), because the web workstream builds against those files and reads them from your worktree. Do not change their shape afterwards without a strong reason; if you must, say so in your report.

Coordination: two loader workstreams fill halifax_twin while you work, so tables may be empty at first: empty layers and null numbers must be valid responses. Transit data follows the demo loaders (event_type_code "Trip", "Stop Arrival"; vehicle_position; assets "Route", "Stop", "Vehicle"). The sector loader worktree is C:\halifax-twin-data\worktrees\sector (read-only for you): its README under services/collector/hrm_arcgis/ will state the type codes and columns it wrote for road closures and building permits; expect event_type_code "Road Closure" and "Building Permit" with geometry on the event's location. The gold function gold.planned_stop_time(day) is installed by the collector workstream from database/gold/; tolerate its absence.

Hard rules: read-only API; use the logical model's names exactly and never change the silver schema; never write into drive/ or docs/; never print, copy or commit any key, token or password (the database password lives only in pgpass.conf, which psycopg reads on its own: do not open that file; the Cesium token is read from the environment variable CESIUM_ION_TOKEN and may not be set); never return raw exception text to clients; no emoji, sentence case, Canadian spelling; spend nothing. Use Python 3.12 (py -3.12 -m venv .venv). Tests run against your own scratch database (for example halifax_twin_test_api, created with database/sql/run_all.sql and a few seeded rows), never against halifax_twin. Allow browser calls from the local web dev server (CORS for http://127.0.0.1:5173 and http://localhost:5173). Port 8010 on 127.0.0.1. You may start the API to verify it, but stop it before you finish. Commit to your branch with clear messages. Do NOT push, open pull requests, merge, or touch other worktrees.

Finish with a final report: what is done (files and commit hashes), the exact command to start the API, "How I verified" (commands and output), any deviation from section 6 of the plan, what is blocked, and numbered questions for the architect, each answerable in one line.
```

---

## E. Web application

```text
You are a builder on the Halifax Digital Twin (a city data model and web map for Halifax, Nova Scotia). You own workstream E, "Web application".

Your git worktree (already created, branch t06-web-app): C:\halifax-twin-data\worktrees\web . Work only there, and only under apps/web/ (plus engineering/learning/t06-web-app.md).

Read first, inside your worktree: CLAUDE.md, PROJECT_CONTEXT.md (sections 2, 8, 9 matter most), "docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md" (section 3 has the interface rules and what was wrong with the demo), then engineering/build-plan.md. The build plan is your specification: do everything under "E. Web application" and "8. Every workstream", code against the contract in section 6, and respect the ownership table in section 7. Open and study the six wireframe images in "drive/08 Map Application/Wireframes/" (01 to 06 PNG) and the layout sketch in "drive/08 Map Application/Repository files/layout-sketch.png": the app must follow them. Read the interface rules, pins, words, numbers and type sections of "docs/08 Map Application/Halifax Digital Twin – Map Application Plan V1.md" (it embeds base64 images: skip those). The architect's bus renders for pins are on the demo branch: "git show origin/d08a-live-summary:demo/web/img/bus-side.png" (also bus-front.png); copy them into apps/web as assets. The demo page (git show origin/d08a-live-summary:demo/web/js/map.js) has one idea worth keeping: buses glide between GPS reports on a clock about 60 seconds behind real time.

The contract: the API workstream writes engineering/contract/openapi.yaml and engineering/contract/examples/*.json in ITS worktree, C:\halifax-twin-data\worktrees\api (read-only for you). Build against those files (copy the examples into apps/web as mock fixtures so the app runs with no API, switched by an environment variable), and against the live API at http://127.0.0.1:8010 once it is up. If the files are not there yet, start with the layout, design tokens, formatter and language file, and check again every few minutes; section 6 of the plan gives the shapes.

Known weaknesses of the demo to avoid: status shown by colour only; pins piling up downtown with no clustering; search and list view hidden on phones; no stops or alerts; panels that never refresh; placeholder sectors that only show a notice.

Hard rules: the app reads only the serving API; never write into drive/ or docs/; never print, copy or commit any key, token or password (the Cesium token arrives only from the API's client-config when 3D is available: never hard-code one, and the app must work fully in 2D without it); show the licence attribution wherever data appears and Google and Cesium credits on the 3D view; free and open-source packages only, spend nothing, no hot-linked OpenStreetMap tiles; no emoji, sentence case, Canadian spelling, labels of at most three words, 24-hour clock, dates as 21 Nov 2026. Node 24 and npm 11 are installed. You may run the dev server (port 5173) and Playwright to verify and to capture screenshots at laptop (1440 by 900) and phone (390 by 844) sizes, but stop any server before you finish. Commit to your branch with clear messages. Do NOT push, open pull requests, merge, or touch other worktrees.

Finish with a final report: what is done (files and commit hashes), the exact commands to install, run, test and build, where the screenshots are, "How I verified" (commands and output), what is blocked or left as a placeholder, and numbered questions for the architect, each answerable in one line.
```
