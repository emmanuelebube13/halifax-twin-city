-- A few rows for the API tests, in the scratch database only (never halifax_twin).
-- Times are relative to now() so live windows always hold the right rows.
-- Fixed ids from 900001 keep the tests readable and stay clear of identity sequences.
-- Run empty.sql first.
BEGIN;

-- The building permit source is added by the sector loaders; the test database needs it now.
INSERT INTO silver.source (source_id, publisher_party_id, dataset_name, source_format_code, access_method_code,
                           cadence_code, availability_code, licence_name, attribution_required_flag,
                           record_grain_description, source_url, reliability_tier_code, source_status_code)
VALUES ('SRC-066', 2, 'PPL&C Issued Building Permits; Permits Geolocated; Construction Permits', 'ArcGIS REST API',
        'API', 'Daily', 'Open', 'Open Government Licence – Halifax', true, 'One building permit',
        'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services', 'Tier 1', 'Verified')
ON CONFLICT (source_id) DO NOTHING;

-- Locations: one route line, three stops, one closure line, two permit points.
INSERT INTO silver.location (location_id, location_type_code, location_name, geometry_type_code, location_geometry,
                             source_id, source_location_key) VALUES
 (900001, 'Line', 'Route 1 line', 'Line', ST_GeomFromText('LINESTRING(-63.5752 44.6493,-63.5788 44.6431,-63.5850 44.6402)', 4326), 'SRC-004', 'shape-1'),
 (900002, 'Point', 'Scotia Square', 'Point', ST_GeomFromText('POINT(-63.5752 44.6493)', 4326), 'SRC-004', 'stop-A'),
 (900003, 'Point', 'Spring Garden', 'Point', ST_GeomFromText('POINT(-63.5788 44.6431)', 4326), 'SRC-004', 'stop-B'),
 (900004, 'Point', 'Mumford', 'Point', ST_GeomFromText('POINT(-63.6200 44.6400)', 4326), 'SRC-004', 'stop-C'),
 (900005, 'Line', 'Cogswell St from Barrington St to Brunswick St', 'Line', ST_GeomFromText('LINESTRING(-63.5801 44.6512,-63.5779 44.6519)', 4326), 'SRC-015', 'closure-1'),
 (900006, 'Point', '3700 Kempt Rd', 'Point', ST_GeomFromText('POINT(-63.6125 44.6702)', 4326), 'SRC-066', 'permit-1'),
 (900007, 'Point', '10 Old Rd', 'Point', ST_GeomFromText('POINT(-63.6000 44.6600)', 4326), 'SRC-066', 'permit-2'),
 (900008, 'Line', 'Ended closure line', 'Line', ST_GeomFromText('LINESTRING(-63.59 44.65,-63.58 44.65)', 4326), 'SRC-015', 'closure-2'),
 (900009, 'Line', 'Spring Garden Rd sidewalk', 'Line', ST_GeomFromText('LINESTRING(-63.5772 44.6458,-63.5768 44.6462)', 4326), 'SRC-015', 'closure-3');

INSERT INTO silver.asset (asset_id, asset_type_code, asset_name, location_id, subsector_id, source_id,
                          source_asset_key, asset_status_code) VALUES
 (900101, 'Route', '1 Spring Garden', 900001, 'TRN-01', 'SRC-004', '1', 'Active'),
 (900201, 'Stop', 'Scotia Square', 900002, 'TRN-01', 'SRC-004', 'A', 'Active'),
 (900202, 'Stop', 'Spring Garden', 900003, 'TRN-01', 'SRC-004', 'B', 'Active'),
 (900203, 'Stop', 'Mumford', 900004, 'TRN-01', 'SRC-004', 'C', 'Active'),
 (900301, 'Vehicle', 'Bus 1105', NULL, 'TRN-01', 'SRC-001', 'v1105', 'Active'),
 (900302, 'Vehicle', 'Bus 1242', NULL, 'TRN-01', 'SRC-001', 'v1242', 'Active'),
 (900303, 'Vehicle', 'Bus 1310', NULL, 'TRN-01', 'SRC-001', 'v1310', 'Active');
INSERT INTO silver.route (asset_id, route_short_name, route_long_name, route_mode_code)
VALUES (900101, '1', 'Spring Garden', 'Bus');
INSERT INTO silver.stop (asset_id, stop_code, stop_name, stop_kind_code, wheelchair_boarding_code) VALUES
 (900201, '6120', 'Barrington St [Scotia Square]', 'Stop', 'Accessible'),
 (900202, '6121', 'Spring Garden Rd [Queen St]', 'Stop', 'Accessible'),
 (900203, '6122', 'Mumford Terminal', 'Stop', 'No information');
INSERT INTO silver.vehicle (asset_id, vehicle_label, vehicle_mode_code) VALUES
 (900301, '1105', 'Bus'), (900302, '1242', 'Bus'), (900303, '1310', 'Bus');

-- Schedule: one version covering today, one trip with three stops.
INSERT INTO silver.schedule_version (schedule_version_id, source_id, feed_version_label, feed_published_date,
                                     service_period_start_date, service_period_end_date)
VALUES (900001, 'SRC-004', 'test', current_date - 30, current_date - 30, current_date + 30);
INSERT INTO silver.service_calendar VALUES (900001, 'WK', true, true, true, true, true, true, true,
                                            current_date - 30, current_date + 30);
INSERT INTO silver.scheduled_trip (scheduled_trip_id, schedule_version_id, service_code, source_trip_key,
                                   route_asset_id, direction_code, trip_headsign)
