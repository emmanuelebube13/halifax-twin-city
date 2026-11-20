"""Writes database/sql/00, 08, 99 and run_all.sql (reference data and smoke test)."""
import datetime
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'sql')

def q(v):
    if v is None or v == "":
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

SECTORS = [
    ("S01", "Finance", "Banking, lending, insurance and fintech.", 3),
    ("S02", "Hospitality", "Lodging, food services, tourism and event management.", 3),
    ("S03", "Healthcare", "Medical care, hospitals, clinics and health services.", 3),
    ("S04", "Transportation", "Public transit, freight, logistics, road, rail and aviation.", 1),
    ("S05", "Public Works", "Public infrastructure, municipal maintenance, water supply and civil works.", 1),
    ("S06", "Education", "Primary, secondary and higher education, vocational training and research.", 2),
    ("S07", "Digital", "Information technology, software, telecommunications and digital infrastructure.", 3),
    ("S08", "Construction", "Building, structural development, contracting and civil engineering.", 2),
    ("S09", "Housing & Real Estate", "Residential and commercial property, leasing and housing development.", 1),
    ("S10", "Public Safety and Emergency", "Law enforcement, fire rescue, emergency medical services and disaster response.", 2),
    ("S11", "Energy and Utility", "Power generation, electric grid, renewable energy and utility systems.", 3),
    ("S12", "Environment", "Conservation, environmental protection and sustainability.", 2),
    ("S13", "Port & Maritime", "Harbour operations, shipping, port logistics and cargo handling.", 3),
    ("S14", "Population & Community", "Community development, demographic services and social welfare.", 2),
    ("S15", "Arts, Culture & Recreation", "Museums, performing arts, parks, sports, heritage and recreation.", 3),
    ("S16", "Retail", "Wholesale and retail trade, consumer merchandise and e-commerce.", 3),
    ("S17", "Public Governance & Civic Services", "Public administration, policymaking, municipal governance and civil services.", 2),
]
SUBSECTORS = [
    ("CORE-00", "S04", "Core / Shared (data every sector uses)"),
    ("TRN-01", "S04", "Passenger Transportation (Bus / Transit System)"), ("TRN-02", "S04", "Rail"),
    ("TRN-03", "S04", "Freight & Goods Movement"), ("TRN-04", "S04", "Taxi & Ride-Hailing"),
    ("TRN-05", "S04", "Truck Transport"), ("TRN-06", "S04", "Warehousing"),
    ("TRN-07", "S04", "Airport & Aviation"), ("TRN-08", "S04", "Active Transportation (Cycling / Walking)"),
    ("TRN-09", "S04", "Roads & Traffic Management"), ("TRN-10", "S04", "Parking"),
    ("PWK-01", "S05", "Waste Centres & Solid Waste"), ("PWK-02", "S05", "Parks"),
    ("PWK-03", "S05", "Public Utilities"), ("PWK-04", "S05", "Engineering & Construction"),
    ("PWK-05", "S05", "Water & Wastewater"), ("PWK-06", "S05", "Roads & Sidewalk Maintenance"),
    ("PWK-07", "S05", "Snow & Ice Removal"), ("PWK-08", "S05", "Street Lighting"),
    ("PWK-09", "S05", "Municipal Fleet"),
    ("HRE-01", "S09", "Home Ownership"), ("HRE-02", "S09", "Rental Housing"),
    ("HRE-03", "S09", "Affordable & Social Housing"), ("HRE-04", "S09", "Student Housing"),
    ("HRE-05", "S09", "Commercial Real Estate (Office)"), ("HRE-06", "S09", "Industrial Real Estate"),
    ("HRE-07", "S09", "Property Management"), ("HRE-08", "S09", "Real Estate Brokerage"),
    ("HRE-09", "S09", "Land Development"),
]
HT, HRM = 1, 2
LIC = "Open Government Licence – Halifax"
ARC = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/"
# (id, publisher, dataset, format, access, cadence, grain, url, status)
SOURCES = [
    ("SRC-001", HT, "GTFS Realtime – Vehicle Positions", "GTFS-RT", "Live feed", "Real-time", "One vehicle position at one moment", "http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb", "Verified"),
    ("SRC-002", HT, "GTFS Realtime – Trip Updates", "GTFS-RT", "Live feed", "Real-time", "One predicted arrival or departure for a trip at a stop", "https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1605", "Not checked"),
    ("SRC-003", HT, "GTFS Realtime – Service Alerts", "GTFS-RT", "Live feed", "Real-time", "One service alert (detour, stop closure, route change)", "http://gtfs.halifax.ca/realtime/Alert/Alerts.pb", "Verified"),
    ("SRC-004", HT, "GTFS Schedule (static) feed", "GTFS", "File download", "Quarterly", "One scheduled stop time; also routes, trips, stops, shapes, calendar", "http://gtfs.halifax.ca/static/google_transit.zip", "Verified"),
    ("SRC-005", HRM, "Transit Bus Routes; Bus Stops; Transit Shelters", "ArcGIS REST API", "API", None, "One route line; one bus stop; one shelter", ARC + "Bus_Stops_2/FeatureServer", "Verified"),
    ("SRC-006", HRM, "Ferry Routes", "ArcGIS REST API", "API", None, "One ferry route line", ARC + "Ferry_Routes/FeatureServer", "Verified"),
    ("SRC-007", HRM, "Transit Automated Passenger Counts", "ArcGIS REST API", "API", None, "Boardings on one bus route in one half-hour", ARC + "Transit_Automated_Passenger_Counts/FeatureServer", "Verified"),
    ("SRC-008", HRM, "Transit Passenger Overload Incidents", "ArcGIS REST API", "API", None, "One reported overload on a bus or ferry trip", ARC + "Transit_Passenger_Overload_Incidents/FeatureServer", "Verified"),
    ("SRC-009", HRM, "Transit Ferry Passenger Counts", "ArcGIS REST API", "API", None, "Ferry passenger count for a route and period (confirm)", ARC + "Transit_Ferry_Passenger_Counts/FeatureServer", "Verified"),
    ("SRC-010", HRM, "Transit Bus Snow Routes", "ArcGIS REST API", "API", None, "One bus route's snow-plan alignment", ARC + "Transit_Bus_Snow_Routes/FeatureServer", "Verified"),
    ("SRC-011", HRM, "Park and Ride lots", "ArcGIS REST API", "API", None, "One park-and-ride lot", ARC + "Park_and_Ride_Points/FeatureServer", "Verified"),
    ("SRC-012", HRM, "Traffic Collisions", "ArcGIS REST API", "API", None, "One reported collision", ARC + "Traffic_Collisions/FeatureServer", "Verified"),
    ("SRC-013", HRM, "HRM Traffic Studies", "ArcGIS REST API", "API", "Irregular", "One traffic study at one location", ARC + "HRM_Traffic_Studies/FeatureServer", "Verified"),
    ("SRC-014", HRM, "Mobility Counters; Bicycle Counts", "ArcGIS REST API", "API", None, "One counter site; one count for a site and period", ARC + "Bicycle_Counts/FeatureServer", "Verified"),
    ("SRC-015", HRM, "Street Closures and Development Street Closures", "ArcGIS REST API", "API", None, "One street closure", ARC + "Street_Closures/FeatureServer", "Verified"),
    ("SRC-016", HRM, "Bike Infrastructure; Active Travelways; Bike Amenities", "ArcGIS REST API", "API", None, "One bikeway or travelway segment", ARC + "Bike_Infrastructure_and_Suggested_Routes/FeatureServer", "Verified"),
    ("SRC-017", HRM, "Truck Routes", "ArcGIS REST API", "API", None, "One designated truck route segment", ARC + "Truck_Routes/FeatureServer", "Verified"),
]

