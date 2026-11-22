# HRM ArcGIS loaders (workstream C)

Loads three Halifax Regional Municipality open data layers into silver, for the Public Works and Housing stories:

| Layer (command name) | Source | Story | Silver |
| :---- | :---- | :---- | :---- |
| `street_closures` | SRC-015 | PWK-Q13 (also PWK-Q16, TRN-Q25, TRN-Q09) | `location` + `event` + `road_closure` |
| `sidewalk_closures` | SRC-015 | PWK-Q13 (also PWK-Q16, TRN-Q25) | `location` + `event` + `road_closure` |
| `building_permits` | SRC-066 | HRE-Q29 (also HRE-Q08, HRE-Q30) | `location` + `event` + `building_permit` |

`event_coverage` is not written: street segments are not loaded yet; `RDMID` in the raw closures is the segment id to use when they are.

## Run

```powershell
py -3.12 -m venv .venv
.venv\Scripts\pip install -r services\collector\hrm_arcgis\requirements.txt
cd services\collector
..\..\.venv\Scripts\python -m hrm_arcgis                    # every layer, each its own run
..\..\.venv\Scripts\python -m hrm_arcgis building_permits   # one layer
..\..\.venv\Scripts\python -m hrm_arcgis --profile          # populated share of each field, from the latest raw files
```

Settings come from the environment: `HALIFAX_TWIN_DB_URL` (default `postgresql://postgres@localhost:5433/halifax_twin`; the password comes from `pgpass.conf`, never from here) and `HALIFAX_TWIN_DATA_DIR` (default `C:\halifax-twin-data`).

Tests (scratch database `halifax_twin_test_sector`, built with `CREATE DATABASE` and `database/sql/run_all.sql`; override with `HALIFAX_TWIN_TEST_DB_URL`; the tests refuse to run against `halifax_twin`):

```powershell
.venv\Scripts\python -m pytest services\collector\hrm_arcgis --basetemp=C:\halifax-twin-data\tmp\pytest-sector
```

## How it works

1. **Fetch** (`arcgis.py`): `<layer>/query?where=1=1&outFields=<listed fields>&outSR=4326&f=geojson`, ordered by `OBJECTID`, 1,000 features a page, one second between pages, two retries on failure. Each page is saved gzipped as `bronze/<source>/<YYYY-MM-DD>/<layer>_<HHMMSS>_p<NNN>.geojson.gz` under the data root and logged as one `bronze.feed_fetch` row (committed at once, so failures are on record). Any failed page, or a total that differs from the layer's own count, stops that layer before silver is touched.
2. **Transform** (`transform.py`): pure functions from features to rows; features that cannot be stored without inventing data are skipped and counted.
3. **Store** (`store.py`): rows go into a temporary staging table, then three set-based statements write `location`, `event` and the subtype in one transaction, each `ON CONFLICT` on its alternate key (`source_id` + source key). An update fires only when a value really changed, so a re-run with the same data changes no row (no new `location_hist` versions). Rows that disappear from the source are kept.
4. **Retention**: raw files older than 7 days are deleted after each run (`--no-prune` keeps them); `bronze.feed_fetch` rows are kept.

Only the fields listed in `sources.py` are downloaded. The closure layers' `COMMENTS` field is deliberately not requested: it can hold contact names and phone numbers, and silver has no column for it. None of these layers has an owner or applicant name field.

## Sources (confirmed 21 Nov 2026)