VALUES (900001, 900001, 'WK', 'T100', 900101, '0', '1 Spring Garden to Mumford');
INSERT INTO silver.scheduled_stop_time (scheduled_trip_id, stop_sequence_number, stop_asset_id,
                                        scheduled_arrival_time, scheduled_departure_time) VALUES
 (900001, 1, 900201, '07:00', '07:00'), (900001, 2, 900202, '07:10', '07:10'), (900001, 3, 900203, '07:20', '07:20');

-- Realtime: one trip, two arrivals (one on time, one late), positions for three buses.
INSERT INTO silver.event (event_id, event_type_code, event_start_ts, event_date, subsector_id, source_id,
                          source_event_key, event_status_code) VALUES
 (900001, 'Trip', now() - interval '20 minutes', (now() AT TIME ZONE 'America/Halifax')::date, 'TRN-01', 'SRC-002',
  'T100|' || to_char((now() AT TIME ZONE 'America/Halifax')::date, 'YYYYMMDD'), 'Scheduled'),
 (900002, 'Stop Arrival', now() - interval '10 minutes', current_date, 'TRN-01', 'SRC-002', 'arr-1', 'Arrived'),
 (900003, 'Stop Arrival', now() - interval '2 minutes', current_date, 'TRN-01', 'SRC-002', 'arr-2', 'Arrived');
INSERT INTO silver.trip (event_id, route_asset_id, vehicle_asset_id, trip_schedule_status_code)
VALUES (900001, 900101, 900301, 'Scheduled');
INSERT INTO silver.stop_arrival (event_id, trip_event_id, stop_sequence_number, stop_asset_id,
                                 reported_delay_seconds, arrival_observation_method_code) VALUES
 (900002, 900001, 1, 900201, 30, 'Reported'),
 (900003, 900001, 2, 900202, 420, 'Reported');
INSERT INTO silver.vehicle_position (vehicle_asset_id, position_ts, trip_event_id, source_id, position_latitude,
                                     position_longitude, bearing_degrees, speed_metres_per_second,
                                     current_stop_sequence_number, vehicle_stop_status_code) VALUES
 (900301, date_trunc('second', now()) - interval '50 seconds', 900001, 'SRC-001', 44.6440, -63.5780, 240, 6, 3, 'IN_TRANSIT_TO'),
 (900301, date_trunc('second', now()) - interval '20 seconds', 900001, 'SRC-001', 44.6431, -63.5788, 245, 6.4, 3, 'IN_TRANSIT_TO'),
 (900302, date_trunc('second', now()) - interval '30 seconds', NULL, 'SRC-001', 44.6551, -63.6012, NULL, NULL, NULL, NULL),
 (900303, date_trunc('second', now()) - interval '10 minutes', NULL, 'SRC-001', 44.6600, -63.6100, NULL, NULL, NULL, NULL);

-- Public Works: one closure in effect, one ended.
INSERT INTO silver.event (event_id, event_type_code, event_start_ts, event_end_ts, event_date, location_id,
                          subsector_id, source_id, source_event_key, event_status_code) VALUES
 (900011, 'Road Closure', now() - interval '2 days', now() + interval '5 days', current_date - 2, 900005,
  'PWK-03', 'SRC-015', 'SC-1', 'Active'),
 (900012, 'Road Closure', now() - interval '10 days', now() - interval '1 day', current_date - 10, 900008,
  'PWK-03', 'SRC-015', 'SC-2', 'Ended'),
 (900013, 'Road Closure', now() + interval '3 days', now() + interval '10 days', current_date + 3, 900009,
  'PWK-04', 'SRC-015', 'SC-3', NULL),
 -- No end: unknown length, so never counted as in effect.
 (900014, 'Road Closure', now() - interval '1 day', NULL, current_date - 1, 900005,
  'PWK-03', 'SRC-015', 'SC-4', 'Approved');
INSERT INTO silver.road_closure (event_id, closure_type_code, closure_reason_code, detour_description) VALUES
 (900011, 'Full', 'Utility', 'Use Barrington St.'),
 (900012, 'Lane', 'Construction', NULL),
 (900013, 'Sidewalk', 'Development', NULL),
 (900014, 'Full', 'Utility', NULL);

-- Housing: one permit today (10 units), one more than a year ago.
INSERT INTO silver.event (event_id, event_type_code, event_start_ts, event_end_ts, event_date, location_id,
                          subsector_id, source_id, source_event_key, event_status_code) VALUES
 (900021, 'Building Permit', now(), NULL, (now() AT TIME ZONE 'America/Halifax')::date, 900006, 'HRE-09', 'SRC-066',
  'BP-1', 'Issued'),
 (900022, 'Building Permit', now() - interval '400 days', now() - interval '30 days',
  ((now() - interval '400 days') AT TIME ZONE 'America/Halifax')::date, 900007, 'HRE-09', 'SRC-066', 'BP-2', 'Completed');
INSERT INTO silver.building_permit (event_id, permit_type_code, work_description, construction_value_amount,
                                    units_created_count, units_removed_count) VALUES
 (900021, 'New construction', 'Six-storey residential building', 18250000.00, 10, 0),
 (900022, 'Renovation', 'Kitchen', 25000.00, NULL, NULL);

-- Fetch register: SRC-001 fresh, SRC-003 failing, SRC-004 loaded three days ago, SRC-002 stale.
INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status, error_text) VALUES
 ('SRC-001', now() - interval '10 seconds', 200, NULL),
 ('SRC-002', now() - interval '10 minutes', 200, NULL),
 ('SRC-003', now() - interval '5 minutes', 200, NULL),
 ('SRC-003', now() - interval '20 seconds', 503, 'Service unavailable'),
 ('SRC-004', now() - interval '3 days', 200, NULL);

COMMIT;
