-- =====================================================================
-- Halifax Digital Twin - physical model V1
-- 99  Smoke test
-- Builds one tiny transit story (a stop, a route, a bus, one trip, one GPS ping,
-- one arrival), proves SCD2 history works, then ROLLS BACK so nothing is kept.
-- Run it any time to check the database still works.
-- =====================================================================
\set ON_ERROR_STOP on
SET search_path = silver, public;
BEGIN;

-- 1. A stop needs a Location (point) and an Asset row, then its Stop subtype row.
INSERT INTO location (location_id, location_type_code, location_name, geometry_type_code,
                      location_geometry, centroid_latitude, centroid_longitude, source_id, source_location_key)
VALUES (900001, 'Point', 'Scotia Square (stop 1001)', 'Point',
        ST_SetSRID(ST_MakePoint(-63.5752, 44.6488), 4326), 44.6488, -63.5752, 'SRC-004', 'stop-1001');

INSERT INTO asset (asset_id, asset_type_code, asset_name, location_id, subsector_id, source_id, source_asset_key, asset_status_code)
VALUES (900001, 'Stop',    'Scotia Square',   900001, 'TRN-01', 'SRC-004', '1001', 'Active'),
       (900002, 'Route',   'Route 1 Spring Garden', NULL, 'TRN-01', 'SRC-004', '1',  'Active'),
       (900003, 'Vehicle', 'Bus 1234',        NULL, 'TRN-01', 'SRC-001', '1234',  'Active');
INSERT INTO stop    (asset_id, stop_code, stop_name, stop_kind_code) VALUES (900001, '1001', 'Scotia Square', 'Stop');
INSERT INTO route   (asset_id, route_short_name, route_long_name, route_mode_code) VALUES (900002, '1', 'Spring Garden', 'Bus');
INSERT INTO vehicle (asset_id, vehicle_label, vehicle_mode_code) VALUES (900003, '1234', 'Bus');

-- 2. The schedule: one version, one service pattern, one planned trip, one planned stop time.
INSERT INTO schedule_version (schedule_version_id, source_id, feed_published_date, service_period_start_date, service_period_end_date)
VALUES (900001, 'SRC-004', '2026-08-20', '2026-08-24', '2026-11-29');
INSERT INTO service_calendar (schedule_version_id, service_code, monday_flag, tuesday_flag, wednesday_flag,
                              thursday_flag, friday_flag, saturday_flag, sunday_flag, start_date, end_date)
VALUES (900001, 'WKDY', true, true, true, true, true, false, false, '2026-08-24', '2026-11-29');
INSERT INTO scheduled_trip (scheduled_trip_id, schedule_version_id, service_code, source_trip_key, route_asset_id, direction_code)
VALUES (900001, 900001, 'WKDY', 'trip-1-0730', 900002, '0');
INSERT INTO scheduled_stop_time (scheduled_trip_id, stop_sequence_number, stop_asset_id, scheduled_arrival_time, scheduled_departure_time)
VALUES (900001, 1, 900001, '07:30:00', '07:30:30');

-- 3. What happened on Fri 20 Nov 2026: a Trip event, a GPS ping, an arrival.
INSERT INTO event (event_id, event_type_code, event_start_ts, event_date, subsector_id, source_id, source_event_key)
VALUES (900001, 'Trip',         '2026-11-20 11:30:00+00', '2026-11-20', 'TRN-01', 'SRC-002', 'trip-1-0730|2026-11-20'),
       (900002, 'Stop Arrival', '2026-11-20 11:31:10+00', '2026-11-20', 'TRN-01', 'SRC-002', 'trip-1-0730|2026-11-20|1');
INSERT INTO trip (event_id, scheduled_trip_id, route_asset_id, vehicle_asset_id, trip_schedule_status_code)
VALUES (900001, 900001, 900002, 900003, 'Scheduled');
INSERT INTO stop_arrival (event_id, trip_event_id, stop_sequence_number, stop_asset_id, reported_delay_seconds, arrival_observation_method_code)
VALUES (900002, 900001, 1, 900001, 70, 'Reported');
INSERT INTO vehicle_position (vehicle_asset_id, position_ts, trip_event_id, source_id, position_latitude, position_longitude, speed_metres_per_second)
VALUES (900003, '2026-11-20 11:31:05+00', 900001, 'SRC-001', 44.6489, -63.5750, 0.0);

\echo '--- Check 1: the GPS ping landed in the November 2026 partition and has a geometry'
SELECT tableoid::regclass AS partition, ST_AsText(position_geom) AS point FROM vehicle_position;

\echo '--- Check 2: how late was the bus at stop 1001? (planned 07:30 Halifax time)'
SELECT st.stop_name, sa.reported_delay_seconds, e.event_start_ts AT TIME ZONE 'America/Halifax' AS arrived_local
  FROM stop_arrival sa
  JOIN event e  ON e.event_id = sa.event_id
  JOIN stop  st ON st.asset_id = sa.stop_asset_id;

\echo '--- Check 3: SCD2 - rename the stop, then look at its timeline (expect 2 rows)'
UPDATE stop SET stop_name = 'Scotia Square Terminal' WHERE asset_id = 900001;
UPDATE stop SET stop_name = 'Scotia Square Terminal' WHERE asset_id = 900001;  -- no real change: no new version
SELECT stop_name, is_current, valid_to_ts IS NOT NULL AS closed FROM stop_timeline WHERE asset_id = 900001 ORDER BY is_current;

\echo '--- Check 4: a foreign key rejects a stop arrival for a trip that does not exist'
SAVEPOINT bad_fk;
\set ON_ERROR_STOP off
INSERT INTO event (event_id, event_type_code, event_start_ts, event_date, subsector_id, source_id, source_event_key)
VALUES (900003, 'Stop Arrival', '2026-11-20 11:40:00+00', '2026-11-20', 'TRN-01', 'SRC-002', 'bad-test');
INSERT INTO stop_arrival (event_id, trip_event_id, stop_sequence_number, stop_asset_id, arrival_observation_method_code)
VALUES (900003, 123456789, 2, 900001, 'Reported');   -- expect: violates foreign key constraint
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT bad_fk;

\echo '--- Check 5: reference data is loaded'
SELECT (SELECT count(*) FROM sector) AS sectors, (SELECT count(*) FROM subsector) AS subsectors,
       (SELECT count(*) FROM source) AS sources,
       (SELECT count(*) FROM calendar_date WHERE statutory_holiday_flag) AS holidays;

ROLLBACK;
\echo '--- Smoke test finished. Everything above was rolled back.'
