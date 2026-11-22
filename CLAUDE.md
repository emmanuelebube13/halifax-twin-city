# Halifax Digital Twin: start here

This repository is the Halifax Digital Twin, a living data model and 3D map of Halifax, Nova Scotia, built by Emmanuel Mbachu (the architect) as both a product and a way to learn enterprise data practice.

Before any work, read in this order:

1. `PROJECT_CONTEXT.md` in this folder: everything known about the project as of 21 Nov 2026 (history, decisions, design, current code, open questions, future).
2. `docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md` (Drive copy is the original): what the main build's first session must do, and the rules.
3. `engineering/build-plan.md`: release 1, the workstreams and who owns which paths.
4. `AGENTS.md`: the full rules, roles and definition of done.

Rules that apply to every session:

- Never write into `drive/` or `docs/`. `scripts/sync-drive.ps1` mirrors Google Drive there with `rclone sync` and deletes anything else.
- Never commit, print or repeat a key, token or password. The repository is public. The Cesium ion token comes from the environment variable `CESIUM_ION_TOKEN` or a git-ignored local config. Never open `%APPDATA%\postgresql\pgpass.conf`.
- Use the logical model's names exactly (`database/generator/logical_model_spec.py`). Do not change the `silver` schema without the architect's approval; propose instead.
- One task, one branch, one pull request with tests and a "How I verified" section. The architect reviews and merges.
- Spend nothing. Local or genuinely free tools only. Stop and ask before anything that costs money or needs an account or key you were not given.
- No emoji anywhere. Sentence case. Canadian spelling. Halifax time, 24-hour clock. Dates as 21 Nov 2026.
- End each task with a short learning note for the architect (`engineering/learning/<card>.md`), and each session with a report: what is done, the evidence, what is blocked, numbered questions.

## Layout

| Path | Holds |
| :---- | :---- |
| `apps/web/` | React + TypeScript + Vite map application |
| `services/collector/` | Python collectors, one package per source |
| `services/api/` | FastAPI serving API (contract v0, port 8010) |
| `config/` | `business-rules.yaml`, `sectors.json`, `layers.json`, `stories/` |
| `database/` | Physical model: generator, SQL, docs; Gold SQL in `database/gold/` |
| `engineering/` | Build plan, contract, decisions, runbooks, learning notes, V2 brief and task cards |
| `scripts/` | PowerShell helpers |
| `drive/`, `docs/` | Drive mirror. Read only. |

Data, tiles, logs and worktrees live outside the repository (it is inside OneDrive) under `C:\halifax-twin-data` (`HALIFAX_TWIN_DATA_DIR`).

## Running things

Machine setup and full commands: `engineering/runbooks/setup-windows.md`.

- **Database:** portable PostgreSQL 16.15 + PostGIS 3.7 on `localhost:5433`, database `halifax_twin`, URL in `HALIFAX_TWIN_DB_URL` (no password in it). Not a service: after a reboot run `C:\halifax-twin-data\pgsql\bin\pg_ctl.exe -D C:\halifax-twin-data\pgdata -l C:\halifax-twin-data\logs\postgres.log start`. Check with `pg_isready.exe -h localhost -p 5433`. SQL prompt: `psql.exe -h localhost -p 5433 -U postgres -w -d halifax_twin`.
- **Rebuild the database:** `00_create_database.sql`, `run_all.sql`, `99_smoke_test.sql` in `database/sql/` (runbook section 7; it deletes collected data).
- **Tests:** never against `halifax_twin`; each suite makes its own scratch database. Python services use 3.12: `py -3.12 -m venv .venv`, then `.venv\Scripts\python.exe -m pytest` in the service folder. Web app: `npm test` and `npm run build` in `apps/web/`.
- **App:** API with `uvicorn` on 127.0.0.1:8010 from `services/api/`; web app with `npm run dev` in `apps/web/` (`VITE_API_BASE`, default `http://127.0.0.1:8010`). Each part's README has the exact commands.

## Decisions in force

Full notes in `engineering/decisions/`. Where they disagree with older documents, they win.

| Topic | Decision |
| :---- | :---- |
| Cloud | No Azure, no paid cloud; local or free only (16 Nov) |
| Platform | PostgreSQL + PostGIS, local; DuckDB not needed (20 Nov). Version 16 stays (21 Nov) |
| Silver history | SCD Type 2 (20 Nov) |
| Bronze | Raw files on local disk plus `bronze.feed_fetch`; raw files kept 7 days, parsed history and fetch rows kept (21 Nov) |
| 3D | CesiumJS + Google Photorealistic 3D Tiles through Cesium ion; 2D always works (20 Nov) |
| Secrets | Environment variables or git-ignored config; token sent to the page only on localhost (20 Nov) |
| Hosting | Collector and web app run locally; free static host later, not chosen (16 Nov) |
| erwin | Retired; the model lives in the spec; diagrams and dictionary generated later (card M01) (21 Nov) |
| Pace and builders | Session 0 and the first cards run together; Opus builders, one workstream each, a lead integrates; the architect merges (21 Nov) |