def easter(y):
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3; h = (19 * a + b - d - g + 15) % 30
    i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return datetime.date(y, month, day)

def nth_weekday(y, mth, wd, n):
    d = datetime.date(y, mth, 1)
    d += datetime.timedelta(days=(wd - d.weekday()) % 7)
    return d + datetime.timedelta(weeks=n - 1)

HOL = []
for y in range(2015, 2036):
    HOL += [(datetime.date(y, 1, 1), "New Year's Day"),
            (nth_weekday(y, 2, 0, 3), "Heritage Day"),
            (easter(y) - datetime.timedelta(days=2), "Good Friday"),
            (datetime.date(y, 7, 1), "Canada Day"),
            (nth_weekday(y, 9, 0, 1), "Labour Day"),
            (datetime.date(y, 12, 25), "Christmas Day")]

s = """-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 08  Reference data
-- Sectors, Phase 1 subsectors, the two publishing organizations, the 17
-- verified sources from Source Inventory V1, and a calendar 2015-2035.
-- Safe to re-run: every insert skips rows that already exist.
-- =====================================================================

SET search_path = silver, public;

-- Sectors (Domain Mapping sheet). Phase 1 = built now, 2 = next candidates, 3 = later.
INSERT INTO silver.sector (sector_id, sector_name, sector_description, phase_number) VALUES
"""
s += ",\n".join(f"    ({q(a)}, {q(b)}, {q(c)}, {d})" for a, b, c, d in SECTORS)
s += "\nON CONFLICT (sector_id) DO NOTHING;\n\n"
s += "-- Phase 1 subsectors, plus CORE-00 for data every sector shares (weather, census).\n"
s += "-- CORE-00 is filed under Transportation for now; see the open question in the logical model.\n"
s += "INSERT INTO silver.subsector (subsector_id, sector_id, subsector_name) VALUES\n"
s += ",\n".join(f"    ({q(a)}, {q(b)}, {q(c)})" for a, b, c in SUBSECTORS)
s += "\nON CONFLICT (subsector_id) DO NOTHING;\n\n"
s += """-- Publishers. Explicit IDs keep the seed predictable; the sequence is moved past them.
INSERT INTO silver.party (party_id, party_type_code, party_name) VALUES
    (1, 'Organization', 'Halifax Transit'),
    (2, 'Organization', 'Halifax Regional Municipality')
ON CONFLICT (party_id) DO NOTHING;
INSERT INTO silver.organization (party_id, organization_type_code, legal_name, website_url) VALUES
    (1, 'Transit agency', 'Halifax Transit', 'https://www.halifax.ca/transportation/halifax-transit'),
    (2, 'Municipal government', 'Halifax Regional Municipality', 'https://www.halifax.ca')
ON CONFLICT (party_id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('silver.party', 'party_id'), GREATEST(2, (SELECT max(party_id) FROM silver.party)));

-- Sources (Source Inventory V1, checked 2026-11-12).
INSERT INTO silver.source (source_id, publisher_party_id, dataset_name, source_format_code, access_method_code,
                           cadence_code, availability_code, licence_name, attribution_required_flag,
                           record_grain_description, source_url, reliability_tier_code, source_status_code,
                           last_checked_date) VALUES
"""
s += ",\n".join(f"    ({q(i)}, {p}, {q(ds)}, {q(fm)}, {q(ac)}, {q(cd)}, 'Open', {q(LIC)}, true, {q(gr)}, {q(u)}, 'Tier 1', {q(st)}, '2026-11-12')"
                for i, p, ds, fm, ac, cd, gr, u, st in SOURCES)
