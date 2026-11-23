# Source-to-target mapping

Step 10 of the data-design method. 21 Nov 2026\. Bronze to silver, release 1 sources. A second mapping, silver to gold, comes with the first star schema.

The full mapping is `sttm.csv`, one row per source field and target column: `mapping_id`, `source_id`, `source_object`, `source_field`, `transformation_rule`, `target_schema`, `target_table`, `target_column`, `rule_notes`, `loader`. It was built from the code and READMEs the loaders actually committed:

| Loader | Branch and commits | Sources |
| :---- | :---- | :---- |
| `services/collector/transit_realtime` | `t03-transit-collector` e7182ca, 35b12af (ported from demo `d08a-live-summary`) | SRC-001, SRC-002, SRC-003 |
| `services/collector/gtfs_schedule` | `t03-transit-collector` e7182ca | SRC-004 |
| `services/collector/hrm_arcgis` | `t21-sector-loaders` 7dfe357, 0f7dc34, c206a4d | SRC-015, SRC-066 |

Every source follows the same pattern: each download is one `bronze.feed_fetch` row and a raw file kept for 7 days; its `fetch_id` becomes `dw_batch_id` on every silver row written; loads are idempotent on the source key (`ak1_`). The rules in `standards.md` apply throughout; mapping rows that a data quality rule found wanting name the rule.

## SRC-001 Halifax Transit vehicle positions (GTFS-RT)

`VehiclePositions.pb` every 30 seconds to `vehicle_position`, plus one `asset` and `vehicle` row the first time a bus is seen. The trip link is the event key `<trip_id>|<service date>`; the service date is the feed's `start_date`, else the Halifax date 3 hours earlier. GTFS-RT enum names are stored as sent (open question 8).

## SRC-002 Halifax Transit trip updates (GTFS-RT)

`TripUpdates.pb` to two event types. Each trip update is an `event` (Trip) \+ `trip`; `trip.scheduled_trip_id` is left empty (open question 7). Each passed stop (time at or before the fetch) is an `event` (Stop Arrival) \+ `stop_arrival`, keyed `<trip_id>|<service date>|<stop_sequence>` and updated while it stays in the feed. Two findings from the checks:

- DQ-043: for about 1 in 5 arrivals the feed's `stop_sequence` names a different stop than the static schedule's `stop_sequence` for that trip (often one higher). The model links an arrival to its scheduled stop time by trip and stop sequence, so this link is unreliable for those trips; `stop_id` is reliable.  
- DQ-061: the upsert updates `event_start_ts` but not `event_date`, so an arrival whose time moves past midnight in a later fetch keeps the earlier date (31 rows on 21 Nov 2026). One-line fix in `store.py` for workstream B: add `event_date = EXCLUDED.event_date`.

## SRC-003 Halifax Transit service alerts (GTFS-RT)

`Alerts.pb` to `event` (Service Alert) \+ `service_alert`, with affected routes and stops in `event_asset_involvement`. An alert that leaves the feed is set to Ended; a year-3000 end is stored as no end.

## SRC-004 Halifax Transit GTFS schedule

`google_transit.zip`: one `schedule_version` per file, kept for ever; `service_calendar` and exceptions; routes and stops as `location` \+ `asset` \+ `route` or `stop`; `scheduled_trip` and `scheduled_stop_time` (by COPY). Routes and stops missing from a new file are set to `Inactive`, which is not in the model's list for Asset Status Code (Active, Planned, Retired): DQ-025 will fail the first time that happens.

## SRC-015 HRM street and sidewalk closures (ArcGIS REST)

Two layers, `Street_Closures/0` (history back to April 2018\) and `Development_Street_Closures/0`, to `location` (Line) \+ `event` (Road Closure) \+ `road_closure`. The street layer has no extent field, so every street closure is `Full` (question for the architect). `RDMID` is the street segment id for `event_coverage` once street segments are loaded; until then DQ-044 (Road Closure on a Street Segment) warns on every row. `COMMENTS` is not downloaded, because it can hold contact details. DQ-060: one closure still ends before it starts after the loader's time repair.

## SRC-066 HRM building permits (ArcGIS REST)

`PPLC_Permits_Geolocated/0` to `location` (Point) \+ `event` (Building Permit) \+ `building_permit`. Only issued permits load (the model's definition). The permit point is not linked to a parcel, so DQ-044 (Building Permit on a Parcel) warns on every row until parcels are loaded. SRC-066 is the Source Inventory id; workstream C added it to the reference rows in script 08 (commit 7dfe357), since the original 17 stop at SRC-017.

## Not yet mapped

All six sources in release 1 are mapped. The inventory's other sources (SRC-005 to SRC-014, SRC-016, SRC-017 and the rest of the 77\) have no loader yet, so they have no mapping.