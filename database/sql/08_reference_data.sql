-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 08  Reference data
-- Sectors, Phase 1 subsectors, the two publishing organizations, the verified
-- sources from Source Inventory V1 that loaders use, and a calendar 2015-2035.
-- Safe to re-run: every insert skips rows that already exist.
-- =====================================================================

SET search_path = silver, public;

-- Sectors (Domain Mapping sheet). Phase 1 = built now, 2 = next candidates, 3 = later.
INSERT INTO silver.sector (sector_id, sector_name, sector_description, phase_number) VALUES
    ('S01', 'Finance', 'Banking, lending, insurance and fintech.', 3),
    ('S02', 'Hospitality', 'Lodging, food services, tourism and event management.', 3),
    ('S03', 'Healthcare', 'Medical care, hospitals, clinics and health services.', 3),
    ('S04', 'Transportation', 'Public transit, freight, logistics, road, rail and aviation.', 1),
    ('S05', 'Public Works', 'Public infrastructure, municipal maintenance, water supply and civil works.', 1),
    ('S06', 'Education', 'Primary, secondary and higher education, vocational training and research.', 2),
    ('S07', 'Digital', 'Information technology, software, telecommunications and digital infrastructure.', 3),
    ('S08', 'Construction', 'Building, structural development, contracting and civil engineering.', 2),
    ('S09', 'Housing & Real Estate', 'Residential and commercial property, leasing and housing development.', 1),
    ('S10', 'Public Safety and Emergency', 'Law enforcement, fire rescue, emergency medical services and disaster response.', 2),
    ('S11', 'Energy and Utility', 'Power generation, electric grid, renewable energy and utility systems.', 3),
    ('S12', 'Environment', 'Conservation, environmental protection and sustainability.', 2),
    ('S13', 'Port & Maritime', 'Harbour operations, shipping, port logistics and cargo handling.', 3),
    ('S14', 'Population & Community', 'Community development, demographic services and social welfare.', 2),
    ('S15', 'Arts, Culture & Recreation', 'Museums, performing arts, parks, sports, heritage and recreation.', 3),
    ('S16', 'Retail', 'Wholesale and retail trade, consumer merchandise and e-commerce.', 3),
    ('S17', 'Public Governance & Civic Services', 'Public administration, policymaking, municipal governance and civil services.', 2)
ON CONFLICT (sector_id) DO NOTHING;

-- Phase 1 subsectors, plus CORE-00 for data every sector shares (weather, census).
-- CORE-00 is filed under Transportation for now; see the open question in the logical model.
INSERT INTO silver.subsector (subsector_id, sector_id, subsector_name) VALUES
    ('CORE-00', 'S04', 'Core / Shared (data every sector uses)'),
    ('TRN-01', 'S04', 'Passenger Transportation (Bus / Transit System)'),
    ('TRN-02', 'S04', 'Rail'),
    ('TRN-03', 'S04', 'Freight & Goods Movement'),
    ('TRN-04', 'S04', 'Taxi & Ride-Hailing'),
    ('TRN-05', 'S04', 'Truck Transport'),
    ('TRN-06', 'S04', 'Warehousing'),
    ('TRN-07', 'S04', 'Airport & Aviation'),
    ('TRN-08', 'S04', 'Active Transportation (Cycling / Walking)'),
    ('TRN-09', 'S04', 'Roads & Traffic Management'),
    ('TRN-10', 'S04', 'Parking'),
    ('PWK-01', 'S05', 'Waste Centres & Solid Waste'),
    ('PWK-02', 'S05', 'Parks'),
    ('PWK-03', 'S05', 'Public Utilities'),
    ('PWK-04', 'S05', 'Engineering & Construction'),
    ('PWK-05', 'S05', 'Water & Wastewater'),
    ('PWK-06', 'S05', 'Roads & Sidewalk Maintenance'),
    ('PWK-07', 'S05', 'Snow & Ice Removal'),
    ('PWK-08', 'S05', 'Street Lighting'),
    ('PWK-09', 'S05', 'Municipal Fleet'),
    ('HRE-01', 'S09', 'Home Ownership'),
    ('HRE-02', 'S09', 'Rental Housing'),
    ('HRE-03', 'S09', 'Affordable & Social Housing'),
    ('HRE-04', 'S09', 'Student Housing'),
    ('HRE-05', 'S09', 'Commercial Real Estate (Office)'),
    ('HRE-06', 'S09', 'Industrial Real Estate'),
    ('HRE-07', 'S09', 'Property Management'),
    ('HRE-08', 'S09', 'Real Estate Brokerage'),
    ('HRE-09', 'S09', 'Land Development')