s += "\nON CONFLICT (source_id) DO NOTHING;\n\n"
s += """-- Calendar: one row per day, 2015-01-01 to 2035-12-31. Seasons are meteorological.
INSERT INTO silver.calendar_date (calendar_date, calendar_year, quarter_number, month_number,
                                  week_of_year_number, day_of_week_name, weekend_flag,
                                  statutory_holiday_flag, holiday_name, season_name)
SELECT d::date,
       extract(year FROM d)::smallint,
       extract(quarter FROM d)::int,
       extract(month FROM d)::int,
       extract(week FROM d)::int,
       trim(to_char(d, 'Day')),
       extract(isodow FROM d) IN (6, 7),
       false,
       NULL,
       CASE WHEN extract(month FROM d) IN (12, 1, 2) THEN 'Winter'
            WHEN extract(month FROM d) IN (3, 4, 5)  THEN 'Spring'
            WHEN extract(month FROM d) IN (6, 7, 8)  THEN 'Summer'
            ELSE 'Fall' END
  FROM generate_series(date '2015-01-01', date '2035-12-31', interval '1 day') AS d
ON CONFLICT (calendar_date) DO NOTHING;

-- Nova Scotia general holidays (Labour Standards Code): New Year's Day, Heritage Day,
-- Good Friday, Canada Day, Labour Day, Christmas Day. Check the list against the
-- current Code before relying on it; Remembrance Day falls under a separate act.
UPDATE silver.calendar_date c
   SET statutory_holiday_flag = true, holiday_name = h.holiday_name
  FROM (VALUES
"""
s += ",\n".join(f"    (date '{d}', {q(n)})" for d, n in HOL)
s += "\n  ) AS h (holiday_date, holiday_name)\n WHERE c.calendar_date = h.holiday_date\n   AND c.statutory_holiday_flag IS DISTINCT FROM true;\n"
open(f"{OUT}/08_reference_data.sql", "w", encoding="utf-8", newline="\n").write(s)