All three are published by the account `opendata_HRM`, public, item licence "Open Data Licence", which is the Open Government Licence – Halifax v1.0 (https://data-hrm.hub.arcgis.com/pages/open-data-licence). Attribution: "Contains information licensed under the Open Government Licence – Halifax".

| Command name | Address | Rows | Geometry | Item |
| :---- | :---- | ----: | :---- | :---- |
| `street_closures` | `https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Street_Closures/FeatureServer/0` | 2,772 | polyline | 6dc3953c5c32483d9f574382de804864 |
| `sidewalk_closures` | `.../Development_Street_Closures/FeatureServer/0` ("Sidewalk Closures and Disruptions") | 241 | polyline | 5d5dac90bfe9404889519b941112d251 |
| `building_permits` | `.../PPLC_Permits_Geolocated/FeatureServer/0` ("PPL&C Building Permits Geolocated") | 16,982 | point | 6ac34a5bc6554d25b137ef432d506f08 |

Notes:
- `Street_Closures` holds history back to April 2018, not only current closures, so past closures do not need polling to be kept. `Street_Closures_Active` and `_Upcoming` are separate copies with their own GLOBALIDs; they are not loaded.
- The building permit layer is one row per permit (16,982 distinct permit numbers). The inventory's address, `PPLC_Issued_Building_Permits`, is a table without geometry and has one row per permit, parcel and occupancy type (19,581 rows, 17,067 permits). The geolocated layer covers 16,982 of those 17,067 permits.

## Source-to-silver mapping

### Street closures (SRC-015, `Street_Closures/0`)

| Silver column | Value |
| :---- | :---- |
| `location.source_location_key`, `event.source_event_key` | `GLOBALID` |
| `location.location_type_code` / `geometry_type_code` | `Line` / `Line` |
| `location.location_name` | `STREET_NAME from FROM_STR to TO_STR` |
| `location.location_geometry` | feature geometry, EPSG:4326; centroid columns from `ST_PointOnSurface` |
| `event.event_type_code` | `Road Closure` |
| `event.event_start_ts` | `START_DATE` (a Halifax-midnight date) plus the first clock time read from `START_TIME`; 00:00 when no time can be read. If `ALT_DATE_USED` = 1, `ALT_START_DATE` and `ALT_END_DATE` replace the dates |
| `event.event_end_ts` | `END_DATE` plus the time from `END_TIME`; 24:00 on the end date when no time can be read or the result would precede the start (for example `12:00AM`) |
| `event.event_date` | Halifax date of the start |
| `event.subsector_id` | by `CLOSURE_TYPE`: Utility to `PWK-03`; Construction and Development to `PWK-04`; Special Event, Block Party, Other, Mobility Response to `TRN-09` |
| `event.event_status_code` | `CLOSURE_STAGE` (all rows: `Approved`) |
| `road_closure.closure_type_code` | `Full` |
| `road_closure.closure_reason_code` | `CLOSURE_TYPE` (`Mobility Response – Streets` stored as `Mobility Response`, the source's dash is damaged) |
| `road_closure.detour_description` | `DETOUR_URL` (despite its name it holds detour text), blank and `N/A` as null |

### Sidewalk closures (SRC-015, `Development_Street_Closures/0`)

Same as above except: no time fields (whole days); no status (`event_status_code` null); subsector `PWK-04`; `closure_reason_code` `Development`; `closure_type_code` from `TYPE` (domain `TRN_RDM_EncroachTypes`): `SW_CLOSED` Sidewalk Closed and `SW_TEMP` Temporary Sidewalk to `Sidewalk`; `S_CLOSED_SW_CLOSED` and `S_CLOSED_SW_TEMP` (Lane Closed, ...) to `Lane`; `S_OPEN_SW_CLOSED` and `S_OPEN_SW_TEMP` (two rows, not in the published domain) to `Sidewalk`. An unknown `TYPE` is skipped, not guessed.

### Building permits (SRC-066, `PPLC_Permits_Geolocated/0`)

Only permits with a `DATE_OF_PERMIT_ISSUANCE` are stored: the model defines Building Permit as a permit issued, with Event Start = issued. 2,160 of 16,982 (permits in review, withdrawn before issue and so on) are skipped and counted; they load once issued.

| Silver column | Value |
| :---- | :---- |
| `location.source_location_key`, `event.source_event_key` | `PERMIT_NUMBER` |
| `location.location_type_code` / `geometry_type_code` | `Point` / `Point` |
| `location.location_name` | `CIVIC_NUMBER STREET_NAME, COMMUNITY` |
| `location.location_geometry` | feature point, EPSG:4326 |
| `event.event_type_code` | `Building Permit` |
| `event.event_start_ts` / `event_date` | `DATE_OF_PERMIT_ISSUANCE` (date-only, published as 12:00 UTC) as 00:00 Halifax time / that date |
| `event.event_end_ts` | `COMPLETED_DATE` the same way, when present and not before the issue date |
| `event.subsector_id` | `HRE-09` |
| `event.event_status_code` | `PERMIT_STATUS` (Completed, Issued, Expired, Cancelled ...) |
| `building_permit.permit_type_code` | `WORK_TYPE` (or `PRIMARY_WORK_SCOPE`): New Building to `New`; Renovation and Addition to `Alteration` |
| `building_permit.work_description` | `WORK_DESCRIPTION` |
| `building_permit.construction_value_amount` | `ESTIMATED_PROJECT_VALUE` (the applicant's estimate) |
| `building_permit.units_created_count` / `units_removed_count` | from `NET_NEW_UNITS`: positive part / negative part |
| `development_project_event_id`, `building_asset_id` | null (not loaded yet) |

## Fields the wider release 1 stories need

Populated share measured on the downloads of 21 Nov 2026 (`python -m hrm_arcgis --profile`).

| Need | Story | Source field (populated) | Silver column | State |
| :---- | :---- | :---- | :---- | :---- |
| Closure start date and time | PWK-Q13, PWK-Q16, TRN-Q25, TRN-Q09 | `START_DATE` (100%), `START_TIME` (99.3% filled; a clock time read in 98.1%) | `event.event_start_ts` | Mapped |
| Closure end date and time | same | `END_DATE` (100%), `END_TIME` (99.4%; read in 98.2%) | `event.event_end_ts` | Mapped |
| Sidewalk closure dates | same | `START_DATE`, `END_DATE` (100%), no times | `event.event_start_ts`, `event_end_ts` | Mapped, whole days |
| Closure type (cause) | PWK-Q13, TRN-Q09 | `CLOSURE_TYPE` (100%) | `road_closure.closure_reason_code` | Mapped |
| Closure extent (full, lane, sidewalk) | PWK-Q16, TRN-Q25 | `TYPE` on sidewalk layer (100%); none on the street layer | `road_closure.closure_type_code` | Mapped; street layer set to `Full` (open question for the architect) |
| Planned or unplanned | PWK-Q16 | No field. Both layers are described by HRM as planned closures approved by the Engineer; `CLOSURE_STAGE` is `Approved` on every row. Unplanned closures are not in these layers | none (`event_status_code` holds `Approved`) | Absent |
| Detour | TRN-Q25 | `DETOUR_URL` (5.8%) | `road_closure.detour_description` | Mapped |
| What a closure affects (public notes) | TRN-Q25 | `COMMENTS` | none | Not downloaded (personal contact details; no column) |
| Re-opens evenings or weekends | TRN-Q25, TRN-Q09 | `REOPEN_EVENINGS` (85.9%), `REOPEN_WEEKENDS` (44.7%) | none | Absent in silver (raw only) |
| Closure application date | | `APPLICATION_DATE` (93.4%) | none | Absent in silver (raw only) |
| Road segment id | TRN-Q09, PWK-Q16 | `RDMID` (100%) | none until street segments load (`event_coverage`) | Absent in silver (raw only) |
| Permit units | HRE-Q29, HRE-Q08 | `NET_NEW_UNITS` (100%), `TOTAL_END_RESIDENTIAL_UNITS` (65.8%), `EXISTING_RESIDENTIAL_UNITS` (27.3%) | `units_created_count`, `units_removed_count` from `NET_NEW_UNITS` | Mapped (net only) |
| Dwelling type | HRE-Q08 | `TYPE_OF_STRUCTURE` (100%: Dwelling - Single Detached, Dwelling - Multiple Units, Backyard Suite ...) | none | Absent in silver (raw only) |
| Rental or owned | HRE-Q08 | No field in this layer. `OCCUPANCY_TYPE` (Residential Use, Secondary Suite, Shared Housing ...) is only in the non-geolocated table and the "Permits Info" table, and is a use, not tenure | none | Absent |
| Permit application date | HRE-Q30 | `DATE_OF_SUBMISSION` (99.5%) | none: `event_start_ts` is the issue date by the model | Absent in silver (raw only) |
| Permit issue date | HRE-Q29, HRE-Q30 | `DATE_OF_PERMIT_ISSUANCE` (87.3%) | `event.event_start_ts`, `event_date` | Mapped |
| Permit completion date | HRE-Q30 | `COMPLETED_DATE` (59.7%) | `event.event_end_ts` | Mapped |
| Permit status | HRE-Q29, HRE-Q30 | `PERMIT_STATUS` (100%) | `event.event_status_code` | Mapped |

With today's silver, HRE-Q30 can measure issue to completion, not application to completion.

## Code values chosen (the model gives none or the source does not say)

| Column | Value(s) written | Why |
| :---- | :---- | :---- |
| `event.event_type_code` | `Road Closure`, `Building Permit` | Entity names, as the plan and demo do |
| `location.location_type_code` | `Line` (closures), `Point` (permits) | As the demo did for route lines and stops |
| `location.geometry_type_code` | `Line`, `Point` (`None` if a feature has no geometry) | Model's listed values |
| `event.subsector_id` for closures | `PWK-03`, `PWK-04`, `TRN-09` by closure type | One event has one subsector |
| `event.event_status_code` | publisher's `CLOSURE_STAGE` and `PERMIT_STATUS` values as given | No domain in the model |
| `road_closure.closure_type_code` | `Full` for every street closure line | Layer is the street closures under section 332 of the HRM Charter; the sidewalk layer separates lane closures, but the street layer has no extent field |
| `road_closure.closure_reason_code` | publisher's `CLOSURE_TYPE`; `Development` for sidewalk layer | No domain in the model |
| `building_permit.permit_type_code` | Addition to `Alteration` | Model lists New, Alteration, Demolition |
| Units created and removed | from `NET_NEW_UNITS` | Created = gains, removed = losses, net per permit |
