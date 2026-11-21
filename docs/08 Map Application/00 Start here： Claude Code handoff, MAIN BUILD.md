# 00 Start here: Claude Code handoff, MAIN BUILD

21 Nov 2026 · Architect: Emmanuel Mbachu · Written by Claude (chat) for Claude Code

You are picking up the Halifax Digital Twin and building the real application. The design phase is done, a demo ran at a Claude event on 20 Nov 2026, and the architect now wants the actual product built properly. This note tells you where everything is, what has changed since the older documents were written, what to keep from the demo, and what your first session must do. **Your first session sets things up and makes no feature code.**

The project is also how the architect learns enterprise data tools and practice (data modelling, warehousing, GIS, BI, cloud-free engineering) and works toward certifications. Explaining what you did and why matters as much as the code.

---

## 1\. Where everything is

### GitHub

Repository: `emmanuelebube13/halifax-twin-city` (public).

| Branch | State | What it holds |
| :---- | :---- | :---- |
| `main` | Up to date | Drive mirror (`drive/`, `docs/`), `database/` (physical model V1), `scripts/sync-drive.ps1`, README |
| `physical-model-v1` | Merged as PR \#1 (merge commit 45c3ae0) | Can be deleted after you confirm |
| `d01-demo-skeleton` | **Not merged** | `demo/` skeleton, config example, `demo/start.ps1` (port 8010\) |
| `d02-transit-realtime` | **Not merged**, stacked on d01 | Live collector: vehicle positions, trip updates, alerts into silver; tests; mapping table |
| `d03-gtfs-schedule-loader` | **Not merged**, stacked on d02 | GTFS schedule loader (SRC-004), `gold.planned_stop_time(day)` |
| `d08a-live-summary` | **Not merged**, stacked on d03 | The demo as presented: FastAPI, plain JS \+ CesiumJS page, live bus pins, replay, analytics, list view |

`d08a-live-summary` contains everything from d01 to d03. It is the demo exactly as it ran.

### Google Drive

Root folder "Halifax Twin City" (id `1fmeAYY5hzK1uW83A-AeMFY_91DWzE1Jb`). Drive is the source of truth for design documents; the repo copies in `drive/` and `docs/` were last synced on 16 Nov and are missing everything after that.

| Folder | Contents |
| :---- | :---- |
| 00 Project Management | Project Charter V1, Project Tracker |
| 01 Requirements and Domains | Business Questions register (100 questions), Domain Mapping, Domain Map |
| 02 Sources | Source Inventory V1 (77 sources, checked 12 Nov 2026\) |
| 03 Conceptual Model | draw.io \+ PNG |
| 04 Data Flow Model | Halifax\_Twin\_DFD\_v3.drawio |
| 05 Logical Model (id `1YNQ-lpGQPLmS4ifolNHEoyKqAM56RLld`) | Logical Model V1; `erwin/` subfolder |
| 06 Physical Model (id `19OxER5Uc6Vxu9LJVjF85T8U8BwhLyo_h`) | Physical Model V1, Modeling Style by Layer, Learning Notes |
| 07 Mapping, Dictionary and Standards (id `14oRyQvJrIkxVfiySJJ8pl9RDETYu4ZT9`) | Empty: steps 10 to 12 still to do |
| 08 Map Application (id `19Ip8jbreU-RfPg5cs6jcjYc6vptOe_AQ`) | Map Application Plan V1, "00 Start here: agent brief" (main), "00 Start here: agent brief, DEMO build", task cards T01 to T30, `Wireframes/` (PDF \+ 6 PNG screens), `Repository files/` |

Key documents by link:

- Map Application Plan V1: [https\://docs.google.com/document/d/13UBh3vM42Ky0p54qcP3HjdFZTR8PMiADtb1MkmFlOwM/edit](https://docs.google.com/document/d/13UBh3vM42Ky0p54qcP3HjdFZTR8PMiADtb1MkmFlOwM/edit)  
- Main agent brief (outdated, see section 2): [https\://docs.google.com/document/d/18FLIm3dkRF3D9yK-21ZgVlhMSWhpjW8tbDHJ5xTYkyA/edit](https://docs.google.com/document/d/18FLIm3dkRF3D9yK-21ZgVlhMSWhpjW8tbDHJ5xTYkyA/edit)  
- Demo agent brief: [https\://docs.google.com/document/d/1LspsgF49mtfqS5PI0BNIyeRW1k4YcTFkI-s5tab8qg4/edit](https://docs.google.com/document/d/1LspsgF49mtfqS5PI0BNIyeRW1k4YcTFkI-s5tab8qg4/edit)  
- Task cards T01 to T30 (outdated in places): [https\://docs.google.com/document/d/1iXvwfDGsk8FTVPvbUZFQkD8iWC9l6eNLWVx2SO4HT80/edit](https://docs.google.com/document/d/1iXvwfDGsk8FTVPvbUZFQkD8iWC9l6eNLWVx2SO4HT80/edit)  
- Project Charter V1: [https\://docs.google.com/document/d/1XowLb9O2JuxJ3-cO5yi6S0cFWsZV9jtJNfaTWLcJ6Bc/edit](https://docs.google.com/document/d/1XowLb9O2JuxJ3-cO5yi6S0cFWsZV9jtJNfaTWLcJ6Bc/edit)  
- Business Questions register: [https\://docs.google.com/spreadsheets/d/1Zl0xTYPy1RzQD5fEkgHTlOl7AjKQeiY0YGt6puWCB1I/edit](https://docs.google.com/spreadsheets/d/1Zl0xTYPy1RzQD5fEkgHTlOl7AjKQeiY0YGt6puWCB1I/edit)  
- Domain Mapping: [https\://docs.google.com/spreadsheets/d/1u9ompZL5ZxIAROX2DkJC5EC1LA5vEcYDzFTdkt0Tii0/edit](https://docs.google.com/spreadsheets/d/1u9ompZL5ZxIAROX2DkJC5EC1LA5vEcYDzFTdkt0Tii0/edit)

### Machines

- **Build machine (main build, from 21 Nov 2026):** a proper workstation with an NVIDIA GPU (12 GB VRAM), 32 GB RAM and 2 TB storage. This is where the main build is developed and run: PostgreSQL \+ PostGIS, the collector, the API, the Vite dev server, CesiumJS at full quality, and Blender for the pin models (T30). The operating system is assumed to be Windows (the repo's scripts are PowerShell); confirm it in session 0\.  
- **Demo PC:** small Windows PC, 8 GB RAM, integrated graphics, PostgreSQL 18 \+ PostGIS \+ pgAdmin. Database `halifax_twin` was built there for the demo (smoke test passed 20 Nov), and the demo collector ran there. It is no longer the build target.  
- **The database does not exist on the build machine yet.** Rebuild it from `database/sql/` (`00_create_database.sql`, then `run_all.sql`, then `99_smoke_test.sql`), using the same PostgreSQL major version on both machines if the demo data is to be moved (proposal: PostgreSQL 18 \+ PostGIS 3). Whether to carry over the demo PC's collected data (`pg_dump` of `silver` and `bronze`) is a question for the architect.  
- **Develop on the workstation, design for ordinary devices.** The workstation hides performance problems. The finished app must still run well on a mid-range laptop and a phone, and the 2D fallback must work with no 3D tiles. Test with GPU throttling and a phone-sized viewport, and keep the small-device 3D settings (render on change, raised screen-space error on weak GPUs, capped pixel ratio) as a device-dependent profile rather than removing them.  
- **Where you run matters.** If you run in the cloud (Claude Code on the web), you cannot reach the build machine's database. Build and test against a throwaway PostgreSQL \+ PostGIS in your own sandbox (`database/sql/run_all.sql` builds it; it was verified on PostgreSQL 16 \+ PostGIS 3). Anything that must touch the real database, the live collector or Windows Task Scheduler is done from a Claude Code session on the build machine itself, or written as a script and runbook for the architect to run.

---

## 2\. Decisions that override the older documents

The main agent brief, the plan and the task cards were written on 15 Nov, before these decisions. **Where they disagree, this table wins.**

| Topic | Older documents say | Decided since | Date |
| :---- | :---- | :---- | :---- |
| Cloud | Azure Functions, Blob Storage, Static Web Apps, US\$5 budget | **No Azure, no paid cloud.** Local or genuinely free services only. Spend nothing without asking. | 16 Nov |
| Data platform | DuckDB over Bronze, then a platform test (T13, T15) | **PostgreSQL \+ PostGIS, local.** Physical model V1 built and tested. DuckDB is not needed. | 20 Nov |
| Silver history | Open | **SCD Type 2** (22 tables, trigger `silver.fn_scd2_capture`, `_hist` tables, `_timeline` views) | 20 Nov |
| Bronze | Blob Storage | Raw files on local disk, `data/bronze/<source>/<date>/`, one row per download in `bronze.feed_fetch`; backup copy to Drive is a proposal, not yet decided | 16 Nov |
| Realistic 3D | Google Maps Platform key in GitHub secrets | **CesiumJS \+ Google Photorealistic 3D Tiles through Cesium ion**, using the architect's own ion token. Realistic 3D is core, not optional. | 15 and 20 Nov |
| Secrets | GitHub secrets and cloud app settings | Token read from env var `CESIUM_ION_TOKEN` or a git-ignored local config. API passes it to the page only on localhost. Commit example config only. | 20 Nov |
| Collector hosting | Azure | Local Python process on the PC, started by Windows Task Scheduler | 16 Nov (proposal) |
| Hosting the web app | Azure Static Web Apps | Local first; a free static host later (not yet chosen) | 16 Nov |

Cards most likely affected (confirm by reading them): T01 (repo layout), T04 (deploy the collector), T06 (hosting), T13 (DuckDB over Bronze), T15 (platform test), T16 and T17 (Bronze to Gold, serving files), T25 (Power BI: check what is free), T27 and T29 (3D engine and key). Do not edit the Drive originals; write V2 copies (section 4).

### Unchanged and still in force

- One web map (laptop and phone, installable PWA) answering one registered business question at a time. Each answer is a **story**: question, answer sentence with its number, evidence layers, context, trust (source, as-of, reliability tier). Stories are configuration, not code.  
- Three lenses: Live, Replay, Analytics. City view shows all sectors. The map draws the conformed core (Location, Asset, Event \+ sector\_id), so new sectors add layers without rewrites.  
- The map reads only the serving API (contract v0, read-only, common envelope: `data, as_of, source, reliability_tier, licence`). It never queries the warehouse directly.  
- Hot path: collector to live cache to API. Cold path: collector to Bronze to Silver to Gold to API.  
- Planned stack: React \+ TypeScript \+ Vite; MapLibre GL JS \+ deck.gl for 2D; CesiumJS for 3D; Protomaps PMTiles basemap; Python collector and FastAPI. Confirm or propose changes in session 0\. The build machine has room for all of it; the limit is the user's device, not the workstation.  
- Phase 1 domains: Transportation, Public Works, Housing & Real Estate, plus the shared core. 17 sectors exist in total.  
- Stages and gates 0 to 4 from the main brief, with "DuckDB check" in Gate 2 read as "SQL check in PostgreSQL".

---

## 3\. What to keep from the demo, and what to replace

The architect's verdict: **the demo works, the interface is poor.** Treat the demo as a working prototype to harvest, not a base to extend.

**Keep (port into the main build, with their tests):**

- `demo/loaders/transit_realtime/` (collector, parse, store) and `demo/loaders/gtfs_schedule/`. They write the real silver tables and have mapping tables in their READMEs, which feed step 10\.  
- `demo/loaders/common.py` (fetch logging into `bronze.feed_fetch`, raw file keeping).  
- `demo/sql/gold_planned_stop_time.sql`.  
- Windows lessons already learned: config files saved with a byte order mark by PowerShell 5.1; the venv launcher starting two collector processes; port 8000 is taken by the older live-buses app, so the demo uses 8010\.  
- The learning notes in `demo/learning/`.  
- The architect's bus renders in `demo/web/img/` (front, rear, side) for the pin pipeline (T30).

**Replace:**

- The whole web page (`demo/web/`, plain JS). Rebuild from the six wireframes and the interface rules in the plan.  
- Demo-only API shortcuts that query silver directly from the page's needs; the main build goes through contract v0.

**Before you design the new interface,** compare the demo against the wireframes and write a short gap list (layout, hierarchy, sector navigation, story panel, legend, list view, phone layout, performance on a mid-range laptop and a phone). Ask the architect what specifically felt wrong in the demo; their answer goes into the design brief.

**Interface rules (from the plan):** pinned sectors only (max 5\) in the left rail or phone chip row; all 17 sectors in a grouped, searchable "All sectors" browser; one search box for places, questions and sectors; status shown by shape as well as colour (disc on time, diamond late, ring early); no emoji anywhere; sentence case; labels at most 3 words; Canadian spelling; text in a language file (French-ready); one shared number formatter, units always shown, 24-hour clock, dates as 15 Nov 2026; WCAG 2.2 AA, 44 px touch targets, a list view equal to the map, reduced motion respected.

---

## 4\. Session 0: initialize (no feature code)

Do these in order, on one branch named `s00-initialize`, and open one pull request.

1. **Check your access.** Confirm you can push to the repo and open pull requests, and that you can read the Drive folders above. List anything you cannot reach and stop there if GitHub or Drive is missing.  
2. **Read**, in this order: this note; the Map Application Plan V1; the wireframes (PDF and six PNGs in 08 Map Application/Wireframes); the main agent brief; task cards T01 to T30; the demo brief; `database/README.md`; `database/docs/physical-model-v1.md`; `database/generator/logical_model_spec.py`; then the four demo branches (`git log` and the READMEs and learning notes in `demo/`).  
3. **Preserve the demo.** Propose (do not do without a yes) tagging `d08a-live-summary` as `demo-2026-11-20` and closing the four demo branches without merging, since the code you keep will be ported with tests in its own pull requests. If the architect would rather merge the demo into main as `demo/`, do that instead.  
4. **Resolve the folder conflict.** `scripts/sync-drive.ps1` runs `rclone sync` into `drive/` and `docs/`, which **deletes anything there that is not on Drive**. The main brief puts `docs/plan.md`, `docs/contract/`, `docs/learning/` in that folder. Propose a different home for engineering documents (for example `engineering/` with `plan.md`, `contract/openapi.yaml`, `decisions/`, `runbooks/`, `learning/`). Never write into `drive/` or `docs/`.  
5. **Propose the repository layout** for the main build, starting from the main brief's layout with the changes above, for example: `apps/web/`, `services/collector/` (one package per source), `services/api/`, `database/` (exists), `config/` (`business-rules.yaml`, `sectors.json`, `stories/`), `assets/pins/`, `engineering/`, `scripts/`.  
6. **Write the project memory files** at the repo root:  
   - `CLAUDE.md`: short orientation for every future Claude Code session (what the project is, where things are, the decisions table, the rules, how to run tests, where not to write).  
   - `AGENTS.md`: the rules in section 5, updated from the Drive copy.  
   - `.gitignore` additions for local config, `.env`, `data/`, virtual environments, `node_modules/`.  
   - `.env.example` with placeholders only (database URL, `CESIUM_ION_TOKEN`).  
7. **Draft V2 of the brief and task cards** as Markdown in `engineering/`: "agent brief, MAIN BUILD V2" and "task cards V2", applying section 2\. Mark each changed card with what changed and why. Keep card numbers stable where you can; add new cards for porting the demo loaders. Also write both as Google Docs into Drive folder 08 Map Application, named with "V2" so the originals stay untouched.  
8. **Set up the build machine** and write `engineering/runbooks/setup-windows.md` (or the matching runbook for its operating system): Python 3.12+, Node LTS, git, GitHub CLI, PostgreSQL 18 \+ PostGIS 3, rclone (for `scripts/sync-drive.ps1`), current NVIDIA driver, Blender. Include PostgreSQL memory settings suited to 32 GB RAM (for example `shared_buffers`, `work_mem`, `effective_cache_size`), with a one-line reason for each. If you are running on the build machine, install what is missing (free software only), build `halifax_twin` from `database/sql/`, run the smoke test and put its output in the pull request. If you are in the cloud, write the runbook for the architect to follow instead.  
9. **Open the pull request** with a "How I verified" section, then write the session report (section 6\) and **stop**. Wait for the architect's review before any feature work.

After session 0 is merged, the expected order (to confirm in V2) is: port the transit collector and get it running unattended on the build machine (or the demo PC, if that is the one left on day and night) (history not archived cannot be rebuilt, so Gate 0's 48 hours with no gap over 2 minutes starts as early as possible); contract v0; map shell and design tokens from the wireframes; 3D view with Cesium; then stories in the waves from the plan.

---

## 5\. Rules

1. One task card, one branch, one pull request, named after the card (for example `t03-transit-collector`). The architect reviews and merges. Do not merge your own pull requests unless the architect asks you to in that session.  
2. Use the logical model's names exactly (`database/generator/logical_model_spec.py`). Never invent entity or column names; ask. Never change silver; propose the change. New tables go in `gold` and are explained in the pull request.  
3. Do not change the contract, a business rule or a model name without the architect's approval.  
4. Confirm every external address, field, limit, price and licence yourself at build time. The design documents' facts date from 12 to 20 Nov 2026\.  
5. Open data only, no personal data. Show licence attribution wherever data appears ("Contains information licensed under the Open Government Licence – Halifax", plus each source's own). Show Google and Cesium attribution on the 3D view.  
6. **Never commit a key, token or password.** Never write one into a document, an issue or a chat. Commit only example config files.  
7. No emoji anywhere: interface, documents, commit messages, code comments. Sentence case. Canadian spelling. Halifax time, 24-hour clock.  
8. Interim business rules live in `config/business-rules.yaml`, labelled "not yet decided": on time \= 60 s early to 300 s late; frequent service \= every 15 min or better, weekdays 07:00 to 19:00; 5-minute walk \= 400 m; keep all raw data; store both the HRM stop number and the GTFS stop\_id and show the HRM number.  
9. Every pull request has tests and a section headed "How I verified" with the commands run and their output.  
10. Every card ends with `engineering/learning/<card>.md`, written for the architect: what was built and why, how to run it, and one hands-on exercise. Where a concept maps to an enterprise tool or certification topic (for example PostGIS spatial indexes, SCD2, Kimball stars, REST contracts, CI), say so in one line.  
11. Each source gets its own pipeline, so one failing source greys out only its own layer.  
12. The verifier for each gate is a separate session that has not seen the build. It reports; it does not fix.  
13. Spend nothing. Stop and ask when a step would cost money, needs a key or account you were not given, uses a source that is not open or whose licence is unclear, needs a missing model name, or cannot meet its acceptance check as written.

---

## 6\. End every session with a report

- What is done, with links to branches and pull requests.  
- The evidence (test output, row counts, screenshots of the map).  
- What is blocked and why.  
- Your questions for the architect, numbered, each answerable in a line.

---

## 7\. Open decisions to raise with the architect

1. Tag and close the demo branches, or merge the demo into main?  
2. Home for engineering documents outside `docs/` (section 4, step 4).  
3. Raw vehicle position retention (proposal: 3 months, then condense to stop arrivals and drop old partitions).  
4. Backup of Bronze raw files to Drive: yes or no.  
5. Free static host for later (and whether a public URL is wanted at all).  
6. Repository licence.  
7. Event subtype circle in erwin: skip it (same tables either way) or build it.  
8. Charter V2 must record that realistic 3D is in scope.  
9. What exactly felt wrong in the demo interface.  
10. Whether the Cesium ion token has been rotated and restricted to localhost (it was pasted into a chat on 20 Nov, so it should be rotated before the main build uses it).  
11. Build machine: confirm the operating system, and whether it stays on day and night. If not, the collector stays on the demo PC and writes to which database?  
12. Carry the demo PC's collected data (silver and bronze) over to the build machine, or start the archive fresh?  
13. The GPU makes local tools possible later (for example a local language model for the Phase 4 assistant, or heavier 3D processing of LiDAR). Note these as options only; nothing is to be installed for them now.

---

## 8\. First prompt

Paste this into Claude Code, in a session with access to the GitHub repository and the Google Drive folder:

> You are the lead agent for the MAIN BUILD of the Halifax Digital Twin map application, not the demo. Read "00 Start here: Claude Code handoff, MAIN BUILD" in Drive folder 08 Map Application first; where it disagrees with older documents, it wins. Then do session 0 exactly as written: check your access, read in the order given, and open one pull request from branch s00-initialize with CLAUDE.md, AGENTS.md, .gitignore, .env.example, the repository layout proposal, the V2 brief and task cards, and the Windows setup runbook. Write no feature code. Never commit or repeat the Cesium token or any password. End with the session report and the open decisions, then wait for my review.