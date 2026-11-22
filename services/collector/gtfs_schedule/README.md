# gtfs_schedule

Loads Halifax Transit's GTFS schedule (SRC-004): routes and stops as assets, plus one schedule version with its calendar, trips and stop times. Ported from the demo (task D03, branch `d08a-live-summary`) with its behaviour unchanged, plus tests against a scratch database.

- Source: http://gtfs.halifax.ca/static/google_transit.zip (confirmed 20 Nov 2026 and 21 Nov 2026; 6 MB, last modified 6 Aug 2026).
- Version loaded on 21 Nov 2026: `2026_08_August_20260806`, service 24 Aug to 29 Nov 2026: 81 routes, 2,358 stops, 9 service patterns, 82 exceptions, 9,239 trips, 324,165 stop times.
- Licence: Open Government Licence – Halifax.

The current service period ends on 29 Nov 2026. Run the loader again after Halifax Transit publishes the next file: the new version is added, and the old one stays (old schedules are needed to judge past trips).

## Run

```powershell
powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1
powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1 -File C:\path\to\google_transit.zip
```

About 6 seconds on the build machine. Running it again for the same version refreshes routes and stops only and adds no history. Raw file: `<data dir>/bronze/SRC-004/<date>/google_transit_<time>.zip`; an identical file still kept is reused.

## Today's planned stop times

The loader installs `gold.planned_stop_time(day)` from `database/gold/planned_stop_time.sql`, a read-only function in the gold schema; silver is not changed.

```sql
SELECT route_short_name, count(DISTINCT scheduled_trip_id) AS trips, count(*) AS stop_times
  FROM gold.planned_stop_time((now() AT TIME ZONE 'America/Halifax')::date)
 GROUP BY 1 ORDER BY 3 DESC LIMIT 5;
```

The server runs in UTC, so use the Halifax date, not `CURRENT_DATE` (after 20:00 Halifax time in winter they differ).

## Rules

| Rule | Why |
| --- | --- |
| Stops and routes are matched by GTFS id (`source_asset_key`) and updated in place | History is kept by SCD2; a reload with no change adds no history |
| A stop or route missing from a new file becomes `Retired` with an out-of-service date | It is never deleted. `Retired` is the model's value (Active, Planned, Retired); the demo wrote `Inactive` (DQ-025) |
| A service listed only in `calendar_dates.txt` gets a `service_calendar` row with no weekdays, spanning its dates | The model requires a calendar row; with no weekdays only its "Added" dates make it run, which is what GTFS means |
| Times past midnight stay as intervals (25:10:00) | They keep their order and their service day |
| A repeated `stop_code` is stored as empty | `ak1_stop` makes stop_code unique |

## Source to target mapping

| Source file.field | Silver table.column | Note |
| --- | --- | --- |
| feed_info.feed_version | schedule_version.feed_version_label | |
| trailing date of feed_version (else download date) | schedule_version.feed_published_date | `..._20260806` to 2026-08-06 |
| feed_info.feed_start_date / feed_end_date | schedule_version.service_period_start_date / _end_date | Else min/max calendar dates |
| calendar.service_id | service_calendar.service_code | |
| calendar.monday to sunday | service_calendar.monday_flag to sunday_flag | 1 to true |
| calendar.start_date / end_date | service_calendar.start_date / end_date | |
| calendar_dates.service_id, date | service_calendar_exception.service_code, exception_date | |
| calendar_dates.exception_type | service_calendar_exception.exception_type_code | 1 to Added, 2 to Removed |
| routes.route_id | asset.source_asset_key (type Route, SRC-004) | |
| routes.route_short_name / route_long_name | route.route_short_name / route_long_name; asset.asset_name "Route 1 Spring Garden" | |
| routes.route_type | route.route_mode_code | 3 to Bus, 4 to Ferry |
| shapes (all shapes a route's trips use) | location (key `route-<route_id>`, type Line), MultiLineString; asset.location_id | Centroid computed |
| stops.stop_id | asset.source_asset_key (type Stop, SRC-004) | |
| stops.stop_code | stop.stop_code | |
| stops.stop_name | stop.stop_name; asset.asset_name; location.location_name | |
| stops.stop_lat / stop_lon | location (key `stop-<stop_id>`, type Point) geometry and centroid | |
| stops.location_type | stop.stop_kind_code | empty/0 to Stop, 1 to Station, 2 Entrance, 3 Node, 4 Boarding area |
| stops.parent_station | stop.parent_stop_asset_id | Set in the same statement (no false history) |
| stops.wheelchair_boarding | stop.wheelchair_boarding_code | 0 to No information, 1 to Accessible, 2 to Not accessible |
| trips.trip_id | scheduled_trip.source_trip_key | |
| trips.service_id | scheduled_trip.service_code | |
| trips.route_id | scheduled_trip.route_asset_id | |
| trips.direction_id | scheduled_trip.direction_code | 0 or 1 |
| trips.trip_headsign / block_id / shape_id / wheelchair_accessible | trip_headsign / block_code / shape_key / wheelchair_accessible_code | |
| stop_times.stop_sequence | scheduled_stop_time.stop_sequence_number | |
| stop_times.stop_id | scheduled_stop_time.stop_asset_id | |
| stop_times.arrival_time / departure_time | scheduled_arrival_time / scheduled_departure_time | interval |
| stop_times.timepoint / pickup_type / drop_off_type | timepoint_flag / pickup_type_code / drop_off_type_code | |
