# transit_realtime

Collects Halifax Transit's three GTFS Realtime feeds every 30 seconds and writes them into silver.

Ported from the demo (task D02, branch `d08a-live-summary`) with its behaviour unchanged. What changed in the port:

- settings come from `collector/settings.py` (`HALIFAX_TWIN_DB_URL`, `HALIFAX_TWIN_DATA_DIR`), not the demo's `api.settings` import hack;
- raw files go under the data folder, and `bronze.feed_fetch.file_path` holds the path relative to it with forward slashes;
- only one collector can write to a database (PostgreSQL advisory lock);
- raw files older than `raw_retention_days` are deleted once a day;
- a daily log file, and a pid file for `scripts\collector-stop.ps1`.

| Source | Feed | Confirmed |
| --- | --- | --- |
| SRC-001 | Vehicle positions: http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb | 20 Nov 2026 and 21 Nov 2026. About 100 to 120 buses |
| SRC-002 | Trip updates: http://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb | 20 Nov 2026 and 21 Nov 2026. The inventory listed a Mobility Database page as "not checked"; the collector records the confirmed URL in `silver.source` (history kept by SCD2) |
| SRC-003 | Service alerts: http://gtfs.halifax.ca/realtime/Alert/Alerts.pb | 20 Nov 2026 and 21 Nov 2026. About 60 alerts |

Licence: Open Government Licence – Halifax. Attribution: "Contains information licensed under the Open Government Licence – Halifax."

## Run

```powershell
powershell -ExecutionPolicy Bypass -File scripts\collector-start.ps1   # in the background, one copy only
powershell -ExecutionPolicy Bypass -File scripts\collector-stop.ps1
```

One cycle by hand, from the `services` folder (refused while the background collector holds the lock):

```powershell
collector\.venv\Scripts\python.exe -m collector.transit_realtime --once
```

Logs: `C:\halifax-twin-data\logs\transit_realtime_<date>.log`, one per Halifax day. Start-up and crash output: `transit_realtime.console.log` and `transit_realtime.error.log` in the same folder.

## What one cycle does

1. Downloads the three feeds. Each download becomes one row in `bronze.feed_fetch`, success or not. `bronze.feed_gap` reads those rows to find gaps.
2. Keeps each raw file, gzipped, in `<data dir>/bronze/<source>/<Halifax date>/`, recorded in `file_path` as `bronze/<source>/<date>/<file>`. An identical download is not saved twice: its fetch row points at the file already kept.
3. In one transaction: trips, arrivals, positions, alerts. The fetch id is the `dw_batch_id` of every row it wrote.

Needs the schedule (`gtfs_schedule`) for routes and stops. Until it is loaded, trips and arrivals are counted as "waiting", not invented.

## Rules

| Rule | Why |
| --- | --- |
| Only stops with a time at or before the fetch are stored as arrivals | Future times are predictions that change every fetch; a passed stop is what happened |
| An arrival is updated while it stays in the feed | The last value is the closest to the real arrival |
| Service day = GTFS `start_date`, or the Halifax date 3 hours earlier when missing | A trip seen at 01:30 belongs to the previous day's service |
| An alert end in year 3000 is stored as no end | Halifax uses it for "until further notice" |
| An alert that leaves the feed is set to `Ended`, with its end time | Keeps the record instead of deleting it |
| Raw files older than `raw_retention_days` (7) are deleted once a day | Build plan decision of 21 Nov 2026. `bronze.feed_fetch` rows are never deleted |
| A second collector on the same database exits at once | Two writers would make `bronze.feed_gap` look better than it is |
| `trip.scheduled_trip_id` is left empty | `ak1_trip` makes it unique across all days, but a scheduled trip runs every day (open question 7). The link is the key `<trip_id>|<date>` |

## Source to target mapping

### SRC-001 vehicle positions to `silver.vehicle_position` (plus `asset`, `vehicle` for new buses)

| Source field | Silver table.column | Note |
| --- | --- | --- |
| vehicle.vehicle.id | asset.source_asset_key (type Vehicle, SRC-001) to vehicle_position.vehicle_asset_id | |
| vehicle.vehicle.label | vehicle.vehicle_label; asset.asset_name = "Bus <label>" | |
| vehicle.timestamp | vehicle_position.position_ts | Fetch time if missing |
| vehicle.trip.trip_id + start_date | vehicle_position.trip_event_id | Through event.source_event_key `<trip_id>|<date>` |
| vehicle.position.latitude / longitude | position_latitude / position_longitude | 6 decimals (the feed sends 32-bit floats); position_geom is computed |
| vehicle.position.bearing | bearing_degrees | |
| vehicle.position.speed | speed_metres_per_second | |
| vehicle.current_stop_sequence | current_stop_sequence_number | |
| vehicle.current_status | vehicle_stop_status_code | GTFS-RT enum name, for example IN_TRANSIT_TO |
| vehicle.occupancy_status | occupancy_status_code | Enum name; about 40 per cent of buses send it |
| (constant) | source_id = SRC-001 | |

### SRC-002 trip updates to `silver.event` (type Trip), `silver.trip`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| trip.trip_id + trip.start_date | event.source_event_key `<trip_id>|<date>`; event.event_date | |
| trip.route_id | trip.route_asset_id | Route asset from the schedule (SRC-004) |
| trip.schedule_relationship | trip.trip_schedule_status_code; event.event_status_code | SCHEDULED to Scheduled; ADDED, NEW, REPLACEMENT, DUPLICATED, UNSCHEDULED to Added; CANCELED, DELETED to Cancelled |
| earliest / latest stop time in the update | event.event_start_ts / event.event_end_ts | Start keeps its earliest value |
| vehicle.id | trip.vehicle_asset_id | |
| (constant) | event.subsector_id = TRN-01, event.source_id = SRC-002 | |

### SRC-002 stop time updates (passed stops) to `silver.event` (type Stop Arrival), `silver.stop_arrival`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| trip key + stop_sequence | event.source_event_key `<trip_id>|<date>|<seq>`; stop_arrival.stop_sequence_number | |
| arrival.time (else departure.time) | event.event_start_ts (the arrival); event.event_date (Halifax) | |
| departure.time | stop_arrival.actual_departure_ts; event.event_end_ts | |
| arrival.delay (else departure.delay, else time minus scheduled_time) | stop_arrival.reported_delay_seconds | Negative = early |
| stop_id | stop_arrival.stop_asset_id | Stop asset from the schedule |
| (constant) | arrival_observation_method_code = Reported; event_status_code = Arrived | |

### SRC-003 alerts to `silver.event` (type Service Alert), `silver.service_alert`, `silver.event_asset_involvement`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| entity.id | event.source_event_key | |
| active_period.start (earliest) / end (latest) | event.event_start_ts / event_end_ts | Year 3000 to empty |
| cause / effect | service_alert.alert_cause_code / alert_effect_code | Enum names, for example CONSTRUCTION |
| header_text (English) | alert_header_text | Cut to 500 characters |
| description_text (English) | alert_description_text | |
| url | alert_url | Only if it starts with http(s) |
| informed_entity.route_id / stop_id | event_asset_involvement (role Affected route / Affected stop) | Only routes and stops in the schedule |
| present in the feed / gone | event.event_status_code Active / Ended | |
