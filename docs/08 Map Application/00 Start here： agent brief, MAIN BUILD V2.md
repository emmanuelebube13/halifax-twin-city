# Start here: agent brief, MAIN BUILD V2

21 Nov 2026\. V2 of "00 Start here: agent brief" (15 Nov 2026, Drive folder 08 Map Application). It applies the main build handoff note (21 Nov), its section 2 overrides, and the architect's decisions of 21 Nov evening (`engineering/decisions/`). The Drive original is left untouched. For release 1, `engineering/build-plan.md` is the working specification; this brief is the standing orientation that outlives it.

## What changed from V1

| Section | V1 said | V2 says | Why |
| :---- | :---- | :---- | :---- |
| Platform | Azure Functions, Blob Storage, Static Web Apps, US\$5 budget | Everything local on the build machine; nothing spent | No Azure, no paid cloud (16 Nov) |
| Data platform | DuckDB over Bronze until T15 reports | PostgreSQL 16 \+ PostGIS 3.7, local; Physical Model V1 built | Decided 20 Nov; version 16 kept 21 Nov |
| 3D key | Google Maps Platform key in GitHub secrets | The architect's Cesium ion token in `CESIUM_ION_TOKEN`; CesiumJS chosen | Decided 20 Nov |
| Secrets | GitHub secrets and cloud app settings | Environment variables or git-ignored local config | Public repository (20 Nov) |
| Raw data | Keep everything | Raw files for a rolling 7 days; parsed history and fetch rows kept | Decided 21 Nov |
| Engineering files | `docs/plan.md`, `docs/contract/`, `docs/learning/` | `engineering/...`; never write in `docs/` or `drive/` | The Drive sync deletes anything there |
| Logical model | Still being finished in erwin | Done as a spec (`database/generator/logical_model_spec.py`); erwin retired | Decided 21 Nov |
| Repository | Empty, to be scaffolded | Exists, with `database/`, the Drive mirror and a demo on four branches | Work since 15 Nov |
| Gate 2 check | DuckDB check | SQL check in PostgreSQL | DuckDB not needed |
| Working pattern | One lead, card by card | Opus builders, one workstream each, a lead integrates | Decided 21 Nov |

## What is being built

One web map of Halifax that answers one registered business question at a time, on phone and laptop, installable. Each answered question is a story: the question, a one-sentence answer with its number, the map layers that prove it, context, and trust (source, as-of time, reliability tier). Stories are configuration, not code.

The city is shown in realistic 3D: Google Photorealistic 3D Tiles through Cesium ion from above, and later the project's own open-data 3D model up close and as the fallback. A 2D map (MapLibre GL JS) always works, with or without a token.

The map reads only the serving API (contract v0). Behind it, data comes from the collectors through PostgreSQL (Bronze register, Silver, Gold), with no change to the map when a source moves from live to history.

Release 1 (`engineering/build-plan.md`): three sectors with real data (Transportation TRN-Q01, Public Works PWK-Q13, Housing & Real Estate HRE-Q29) on one map, laptop and phone layouts, Live and Analytics lenses, list view, 2D always and 3D with a token.

## Read in this order

1. `CLAUDE.md` and `PROJECT_CONTEXT.md` at the repository root.  
2. The handoff note: `docs/08 Map Application/00 Start here： Claude Code handoff, MAIN BUILD.md`.  
3. `engineering/build-plan.md` (release 1\) and `AGENTS.md` (rules, roles, definition of done).  
4. Map Application Plan V1 (`docs/08 Map Application/`): Summary, Architecture, The realistic 3D view, Interface rules, Agents and tasks. Read Azure, DuckDB and Google key passages as replaced by the decisions.  
5. The wireframes: `drive/08 Map Application/Wireframes/` (PDF and six PNGs).  
6. `engineering/task-cards-v2.md`.  
7. For data work: `database/README.md`, `database/docs/physical-model-v1.md`, `database/generator/logical_model_spec.py`.  
8. Background: Project Charter V1, the Business Questions register and the Domain Mapping (`docs/00` and `docs/01`, or Drive).

Do not invent entity or column names; take them from the spec, or ask.

## What the architect provides

| Needed | For | Card | State on 21 Nov |
| :---- | :---- | :---- | :---- |
| The GitHub repository | All work | T01 | Exists (public) |
| The build machine with PostgreSQL \+ PostGIS | All data work | T03 on | Ready: portable PostgreSQL 16 on port 5433, `halifax_twin` built (`engineering/runbooks/setup-windows.md`) |
| A rotated Cesium ion token restricted to localhost, set as `CESIUM_ION_TOKEN` | 3D view | T27, T29 | Not set yet; release 1 runs in 2D without it |
| A Blender model of a bus, or permission to use a placeholder | Pins | T30 | Bus renders exist from the demo; Blender not installed |
| The physical model | Silver and Gold | T16 | Done (`database/`) |
| Decisions on story definitions and business rules | Each story | T14, T18, T23, T24 | Interim rules in force, labelled "not yet decided" |

No Azure subscription, budget alert or Google Maps Platform key is needed. Keys are never pasted into a chat, a document or the repository.

