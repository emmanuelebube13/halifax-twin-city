# Release 1 handover for the final tester

22 Nov 2026, 02:30 Halifax time. Written by the lead session. You have not seen the build: check every claim here; a claim that fails is a finding. You test and report; you do not fix.

Branch `release-1`, built from `s00-initialize` plus six workstream branches and a few integration commits. Nothing has been pushed and no pull request is open (the lead prompt holds that back until the final test passes).

## 1. Start, stop, open

`release-1` is checked out in the worktree `C:\halifax-twin-data\worktrees\release` (outside OneDrive, so virtual environments and `node_modules` stay out of the synced folder). The OneDrive checkout `C:\Users\emman\OneDrive\Documents\Project\Halifax_Twin_city\halifax-twin-city` is on `s00-initialize`; git allows a branch in only one folder at a time.

| Action | Command (PowerShell, in `C:\halifax-twin-data\worktrees\release`) |
| :---- | :---- |
| Start everything | `powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1` (database, collector, API, web app; each only if not running; creates the Python and npm environments on first run) |
| Start the app on example data, no API | add `-Mock` |
| Stop the API and web app only | `powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1 -AppOnly` |
| Stop everything | `powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1` (also stops the collector and database: this leaves a gap in the feed archive that cannot be filled later) |
| Open | http://127.0.0.1:5173/ (web app); http://127.0.0.1:8010/v1/docs (API) |

State left at handover: database and collector running; API and web app stopped.

## 2. Workstreams

All test results below are from runs by the lead on `release-1` (or the workstream folder where stated), 22 Nov 2026 between 01:30 and 02:20.