# ---------------- smoke test ----------------
t = """-- =====================================================================
-- Halifax Digital Twin - physical model V1
-- 99  Smoke test
-- Builds one tiny transit story (a stop, a route, a bus, one trip, one GPS ping,
-- one arrival), proves SCD2 history works, then ROLLS BACK so nothing is kept.
-- Run it any time to check the database still works.
-- =====================================================================
\\set ON_ERROR_STOP on
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

\\echo '--- Check 1: the GPS ping landed in the November 2026 partition and has a geometry'
SELECT tableoid::regclass AS partition, ST_AsText(position_geom) AS point FROM vehicle_position;

\\echo '--- Check 2: how late was the bus at stop 1001? (planned 07:30 Halifax time)'
SELECT st.stop_name, sa.reported_delay_seconds, e.event_start_ts AT TIME ZONE 'America/Halifax' AS arrived_local
  FROM stop_arrival sa
  JOIN event e  ON e.event_id = sa.event_id
  JOIN stop  st ON st.asset_id = sa.stop_asset_id;

\\echo '--- Check 3: SCD2 - rename the stop, then look at its timeline (expect 2 rows)'
UPDATE stop SET stop_name = 'Scotia Square Terminal' WHERE asset_id = 900001;
UPDATE stop SET stop_name = 'Scotia Square Terminal' WHERE asset_id = 900001;  -- no real change: no new version
SELECT stop_name, is_current, valid_to_ts IS NOT NULL AS closed FROM stop_timeline WHERE asset_id = 900001 ORDER BY is_current;

\\echo '--- Check 4: a foreign key rejects a stop arrival for a trip that does not exist'
SAVEPOINT bad_fk;
\\set ON_ERROR_STOP off
INSERT INTO event (event_id, event_type_code, event_start_ts, event_date, subsector_id, source_id, source_event_key)
VALUES (900003, 'Stop Arrival', '2026-11-20 11:40:00+00', '2026-11-20', 'TRN-01', 'SRC-002', 'bad-test');
INSERT INTO stop_arrival (event_id, trip_event_id, stop_sequence_number, stop_asset_id, arrival_observation_method_code)
VALUES (900003, 123456789, 2, 900001, 'Reported');   -- expect: violates foreign key constraint
\\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT bad_fk;

\\echo '--- Check 5: reference data is loaded'
SELECT (SELECT count(*) FROM sector) AS sectors, (SELECT count(*) FROM subsector) AS subsectors,
       (SELECT count(*) FROM source) AS sources,
       (SELECT count(*) FROM calendar_date WHERE statutory_holiday_flag) AS holidays;

ROLLBACK;
\\echo '--- Smoke test finished. Everything above was rolled back.'
"""
open(f"{OUT}/99_smoke_test.sql", "w", encoding="utf-8", newline="\n").write(t)

run = """-- =====================================================================
-- Halifax Digital Twin - run every build script in order.
-- Usage (from the sql folder), after creating the database with 00:
--   psql -U postgres -d halifax_twin -f run_all.sql
-- =====================================================================
\\set ON_ERROR_STOP on
\\echo 'Building the Halifax Digital Twin database...'
\\ir 01_extensions_and_schemas.sql
\\ir 02_silver_tables.sql
\\ir 03_foreign_keys_and_indexes.sql
\\ir 04_scd2_history.sql
\\ir 05_vehicle_position_partitions.sql
\\ir 06_bronze_register.sql
\\ir 07_comments.sql
\\ir 08_reference_data.sql
\\echo 'Done. Next: run 99_smoke_test.sql to check it works.'
"""
open(f"{OUT}/run_all.sql", "w", encoding="utf-8", newline="\n").write(run)

zero = """-- =====================================================================
-- Halifax Digital Twin - 00  Create the database
-- Run once, connected as the postgres superuser to the default database:
--   psql -U postgres -f 00_create_database.sql
-- =====================================================================
CREATE DATABASE halifax_twin
    ENCODING 'UTF8'
    TEMPLATE template0;
COMMENT ON DATABASE halifax_twin IS 'Halifax Digital Twin - local development database (Phase 1 physical model V1).';
"""
open(f"{OUT}/00_create_database.sql", "w", encoding="utf-8", newline="\n").write(zero)
print("holidays", len(HOL))