ON CONFLICT (subsector_id) DO NOTHING;

-- Publishers. Explicit IDs keep the seed predictable; the sequence is moved past them.
INSERT INTO silver.party (party_id, party_type_code, party_name) VALUES
    (1, 'Organization', 'Halifax Transit'),
    (2, 'Organization', 'Halifax Regional Municipality')
ON CONFLICT (party_id) DO NOTHING;
INSERT INTO silver.organization (party_id, organization_type_code, legal_name, website_url) VALUES
    (1, 'Transit agency', 'Halifax Transit', 'https://www.halifax.ca/transportation/halifax-transit'),
    (2, 'Municipal government', 'Halifax Regional Municipality', 'https://www.halifax.ca')
ON CONFLICT (party_id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('silver.party', 'party_id'), GREATEST(2, (SELECT max(party_id) FROM silver.party)));

-- Sources (Source Inventory V1, checked 2026-11-12 unless the row says otherwise).
INSERT INTO silver.source (source_id, publisher_party_id, dataset_name, source_format_code, access_method_code,
                           cadence_code, availability_code, licence_name, attribution_required_flag,
                           record_grain_description, source_url, reliability_tier_code, source_status_code,
                           last_checked_date) VALUES
    ('SRC-001', 1, 'GTFS Realtime – Vehicle Positions', 'GTFS-RT', 'Live feed', 'Real-time', 'Open', 'Open Government Licence – Halifax', true, 'One vehicle position at one moment', 'http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-002', 1, 'GTFS Realtime – Trip Updates', 'GTFS-RT', 'Live feed', 'Real-time', 'Open', 'Open Government Licence – Halifax', true, 'One predicted arrival or departure for a trip at a stop', 'https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1605', 'Tier 1', 'Not checked', '2026-11-12'),
    ('SRC-003', 1, 'GTFS Realtime – Service Alerts', 'GTFS-RT', 'Live feed', 'Real-time', 'Open', 'Open Government Licence – Halifax', true, 'One service alert (detour, stop closure, route change)', 'http://gtfs.halifax.ca/realtime/Alert/Alerts.pb', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-004', 1, 'GTFS Schedule (static) feed', 'GTFS', 'File download', 'Quarterly', 'Open', 'Open Government Licence – Halifax', true, 'One scheduled stop time; also routes, trips, stops, shapes, calendar', 'http://gtfs.halifax.ca/static/google_transit.zip', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-005', 2, 'Transit Bus Routes; Bus Stops; Transit Shelters', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One route line; one bus stop; one shelter', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Bus_Stops_2/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-006', 2, 'Ferry Routes', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One ferry route line', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Ferry_Routes/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-007', 2, 'Transit Automated Passenger Counts', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'Boardings on one bus route in one half-hour', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Transit_Automated_Passenger_Counts/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-008', 2, 'Transit Passenger Overload Incidents', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One reported overload on a bus or ferry trip', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Transit_Passenger_Overload_Incidents/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-009', 2, 'Transit Ferry Passenger Counts', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'Ferry passenger count for a route and period (confirm)', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Transit_Ferry_Passenger_Counts/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-010', 2, 'Transit Bus Snow Routes', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One bus route''s snow-plan alignment', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Transit_Bus_Snow_Routes/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-011', 2, 'Park and Ride lots', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One park-and-ride lot', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Park_and_Ride_Points/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-012', 2, 'Traffic Collisions', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One reported collision', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Traffic_Collisions/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-013', 2, 'HRM Traffic Studies', 'ArcGIS REST API', 'API', 'Irregular', 'Open', 'Open Government Licence – Halifax', true, 'One traffic study at one location', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/HRM_Traffic_Studies/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-014', 2, 'Mobility Counters; Bicycle Counts', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One counter site; one count for a site and period', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Bicycle_Counts/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-015', 2, 'Street Closures and Development Street Closures', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One street closure', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Street_Closures/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-016', 2, 'Bike Infrastructure; Active Travelways; Bike Amenities', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One bikeway or travelway segment', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Bike_Infrastructure_and_Suggested_Routes/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-017', 2, 'Truck Routes', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One designated truck route segment', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/Truck_Routes/FeatureServer', 'Tier 1', 'Verified', '2026-11-12'),
    ('SRC-066', 2, 'PPL&C Issued Building Permits; Permits Geolocated; Construction Permits', 'ArcGIS REST API', 'API', NULL, 'Open', 'Open Government Licence – Halifax', true, 'One building permit', 'https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/PPLC_Permits_Geolocated/FeatureServer', 'Tier 1', 'Verified', '2026-11-21')
ON CONFLICT (source_id) DO NOTHING;

-- Calendar: one row per day, 2015-01-01 to 2035-12-31. Seasons are meteorological.
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
    (date '2015-01-01', 'New Year''s Day'),
    (date '2015-02-16', 'Heritage Day'),
    (date '2015-04-03', 'Good Friday'),
    (date '2015-07-01', 'Canada Day'),
    (date '2015-09-07', 'Labour Day'),
    (date '2015-12-25', 'Christmas Day'),
    (date '2016-01-01', 'New Year''s Day'),
    (date '2016-02-15', 'Heritage Day'),
    (date '2016-03-25', 'Good Friday'),
    (date '2016-07-01', 'Canada Day'),
    (date '2016-09-05', 'Labour Day'),
    (date '2016-12-25', 'Christmas Day'),
    (date '2017-01-01', 'New Year''s Day'),
    (date '2017-02-20', 'Heritage Day'),
    (date '2017-04-14', 'Good Friday'),
    (date '2017-07-01', 'Canada Day'),
    (date '2017-09-04', 'Labour Day'),
    (date '2017-12-25', 'Christmas Day'),
    (date '2018-01-01', 'New Year''s Day'),
    (date '2018-02-19', 'Heritage Day'),
    (date '2018-03-30', 'Good Friday'),
    (date '2018-07-01', 'Canada Day'),
    (date '2018-09-03', 'Labour Day'),
    (date '2018-12-25', 'Christmas Day'),
    (date '2019-01-01', 'New Year''s Day'),
    (date '2019-02-18', 'Heritage Day'),
    (date '2019-04-19', 'Good Friday'),
    (date '2019-07-01', 'Canada Day'),
    (date '2019-09-02', 'Labour Day'),
    (date '2019-12-25', 'Christmas Day'),
    (date '2020-01-01', 'New Year''s Day'),
    (date '2020-02-17', 'Heritage Day'),
    (date '2020-04-10', 'Good Friday'),
    (date '2020-07-01', 'Canada Day'),
    (date '2020-09-07', 'Labour Day'),
    (date '2020-12-25', 'Christmas Day'),
    (date '2021-01-01', 'New Year''s Day'),
    (date '2021-02-15', 'Heritage Day'),
    (date '2021-04-02', 'Good Friday'),
    (date '2021-07-01', 'Canada Day'),
    (date '2021-09-06', 'Labour Day'),
    (date '2021-12-25', 'Christmas Day'),
    (date '2022-01-01', 'New Year''s Day'),
    (date '2022-02-21', 'Heritage Day'),
    (date '2022-04-15', 'Good Friday'),
    (date '2022-07-01', 'Canada Day'),
    (date '2022-09-05', 'Labour Day'),
    (date '2022-12-25', 'Christmas Day'),
    (date '2023-01-01', 'New Year''s Day'),
    (date '2023-02-20', 'Heritage Day'),
    (date '2023-04-07', 'Good Friday'),
    (date '2023-07-01', 'Canada Day'),
    (date '2023-09-04', 'Labour Day'),
    (date '2023-12-25', 'Christmas Day'),
    (date '2024-01-01', 'New Year''s Day'),
    (date '2024-02-19', 'Heritage Day'),
    (date '2024-03-29', 'Good Friday'),
    (date '2024-07-01', 'Canada Day'),
    (date '2024-09-02', 'Labour Day'),
    (date '2024-12-25', 'Christmas Day'),
    (date '2025-01-01', 'New Year''s Day'),
    (date '2025-02-17', 'Heritage Day'),
    (date '2025-04-18', 'Good Friday'),
    (date '2025-07-01', 'Canada Day'),
    (date '2025-09-01', 'Labour Day'),
    (date '2025-12-25', 'Christmas Day'),
    (date '2026-01-01', 'New Year''s Day'),
    (date '2026-02-16', 'Heritage Day'),
    (date '2026-04-03', 'Good Friday'),
    (date '2026-07-01', 'Canada Day'),
    (date '2026-09-07', 'Labour Day'),
    (date '2026-12-25', 'Christmas Day'),
    (date '2027-01-01', 'New Year''s Day'),
    (date '2027-02-15', 'Heritage Day'),
    (date '2027-03-26', 'Good Friday'),
    (date '2027-07-01', 'Canada Day'),
    (date '2027-09-06', 'Labour Day'),
    (date '2027-12-25', 'Christmas Day'),
    (date '2028-01-01', 'New Year''s Day'),
    (date '2028-02-21', 'Heritage Day'),
    (date '2028-04-14', 'Good Friday'),
    (date '2028-07-01', 'Canada Day'),
    (date '2028-09-04', 'Labour Day'),
    (date '2028-12-25', 'Christmas Day'),
    (date '2029-01-01', 'New Year''s Day'),
    (date '2029-02-19', 'Heritage Day'),
    (date '2029-03-30', 'Good Friday'),
    (date '2029-07-01', 'Canada Day'),
    (date '2029-09-03', 'Labour Day'),
    (date '2029-12-25', 'Christmas Day'),
    (date '2030-01-01', 'New Year''s Day'),
    (date '2030-02-18', 'Heritage Day'),
    (date '2030-04-19', 'Good Friday'),
    (date '2030-07-01', 'Canada Day'),
    (date '2030-09-02', 'Labour Day'),
    (date '2030-12-25', 'Christmas Day'),
    (date '2031-01-01', 'New Year''s Day'),
    (date '2031-02-17', 'Heritage Day'),
    (date '2031-04-11', 'Good Friday'),
    (date '2031-07-01', 'Canada Day'),
    (date '2031-09-01', 'Labour Day'),
    (date '2031-12-25', 'Christmas Day'),
    (date '2032-01-01', 'New Year''s Day'),
    (date '2032-02-16', 'Heritage Day'),
    (date '2032-03-26', 'Good Friday'),
    (date '2032-07-01', 'Canada Day'),
    (date '2032-09-06', 'Labour Day'),
    (date '2032-12-25', 'Christmas Day'),
    (date '2033-01-01', 'New Year''s Day'),
    (date '2033-02-21', 'Heritage Day'),
    (date '2033-04-15', 'Good Friday'),
    (date '2033-07-01', 'Canada Day'),
    (date '2033-09-05', 'Labour Day'),
    (date '2033-12-25', 'Christmas Day'),
    (date '2034-01-01', 'New Year''s Day'),
    (date '2034-02-20', 'Heritage Day'),
    (date '2034-04-07', 'Good Friday'),
    (date '2034-07-01', 'Canada Day'),
    (date '2034-09-04', 'Labour Day'),
    (date '2034-12-25', 'Christmas Day'),
    (date '2035-01-01', 'New Year''s Day'),
    (date '2035-02-19', 'Heritage Day'),
    (date '2035-03-23', 'Good Friday'),
    (date '2035-07-01', 'Canada Day'),
    (date '2035-09-03', 'Labour Day'),
    (date '2035-12-25', 'Christmas Day')
  ) AS h (holiday_date, holiday_name)
 WHERE c.calendar_date = h.holiday_date
   AND c.statutory_holiday_flag IS DISTINCT FROM true;