| Id | Branch, last commit | Delivered | Test command (from the release folder) | Result |
| :---- | :---- | :---- | :---- | :---- |
| A | `s00-docs`, a39df0a | `CLAUDE.md` extended, `AGENTS.md`, `.env.example`, `engineering/runbooks/setup-windows.md`, 14 decision notes, `agent-brief-v2.md`, `task-cards-v2.md` (T01 to T31, M01), project site `site/` and manual `.github/workflows/pages.yml` | No tests (documents). Lead checked owned paths, no emoji, no secret patterns | Pass |
| B | `t03-transit-collector`, 8affae2 | Transit collector and GTFS schedule loader ported from the demo (`services/collector/`), 7-day raw retention, `database/gold/` (planned stop time plus measures for TRN-Q02 to Q05 and Q11), `scripts/collector-*.ps1` | `powershell -ExecutionPolicy Bypass -File scripts\collector-test.ps1` | 45 passed |
| C | `t21-sector-loaders`, 3e354ad | ArcGIS loader `services/collector/hrm_arcgis/` for street and sidewalk closures and building permits; SRC-066 added to reference data | in `services\collector`: `hrm_arcgis\.venv\Scripts\python -m pytest hrm_arcgis --basetemp=C:\halifax-twin-data\tmp\pytest-sector` | 36 passed |
| D | `t05-serving-api`, f935642 | FastAPI serving API (`services/api/`), contract `engineering/contract/openapi.yaml` and examples, `config/` (business rules, 17 sectors, layers, 13 stories), unverified Docker files | in `services\api`: `.venv\Scripts\python -m pytest` | 147 passed (146 from D plus one added by the lead) |
| E | `t06-web-app`, 7d4eb19 | React + TypeScript + Vite app `apps/web/`, design direction, local Protomaps basemap, mock mode | in `apps\web`: `npx vitest run`; `npm run build` | 46 passed; build succeeds |
| F | `m01-model-deliverables`, f463024 | `engineering/model/` (source-to-target mapping, data dictionary, standards with 56 data quality rules), `transform/dbt/` (94 read-only checks), `database/generator/build_data_dictionary.py` | `py -3.12 database\generator\build_data_dictionary.py --check`; `py -3.12 -m unittest discover -s database\generator\tests`; in `transform\dbt`: `.\run-quality.ps1 -TestsOnly` (needs its own venv, see its README) | Up to date; OK; dbt PASS=90 WARN=4 ERROR=0 (run from F's folder, same files) |

Integration commits on `release-1` by the lead: 652ba58 (no-emoji test written with escapes), 519d231 and efce828 (start-all and stop-all; `trn.buses_live` returns 0 when the vehicle feed answers with no vehicles, instead of null), 06c2a35 (chart caption no longer says UTC), bdfb33f (scope changes recorded in `engineering/build-plan.md` section 11), plus this file.

Fixes the lead sent back to builders after the data quality checks: B made arrival dates follow their times (DQ-061, 31 rows corrected) and wrote the spec's `Retired` instead of `Inactive` (DQ-025); C left a closure's end empty when HRM's end date is before its start (DQ-060, event 4545).

## 3. The three original stories

Row counts and dates from `halifax_twin` at 02:20 on 22 Nov 2026 (Halifax time).

| Story | Question | Source used | Licence | Rows in `halifax_twin` | Date range | Fallback? |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| TRN-Q01 | Where is every bus right now, and is it on time? | SRC-001 vehicle positions, SRC-002 trip updates, SRC-003 alerts (`http://gtfs.halifax.ca/realtime/...`), SRC-004 schedule `google_transit.zip`, version `2026_08_August_20260806` | Open Government Licence – Halifax | 30,670 vehicle positions; 13,361 stop arrivals; 706 trips; 71 service alerts; schedule 2,358 stops, 81 routes, 9,239 trips, 324,165 stop times | Positions 21:04 on 21 Nov to 01:40 on 22 Nov (no buses in the feed after 01:40 overnight); schedule valid 24 Aug to 29 Nov 2026 | No |
| PWK-Q13 | Where does utility work restrict street access or parking, and for how long? | SRC-015: `Street_Closures/FeatureServer/0` and `Development_Street_Closures/FeatureServer/0` on `services2.arcgis.com/11XBiaBYA9Ep0yNJ` | Open Government Licence – Halifax (item licence "Open Data Licence", confirmed by C) | 3,013 Road Closure events (479 utility, PWK-03; 1,614 PWK-04; 920 TRN-09), all with line geometry | Starts 1 Apr 2018 to 19 Dec 2026 | No |
| HRE-Q29 | How many building permits are issued, for how many units, and where? | SRC-066: `PPLC_Permits_Geolocated/FeatureServer/0` (the inventory's `PPLC_Issued_Building_Permits` has no geometry) | Open Government Licence – Halifax | 14,822 Building Permit events, all with point geometry (2,160 not yet issued are skipped) | Issued 22 Dec 2020 to 19 Nov 2026 | No; source address differs from the inventory |

## 4. All 13 stories

States are as `/v1/stories` reported them at 02:10 on 22 Nov 2026. "Collecting data" stories switch to live by themselves when the archive is long enough.

| Story | State | Why |
| :---- | :---- | :---- |
| TRN-Q01 | Working | Live buses verified by E earlier in the evening; at the lead's walkthrough (02:10, Sunday) the feed listed 0 buses, so the answer read "0 buses are on the road now" |
| PWK-Q13 | Working | 1 utility closure in effect now |
| HRE-Q29 | Working | 2,098 permits so far this year, 5,290 new units |
| TRN-Q25 | Working | Closure lengths and nearby bus routes |
| PWK-Q16 | Working | 13 planned closures in the next 30 days, 7 on bus routes |
| TRN-Q02 | Collecting data | Needs at least one whole service day (archive started 21:05 on 21 Nov) |
| TRN-Q03 | Collecting data | Same |
| TRN-Q04 | Collecting data | Same |
| TRN-Q05 | Collecting data | Same |
| TRN-Q11 | Collecting data | Needs 14 days |
| TRN-Q09 | Collecting data | Needs 14 days |
| HRE-Q08 | Source incomplete | The permit source has no rental or ownership field; shows all new units with that note |
| HRE-Q30 | Source incomplete | The application date is in the source but has no silver column; shows issue to completion instead |

## 5. The collector

| Item | Value |
| :---- | :---- |
| Processes | Interpreter 38304, started by the venv launcher 36992; both started 02:05:36 on 22 Nov 2026, from `C:\halifax-twin-data\worktrees\release` |
| Archive started | 21:05:13 on 21 Nov 2026 (first restart 01:37 by B; second 02:05 by the lead, to run from `release-1`; neither left a gap longer than a normal cycle) |
| Stop | `powershell -ExecutionPolicy Bypass -File C:\halifax-twin-data\worktrees\release\scripts\collector-stop.ps1` (stops both processes) |
| Logs | `C:\halifax-twin-data\logs\transit_realtime_<date>.log`; pid in `transit_realtime.pid` |
| Largest gap | 89.9 s on SRC-002 (trip updates) at 00:48 on 22 Nov, from two failed fetches at the source (HTTP 500, then 404). SRC-001 and SRC-003 never exceeded 32 s. No gap over 2 minutes |
| One copy only | PostgreSQL advisory lock plus a process check in `collector-start.ps1` |

## 6. Known gaps

**Not built or not verified**
1. 3D is untested: no Cesium ion token on this machine. The switch is disabled with a note.
2. The lead could not test bus selection, the bus popup, Open detail and Follow against live data: no buses were in service during the walkthrough (02:00 to 02:20 on a Sunday). E's own screenshots `r8-*-03b-story-selected-bus.png` show them.
3. Docker files for the API are unverified (Docker is not installed and needs administrator rights).
4. GitHub Pages site and workflow are not enabled; the workflow runs only when started by hand.
5. Blender GLB pins (three levels of detail) are not built; pins use the 2D bus render.
6. The Reports panel from wireframe 3 is left out (no report exists yet).
7. The Analytics lens shows numbers and charts, but the map itself does not change.
8. The basemap `/tiles` route exists only in the Vite dev and preview servers; a static host will need it.
9. No pull requests have been opened, and no branches pushed.
10. The V2 brief and task cards were not written to Drive, and the step 10 to 12 documents were not uploaded to Drive folder 07; both wait for the architect.

**Different from the build plan or the contract**
11. The fetch-logging helper is not unified: `services/collector/common.py` (B) and `services/collector/hrm_arcgis/arcgis.py` (C) each write `bronze.feed_fetch` with the same columns and the same relative, forward-slash `file_path`. Merging them means moving `hrm_arcgis` into the `collector` package, left for a later card.
12. The contract has additive changes beyond section 6, all awaiting approval: `/v1/sectors`, `/v1/replay/{layer}`, `/v1/health`, `/v1/client-config`; story statuses `collecting_data` and `source_incomplete` with `status_note`; source status `unknown`; series `t` as year, month or label; extra optional fields; about 30 extra numbers and 6 extra layers for the added stories.
13. HRE-Q29's source address differs from the Source Inventory (geolocated layer).
14. `release-1` lives in a worktree, not the OneDrive checkout (section 1).

**Rough edges seen in the walkthrough**
15. Singular and plural are not handled: "1 street closures are in effect", "1 items".
16. With no recent arrivals, TRN-Q01's answer reads "and – of stop arrivals in the last 30 minutes were on time".
17. City view shows "Street closures 1" (utility only, PWK-Q13) beside "Closures in effect 92" (all closures): the labels do not explain the difference.
18. Daily sources show their real age ("Updated 5 h ago") beside live sources; correct, but may look stale.
19. dbt warnings on real data: DQ-043 (feed stop sequence disagrees with the schedule for about 18 per cent of arrivals), DQ-044 twice (closures and permits not linked to street segments or parcels, which are not loaded yet), DQ-065 (one arrival 12,440 s late).
20. `npm install` warns that the postinstall scripts of `esbuild` and `protobufjs` are not covered by npm's allowScripts; install, build and dev server still work.
21. Web bundle 408 kB gzipped; not measured on a real phone.
22. Some analytics queries may slow as the archive grows (no time index on `silver.event`); a slow answer returns 503 for that number only.

**Design for the architect to judge**
- Direction: `apps/web/design/direction.md` ("Harbour chart": dark rail, night-harbour answer plate, amber numbers, custom Protomaps basemap).
- Final screenshots from E (after two independent critique rounds): `C:\halifax-twin-data\worktrees\web\apps\web\screenshots\r8-laptop-*.png` and `r8-phone-*.png` (11 screens each).
- Lead walkthrough against the live API: `C:\halifax-twin-data\worktrees\release\apps\web\screenshots\lead\` (8 screens at 1440 by 900 and 390 by 844; `report.json` shows 0 console errors and no horizontal scroll on every screen).
- Screenshots are git-ignored.

## 7. Project Tracker items

| Tracker item | Delivered | Where | State |
| :---- | :---- | :---- | :---- |
| Phase 1 step 10, source-to-target mapping | 143 rows for SRC-001 to 004, 015, 066 | `engineering/model/sttm.csv`, `sttm.md` | Done; not yet in Drive 07 |
| Phase 1 step 11, data dictionary | 63 silver tables, 520 columns, plus `bronze.feed_fetch`, generated from the spec | `engineering/model/data-dictionary.csv`, `.md`; `database/generator/build_data_dictionary.py` | Done; 11 columns lack a `COMMENT ON` |
| Phase 1 step 12, standards and data quality rules | 56 rules, DQ-001 to DQ-098 | `engineering/model/standards.md` | Done; thresholds interim |
| Phase 2 task 6, automated data quality checks | dbt Core, 94 checks, read-only | `transform/dbt/` | Done; PASS=90 WARN=4 ERROR=0 |
| Phase 3 task 3, Docker for the API | Dockerfile, compose file, runbook | `services/api/Dockerfile`, `compose.yaml`, `docker.md` | Written, unverified (install Docker Desktop) |
| Phase 3 task 5, GitHub Pages project site | Static site and manual workflow | `site/`, `.github/workflows/pages.yml` | Built, not enabled |

## 8. Questions for the architect

1. Do you confirm the two scope changes in build plan section 11 (13 stories; workstream F, Docker, Pages site and design brief), which reached the lead as messages from another session?
2. Do you approve the contract additions in gap 12 (four endpoints, two story statuses, source status `unknown`, extra numbers and layers)?
3. Will you set a rotated, localhost-restricted Cesium ion token as the user variable `CESIUM_ION_TOKEN`, so 3D can be tested?
4. Will the build machine stay on, awake and logged in day and night for Gate 0's 48 hours?
5. Should the portable database start at logon by a Startup-folder shortcut, or be registered as a Windows service?
6. May the collector logon task (`scripts\collector-register-task.ps1`) be registered, and from which folder?
7. Should `HALIFAX_TWIN_DB_URL` and `HALIFAX_TWIN_DATA_DIR` be set as user environment variables now?
8. Should the demo branches be tagged `demo-2026-11-20` and closed, or merged into main?
9. Move the demo PC's collected data here (PostgreSQL 18 to 16 is a downgrade), or keep the archive that started 21 Nov?
10. Should Bronze raw files be backed up to Drive?
11. Should the 7-day raw retention cover all of `bronze\`, including one-off ArcGIS downloads, or only the realtime feeds?
12. Do you confirm `engineering/` as the home for engineering documents?
13. Are T31 (schedule loader port) and M01 (model tooling) acceptable new card numbers?
14. Is dbt Core acceptable as the Silver to Gold tool for T16?
15. Which licence should the repository carry?
16. Should the V2 brief and task cards also be written as Google Docs in Drive folder 08?
17. Should Pages be turned on and the workflow set to deploy on every push to main?
18. On the site, keep IBM Plex from Google Fonts, or self-host it to avoid sending visitors' addresses to Google?
19. Should the site take on the web app's design tokens, or keep its own chart look?
20. Is "Harbour chart" (dark rail, night-harbour answer plate, amber numbers) the identity you want for the app?
21. Should the sector rail stay dark, or be light as in the wireframes?
22. Do you confirm the five sector groups and pinning Transportation, Public Works and Housing by default?
23. Is the 24-hour clock confirmed (the plan marks it as a proposal)?
24. For the grey square status, keep "No arrival yet", or use "No schedule"?
25. On a phone, should the selected-bus card sit above the answer, or below the counts as wireframe 06 has it?
26. May the 16 MB basemap extract stay in `C:\halifax-twin-data\tiles`, rebuilt by `scripts/make-basemap.ps1` in `apps/web`?
27. In the Analytics lens, should the map colour routes by on-time share?
28. Is a bus "bunched" at less than 0.25 of the planned gap after the bus ahead, or 0.5?
29. Is a "long gap" more than 1.5 times the planned gap?
30. Is a segment "slow" on a day when its median time is more than 1.2 times planned, and "consistently slow" on at least half of 5 or more days?
31. Should TRN-Q05's "not covered" gap be 300 s, or 120 s to match Gate 0?
32. Do you accept closure-to-route 20 m, closure-to-stop 30 m and a 30-day planned window as interim rules?
33. May B's and D's interim thresholds all live in `config/business-rules.yaml`, labelled "not yet decided"?
34. Is straight-line distance between stops acceptable for segment speeds until route shapes are cut into segments?
35. Is `Retired` right for stops and routes that leave the GTFS file, and may a CHECK constraint (Active, Planned, Retired) be proposed for `silver.asset`?
36. Should the arrival-to-schedule link use stop_id instead of stop_sequence, given the 18 per cent mismatch (DQ-043)?
37. Is `closure_type_code = Full` acceptable for every street closure line (the layer has no extent field)?
38. Accept closure subsectors by type: Utility to PWK-03, Construction and Development to PWK-04, others to TRN-09?
39. Accept permit type Addition mapped to `Alteration`, or add `Addition` as a value?
40. Accept units created and removed taken from `NET_NEW_UNITS`?
41. Use the publisher's `PERMIT_STATUS` and `CLOSURE_STAGE` text as `event_status_code`?
42. May we propose a permit application date column and a structure type column on `building_permit` (for HRE-Q30 and HRE-Q08)?
43. May we propose a public notes column on `road_closure`, once contact details can be stripped?
44. Should the Source Inventory's SRC-066 list the geolocated layer's address?
45. Keep HRM's 31 Dec 2099 end dates on open-ended closures, or store an empty end?
46. Accept leaving a closure's end empty when the source end date precedes its start?
47. Should HRM open data be told about the reversed record (closure on University Ave, 16 May 2026)?
48. Is GLOBALID an acceptable closure key, given it changes if HRM republishes the layer?
49. One location per building permit, or shared per civic address once civic addresses are loaded?
50. Should HRE-Q08 ship as "all new units" with its note, or be hidden until a tenure source exists?
51. Is it acceptable for TRN-Q25 to describe what a closure affects as nearby bus routes plus its extent?
52. May we propose an index on `silver.event (event_type_code, event_start_ts)` for the analytics queries?
53. Should the 11 missing column comments be added to the generator (regenerating scripts 06 and 07)?
54. Are the ArcGIS freshness limits (SRC-015 warn 24 h, error 72 h; SRC-066 warn 7 days, error 31 days) acceptable?
55. Should the location-rule warnings (DQ-044) stay warnings until street segments and parcels are loaded?
56. Is the Halifax box (longitude -64.6 to -62.0, latitude 44.3 to 45.4) right for the geometry check?
57. Should the data quality checks run nightly, or only by hand?

## 9. Fixes after the final test (22 Nov 2026)

The final test passed with findings. These are the fixes for the four findings to re-test, plus the smaller ones, all merged into `release-1`.

| Finding | Fix | Owner, commit | Evidence |
| :---- | :---- | :---- | :---- |
| 1. Closures and permits never refresh | `scripts/sector-refresh.ps1` (all layers, or `-Layers`; log `C:\halifax-twin-data\logs\sector_refresh_<date>.log`; non-zero exit if a layer fails; one copy at a time) and `scripts/sector-register-task.ps1` (task "Halifax Twin sector refresh", every 6 hours at 01:15, 07:15, 13:15, 19:15, only while logged on; `-Unregister` removes it) | C, aa28929 | Hand run at 08:01: all layers loaded, +0 ~0 (HRM changed nothing since 01:37); a bad layer name exits with code 2 |
| 2. Bus detail "Route 9B to –" | API: vehicle detail now carries `route_short_name`, `route_long_name`, `route_id`, `trip_id`, `headsign`, `status`, `delay_seconds`, `next_stop_name` (null and `unknown` when not live). App: falls back to the live bus, never shows a dash when a headsign exists, title case for capital-letter headsigns | D, d3fce53; E, 59c2c29 | API test: detail equals live layer for a live bus; app tests in `src/components/fixes.test.tsx` |
| 3. Phone Follow hides the bus | Follow lowers the sheet to its smallest height and centres the bus above it; the phone frame no longer scrolls the map away | E, 59c2c29 | `scripts/screenshots-fixes.mjs` checks, 30 of 30 pass |
| 4. Chart labels run together or read "2026-03" | Labels thinned to fit, newest period always labelled, months as "Mar 2026" through the shared formatter | E, 59c2c29 | Unit tests and browser checks |
| Smaller | Singular sentences through optional `answer.template_one`; one as-of rule for panel and map footer; tabular Plex Sans figures (no "2 , 098"); 44 px sheet handle; partial periods marked `"partial": true` by the API and drawn hatched (2020 permits, current year and month); HRE-Q30 sentence says "days"; `trn.trips_not_run_by_day` cached per day, 0.34 s on a fresh API (was 3.2 to 5.7 s) | D, d3fce53 and 46982e2; E, 59c2c29 | API 153 passed; web 59 passed, build succeeds, axe-core no violations |

Screenshots of the fixed screens against the live API (79 to 80 buses): `C:\halifax-twin-data\worktrees\web\apps\web\screenshots\fix-laptop-*.png` and `fix-phone-*.png` (TRN-Q01, PWK-Q13, HRE-Q29, bus selected, bus detail, bus follow).

New known gaps:
- The sector refresh task is written but not registered. Until it is, closures and permits refresh only when `scripts\sector-refresh.ps1` is run by hand. Register it only from a checkout that contains the script and keeps its virtual environment outside OneDrive. Today that is `C:\halifax-twin-data\worktreeselease` (branch `release-1`): `powershell -ExecutionPolicy Bypass -File scripts\sector-register-task.ps1`. The OneDrive checkout is on `s00-initialize`, which has no `sector-refresh.ps1` until the pull requests merge, and registering there would create a venv inside OneDrive. The same applies to `scripts\collector-register-task.ps1`.
- `answer.template_one` handles only the first number in a sentence; a second count of 1 still reads plural.
- `trn.on_time_share_24h` does not mark the current hour as partial.
- The first `trn.trips_not_run_by_day` call after an API restart once took 6.4 s; not reproduced.

Question for the architect: is a sector refresh every 6 hours, only while you are logged on, acceptable (running while logged off would mean storing your Windows password in the task)?