## Interim defaults

Decisions that belong to the architect and are not yet made. Use these values, keep them in configuration and never in code, and label them "not yet decided".

| Decision | Interim default | Where it lives |
| :---- | :---- | :---- |
| On-time rule | On time from 60 s early to 300 s late | `config/business-rules.yaml` |
| Frequent service (TRN-Q07) | A bus every 15 min or better, weekdays 07:00 to 19:00 | `config/business-rules.yaml` |
| Five-minute walk (TRN-Q07) | 400 m in a straight line | `config/business-rules.yaml` |
| Raw file retention | 7 days (decided 21 Nov, so not interim; kept in config so it can change) | `config/business-rules.yaml`, `raw_retention_days` |
| Stop key shown on the map | Store both the HRM stop number and the GTFS `stop_id`; show the HRM stop number | Serving API |
| Clock format | 24-hour, Halifax time | Shared formatter |
| Sector groups | The five groups in the wireframes | `config/sectors.json` |
| Live data staleness | A live source is stale after 2 minutes | Serving API |

## Repository layout

```
apps/web/                 React + TypeScript + Vite; the installable map application
services/collector/       Python collectors, one package per source
services/api/             FastAPI serving API, contract v0
config/                   business-rules.yaml, sectors.json, layers.json, stories/*.json
database/                 physical model: generator, sql, docs; Gold SQL in database/gold/
assets/pins/              Blender sources, exported models, flat images, pins.json (T30)
engineering/              build plan, contract/, decisions/, runbooks/, learning/, sources/, this brief, task cards V2
scripts/                  PowerShell helpers
drive/, docs/             Drive mirror; never write here
AGENTS.md, CLAUDE.md      rules and orientation
```

Data, raw files, tiles and logs live outside the repository under `C:\halifax-twin-data` (`HALIFAX_TWIN_DATA_DIR`), because the repository sits inside OneDrive.

## Rules

The rules are in `AGENTS.md`. In short: one card, one branch, one pull request with tests and "How I verified"; the model's names exactly and no change to Silver without approval; no change to the contract or a business rule without approval; confirm every external fact at build time; open data only and attribution shown; never a secret in the repository or a chat; no emoji, sentence case, Canadian spelling, Halifax time, 24-hour clock; a learning note per card; one pipeline per source; never write in `drive/` or `docs/`; spend nothing; separate verifiers.

Stop and ask the architect when a source is not open or its licence is unclear, when a business rule or model name is missing, when the acceptance check cannot be met as written, when a step would cost money, or when you need a key or account you were not given.

## What to keep from the demo

The demo (branches `d01` to `d08a-live-summary`, 20 Nov) works but its interface is poor. Port, with tests: `demo/loaders/common.py`, `demo/loaders/transit_realtime/`, `demo/loaders/gtfs_schedule/`, `demo/sql/gold_planned_stop_time.sql`, the README mapping tables, the learning notes and the bus renders in `demo/web/img/`. Rebuild the web page from the wireframes. Whether to tag `d08a-live-summary` as `demo-2026-11-20` and close the demo pull requests, or merge them, is the architect's call.

## Order of work

1. Release 1 (`engineering/build-plan.md`): session 0 documents; transit collector and schedule loader (T03, T31), running unattended so the Gate 0 archive starts; Public Works and Housing loaders (T20, T21 for PWK-Q13 and HRE-Q29); serving API (T05, T08); web app (T06, T07, T09, T10, and the 3D part of T29 with Cesium ion).  
2. Gate 0 and Gate 1 evidence: 48 hours with no gap over 2 minutes; contract approved; TRN-Q01 verified (T11).  
3. After release 1: M01 model tooling; Replay lens (T19); the twin's own 3D model (T28); pins (T30); history stories (T13 to T18); remaining stories wave by wave; City view (T22); cross-sector stories (T24); Power BI and Tableau panels (T25).

## First prompt for a lead session

> You are the lead agent for the MAIN BUILD of the Halifax Digital Twin map application, not the demo. Read CLAUDE.md, PROJECT\_CONTEXT.md, the handoff note in docs/08 Map Application, engineering/build-plan.md, AGENTS.md and engineering/agent-brief-v2.md. Where they disagree with older documents, the decisions in engineering/decisions/ win. Pick the next card from engineering/task-cards-v2.md, or the next workstream from the build plan, and work on one branch named after it. Never write into drive/ or docs/. Never commit or repeat a token or password. Spend nothing. End with a session report: what is done, the evidence, what is blocked, and numbered questions for me.

## Gates

| Gate | Evidence the architect checks |
| :---- | :---- |
| 0 | 48 hours archived with no gap over 2 minutes (`bronze.feed_gap`); contract approved; the shell opens on a phone (on the home network or a phone-sized viewport) |
| 1 | The live answer matches the raw feed at three sampled moments, inside the 7-day raw window; definition of done met |
| 2 | One story served from Gold end to end; its numbers match an independent SQL check in PostgreSQL |
| 3 | Three sectors live in City view; a failed source greys out only its own layer |
| 4 | One cross-sector story and one embedded BI panel accepted |

