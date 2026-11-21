# transit_realtime (task D02)

Collects Halifax Transit's three GTFS Realtime feeds every 30 seconds and writes them into silver.

| Source | Feed | Confirmed 20 Nov 2026 |
| --- | --- | --- |
| SRC-001 | Vehicle positions: http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb | About 120 buses, every bus has a trip |
| SRC-002 | Trip updates: http://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb | About 410 entries; the inventory listed this endpoint as "not checked". The collector records the confirmed URL in `silver.source` (history kept by SCD2) |
| SRC-003 | Service alerts: http://gtfs.halifax.ca/realtime/Alert/Alerts.pb | About 60 alerts |

Licence: Open Government Licence – Halifax. Attribution: "Contains information licensed under the Open Government Licence – Halifax."

## Run

`demo\start.ps1` starts it with the app. On its own:

```powershell
powershell -ExecutionPolicy Bypass -File demo\load.ps1 transit_realtime          # until Ctrl+C
powershell -ExecutionPolicy Bypass -File demo\load.ps1 transit_realtime --once   # one cycle
```

Log: `demo\data\logs\transit_realtime.log` when started by `start.ps1`.

## What one cycle does

1. Downloads the three feeds. Each download becomes one row in `bronze.feed_fetch`, success or not. `bronze.feed_gap` reads those rows to find gaps.
2. Keeps each raw file, gzipped, in `demo/data/bronze/<source>/<Halifax date>/`. An identical download is not saved twice: its fetch row points at the file already kept.
3. In one transaction: trips, arrivals, positions, alerts. The fetch id is the `dw_batch_id` of every row it wrote.

Needs the schedule (D03) for routes and stops. Until it's loaded, trips and arrivals are counted as "waiting", not invented.

## Rules

| Rule | Why |
| --- | --- |
| Only stops with a time at or before the fetch are stored as arrivals | Future times are predictions that change every fetch; a passed stop is what happened |
| An arrival is updated while it stays in the feed | The last value is the closest to the real arrival |
| Service day = GTFS `start_date`, or the Halifax date 3 hours earlier when missing | A trip seen at 01:30 belongs to the previous day's service |
| An alert end in year 3000 is stored as no end | Halifax uses it for "until further notice" |
| An alert that leaves the feed is set to `Ended`, with its end time | Keeps the record instead of deleting it |
| `trip.scheduled_trip_id` is left empty | `ak1_trip` makes it unique across all days, but a scheduled trip runs every day (question for the architect). The link is the key `<trip_id>|<date>` |

## Source to target mapping

### SRC-001 vehicle positions → `silver.vehicle_position` (plus `asset`, `vehicle` for new buses)

| Source field | Silver table.column | Note |
| --- | --- | --- |
| vehicle.vehicle.id | asset.source_asset_key (type Vehicle, SRC-001) → vehicle_position.vehicle_asset_id | |
| vehicle.vehicle.label | vehicle.vehicle_label; asset.asset_name = "Bus <label>" | |
| vehicle.timestamp | vehicle_position.position_ts | Fetch time if missing |
| vehicle.trip.trip_id + start_date | vehicle_position.trip_event_id | Through event.source_event_key `<trip_id>|<date>` |
| vehicle.position.latitude / longitude | position_latitude / position_longitude | 6 decimals; position_geom is computed |
| vehicle.position.bearing | bearing_degrees | |
| vehicle.position.speed | speed_metres_per_second | |
| vehicle.current_stop_sequence | current_stop_sequence_number | |
| vehicle.current_status | vehicle_stop_status_code | GTFS-RT enum name, e.g. IN_TRANSIT_TO |
| vehicle.occupancy_status | occupancy_status_code | Enum name; about 40% of buses send it |
| (constant) | source_id = SRC-001 | |

### SRC-002 trip updates → `silver.event` (type Trip), `silver.trip`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| trip.trip_id + trip.start_date | event.source_event_key `<trip_id>|<date>`; event.event_date | |
| trip.route_id | trip.route_asset_id | Route asset from D03 (SRC-004) |
| trip.schedule_relationship | trip.trip_schedule_status_code; event.event_status_code | SCHEDULED → Scheduled; ADDED, NEW, REPLACEMENT, DUPLICATED → Added; CANCELED, DELETED → Cancelled |
| earliest / latest stop time in the update | event.event_start_ts / event.event_end_ts | Start keeps its earliest value |
| vehicle.id | trip.vehicle_asset_id | |
| (constant) | event.subsector_id = TRN-01, event.source_id = SRC-002 | |

### SRC-002 stop time updates (passed stops) → `silver.event` (type Stop Arrival), `silver.stop_arrival`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| trip key + stop_sequence | event.source_event_key `<trip_id>|<date>|<seq>`; stop_arrival.stop_sequence_number | |
| arrival.time (else departure.time) | event.event_start_ts (the arrival); event.event_date (Halifax) | |
| departure.time | stop_arrival.actual_departure_ts; event.event_end_ts | |
| arrival.delay (else departure.delay, else time − scheduled_time) | stop_arrival.reported_delay_seconds | Negative = early |
| stop_id | stop_arrival.stop_asset_id | Stop asset from D03 |
| (constant) | arrival_observation_method_code = Reported; event_status_code = Arrived | |

### SRC-003 alerts → `silver.event` (type Service Alert), `silver.service_alert`, `silver.event_asset_involvement`

| Source field | Silver table.column | Note |
| --- | --- | --- |
| entity.id | event.source_event_key | |
| active_period.start (earliest) / end (latest) | event.event_start_ts / event_end_ts | Year 3000 → empty |
| cause / effect | service_alert.alert_cause_code / alert_effect_code | Enum names, e.g. CONSTRUCTION |
| header_text (English) | alert_header_text | Cut to 500 characters |
| description_text (English) | alert_description_text | |
| url | alert_url | Only if it starts with http(s) |
| informed_entity.route_id / stop_id | event_asset_involvement (role Affected route / Affected stop) | Only routes and stops in D03 |
| present in the feed / gone | event.event_status_code Active / Ended | |
