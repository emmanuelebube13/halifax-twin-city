-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 04  SCD Type 2 history
-- Each changing table keeps its current rows; every older version is copied to a matching _hist table by a trigger. The _timeline views show both as classic SCD2 rows.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

SET search_path = silver, public;

-- One generic trigger function serves every history table.
-- On UPDATE: the old version is copied to <table>_hist with valid_to_ts = now(),
--            and the new version gets a fresh valid_from_ts.
-- On DELETE: the deleted version is copied to <table>_hist.
-- An UPDATE that changes nothing is ignored, so reloading identical data adds no history.
CREATE OR REPLACE FUNCTION silver.fn_scd2_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - 'dw_loaded_ts' - 'dw_batch_id' - 'valid_from_ts')
           = (to_jsonb(OLD) - 'dw_loaded_ts' - 'dw_batch_id' - 'valid_from_ts') THEN
            RETURN NEW;                       -- nothing real changed: no new version
        END IF;
        EXECUTE format('INSERT INTO %I.%I SELECT ($1).*, now()', TG_TABLE_SCHEMA, TG_TABLE_NAME || '_hist')
            USING OLD;
        NEW.valid_from_ts := now();
        NEW.dw_loaded_ts  := now();
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        EXECUTE format('INSERT INTO %I.%I SELECT ($1).*, now()', TG_TABLE_SCHEMA, TG_TABLE_NAME || '_hist')
            USING OLD;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION silver.fn_scd2_capture() IS
    'SCD Type 2: copies the previous version of a row into <table>_hist on update or delete.';

-- Sector -------------------------------------------------------------
CREATE TABLE silver.sector_hist (LIKE silver.sector INCLUDING DEFAULTS);
ALTER TABLE silver.sector_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_sector_hist_sector_id ON silver.sector_hist (sector_id, valid_from_ts);
COMMENT ON TABLE silver.sector_hist IS 'SCD2 history of silver.sector: one row per replaced or deleted version.';
CREATE TRIGGER trg_sector_scd2 BEFORE UPDATE OR DELETE ON silver.sector
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.sector_timeline AS
    SELECT sector_id, sector_name, sector_description, phase_number, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.sector
    UNION ALL
    SELECT sector_id, sector_name, sector_description, phase_number, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.sector_hist;
COMMENT ON VIEW silver.sector_timeline IS 'Every version of Sector with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Subsector -------------------------------------------------------------
CREATE TABLE silver.subsector_hist (LIKE silver.subsector INCLUDING DEFAULTS);
ALTER TABLE silver.subsector_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_subsector_hist_subsector_id ON silver.subsector_hist (subsector_id, valid_from_ts);
COMMENT ON TABLE silver.subsector_hist IS 'SCD2 history of silver.subsector: one row per replaced or deleted version.';
CREATE TRIGGER trg_subsector_scd2 BEFORE UPDATE OR DELETE ON silver.subsector
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.subsector_timeline AS
    SELECT subsector_id, sector_id, subsector_name, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.subsector
    UNION ALL
    SELECT subsector_id, sector_id, subsector_name, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.subsector_hist;
COMMENT ON VIEW silver.subsector_timeline IS 'Every version of Subsector with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Source -------------------------------------------------------------
CREATE TABLE silver.source_hist (LIKE silver.source INCLUDING DEFAULTS);
ALTER TABLE silver.source_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_source_hist_source_id ON silver.source_hist (source_id, valid_from_ts);
COMMENT ON TABLE silver.source_hist IS 'SCD2 history of silver.source: one row per replaced or deleted version.';
CREATE TRIGGER trg_source_scd2 BEFORE UPDATE OR DELETE ON silver.source
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.source_timeline AS
    SELECT source_id, publisher_party_id, dataset_name, source_format_code, access_method_code, cadence_code, availability_code, licence_name, attribution_required_flag, record_grain_description, source_url, reliability_tier_code, source_status_code, last_checked_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.source
    UNION ALL
    SELECT source_id, publisher_party_id, dataset_name, source_format_code, access_method_code, cadence_code, availability_code, licence_name, attribution_required_flag, record_grain_description, source_url, reliability_tier_code, source_status_code, last_checked_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.source_hist;
COMMENT ON VIEW silver.source_timeline IS 'Every version of Source with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Measure -------------------------------------------------------------
CREATE TABLE silver.measure_hist (LIKE silver.measure INCLUDING DEFAULTS);
ALTER TABLE silver.measure_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_measure_hist_measure_code ON silver.measure_hist (measure_code, valid_from_ts);
COMMENT ON TABLE silver.measure_hist IS 'SCD2 history of silver.measure: one row per replaced or deleted version.';
CREATE TRIGGER trg_measure_scd2 BEFORE UPDATE OR DELETE ON silver.measure
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.measure_timeline AS
    SELECT measure_code, measure_name, unit_of_measure_code, measure_description, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.measure
    UNION ALL
    SELECT measure_code, measure_name, unit_of_measure_code, measure_description, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.measure_hist;
COMMENT ON VIEW silver.measure_timeline IS 'Every version of Measure with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Location -------------------------------------------------------------
CREATE TABLE silver.location_hist (LIKE silver.location INCLUDING DEFAULTS);
ALTER TABLE silver.location_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_location_hist_location_id ON silver.location_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.location_hist IS 'SCD2 history of silver.location: one row per replaced or deleted version.';
CREATE TRIGGER trg_location_scd2 BEFORE UPDATE OR DELETE ON silver.location
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.location_timeline AS
    SELECT location_id, location_type_code, location_name, geometry_type_code, location_geometry, centroid_latitude, centroid_longitude, source_id, source_location_key, start_date, end_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.location
    UNION ALL
    SELECT location_id, location_type_code, location_name, geometry_type_code, location_geometry, centroid_latitude, centroid_longitude, source_id, source_location_key, start_date, end_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.location_hist;
COMMENT ON VIEW silver.location_timeline IS 'Every version of Location with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Street -------------------------------------------------------------
CREATE TABLE silver.street_hist (LIKE silver.street INCLUDING DEFAULTS);
ALTER TABLE silver.street_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_street_hist_location_id ON silver.street_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.street_hist IS 'SCD2 history of silver.street: one row per replaced or deleted version.';
CREATE TRIGGER trg_street_scd2 BEFORE UPDATE OR DELETE ON silver.street
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.street_timeline AS
    SELECT location_id, street_name, street_type_code, street_direction_code, road_jurisdiction_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.street
    UNION ALL
    SELECT location_id, street_name, street_type_code, street_direction_code, road_jurisdiction_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.street_hist;
COMMENT ON VIEW silver.street_timeline IS 'Every version of Street with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Street Segment -------------------------------------------------------------
CREATE TABLE silver.street_segment_hist (LIKE silver.street_segment INCLUDING DEFAULTS);
ALTER TABLE silver.street_segment_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_street_segment_hist_location_id ON silver.street_segment_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.street_segment_hist IS 'SCD2 history of silver.street_segment: one row per replaced or deleted version.';
CREATE TRIGGER trg_street_segment_scd2 BEFORE UPDATE OR DELETE ON silver.street_segment
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.street_segment_timeline AS
    SELECT location_id, street_location_id, from_intersection_location_id, to_intersection_location_id, segment_length_metres, road_class_code, speed_limit_kph, lane_count, one_way_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.street_segment
    UNION ALL
    SELECT location_id, street_location_id, from_intersection_location_id, to_intersection_location_id, segment_length_metres, road_class_code, speed_limit_kph, lane_count, one_way_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.street_segment_hist;
COMMENT ON VIEW silver.street_segment_timeline IS 'Every version of Street Segment with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Intersection -------------------------------------------------------------
CREATE TABLE silver.intersection_hist (LIKE silver.intersection INCLUDING DEFAULTS);
ALTER TABLE silver.intersection_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_intersection_hist_location_id ON silver.intersection_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.intersection_hist IS 'SCD2 history of silver.intersection: one row per replaced or deleted version.';
CREATE TRIGGER trg_intersection_scd2 BEFORE UPDATE OR DELETE ON silver.intersection
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.intersection_timeline AS
    SELECT location_id, intersection_name, traffic_control_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.intersection
    UNION ALL
    SELECT location_id, intersection_name, traffic_control_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.intersection_hist;
COMMENT ON VIEW silver.intersection_timeline IS 'Every version of Intersection with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Area -------------------------------------------------------------
CREATE TABLE silver.area_hist (LIKE silver.area INCLUDING DEFAULTS);
ALTER TABLE silver.area_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_area_hist_location_id ON silver.area_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.area_hist IS 'SCD2 history of silver.area: one row per replaced or deleted version.';
CREATE TRIGGER trg_area_scd2 BEFORE UPDATE OR DELETE ON silver.area
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.area_timeline AS
    SELECT location_id, area_type_code, area_code, parent_area_location_id, area_square_km, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.area
    UNION ALL
    SELECT location_id, area_type_code, area_code, parent_area_location_id, area_square_km, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.area_hist;
COMMENT ON VIEW silver.area_timeline IS 'Every version of Area with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Civic Address -------------------------------------------------------------
CREATE TABLE silver.civic_address_hist (LIKE silver.civic_address INCLUDING DEFAULTS);
ALTER TABLE silver.civic_address_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_civic_address_hist_location_id ON silver.civic_address_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.civic_address_hist IS 'SCD2 history of silver.civic_address: one row per replaced or deleted version.';
CREATE TRIGGER trg_civic_address_scd2 BEFORE UPDATE OR DELETE ON silver.civic_address
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.civic_address_timeline AS
    SELECT location_id, street_location_id, parcel_location_id, civic_number, civic_number_suffix, postal_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.civic_address
    UNION ALL
    SELECT location_id, street_location_id, parcel_location_id, civic_number, civic_number_suffix, postal_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.civic_address_hist;
COMMENT ON VIEW silver.civic_address_timeline IS 'Every version of Civic Address with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Parcel -------------------------------------------------------------
CREATE TABLE silver.parcel_hist (LIKE silver.parcel INCLUDING DEFAULTS);
ALTER TABLE silver.parcel_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_parcel_hist_location_id ON silver.parcel_hist (location_id, valid_from_ts);
COMMENT ON TABLE silver.parcel_hist IS 'SCD2 history of silver.parcel: one row per replaced or deleted version.';
CREATE TRIGGER trg_parcel_scd2 BEFORE UPDATE OR DELETE ON silver.parcel
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.parcel_timeline AS
    SELECT location_id, parcel_pid, parcel_area_square_metres, land_use_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.parcel
    UNION ALL
    SELECT location_id, parcel_pid, parcel_area_square_metres, land_use_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.parcel_hist;
COMMENT ON VIEW silver.parcel_timeline IS 'Every version of Parcel with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Party -------------------------------------------------------------
CREATE TABLE silver.party_hist (LIKE silver.party INCLUDING DEFAULTS);
ALTER TABLE silver.party_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_party_hist_party_id ON silver.party_hist (party_id, valid_from_ts);
COMMENT ON TABLE silver.party_hist IS 'SCD2 history of silver.party: one row per replaced or deleted version.';
CREATE TRIGGER trg_party_scd2 BEFORE UPDATE OR DELETE ON silver.party
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.party_timeline AS
    SELECT party_id, party_type_code, party_name, source_id, source_party_key, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.party
    UNION ALL
    SELECT party_id, party_type_code, party_name, source_id, source_party_key, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.party_hist;
COMMENT ON VIEW silver.party_timeline IS 'Every version of Party with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Organization -------------------------------------------------------------
CREATE TABLE silver.organization_hist (LIKE silver.organization INCLUDING DEFAULTS);
ALTER TABLE silver.organization_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_organization_hist_party_id ON silver.organization_hist (party_id, valid_from_ts);
COMMENT ON TABLE silver.organization_hist IS 'SCD2 history of silver.organization: one row per replaced or deleted version.';
CREATE TRIGGER trg_organization_scd2 BEFORE UPDATE OR DELETE ON silver.organization
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.organization_timeline AS
    SELECT party_id, organization_type_code, legal_name, business_number, website_url, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.organization
    UNION ALL
    SELECT party_id, organization_type_code, legal_name, business_number, website_url, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.organization_hist;
COMMENT ON VIEW silver.organization_timeline IS 'Every version of Organization with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Asset -------------------------------------------------------------
CREATE TABLE silver.asset_hist (LIKE silver.asset INCLUDING DEFAULTS);
ALTER TABLE silver.asset_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_asset_hist_asset_id ON silver.asset_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.asset_hist IS 'SCD2 history of silver.asset: one row per replaced or deleted version.';
CREATE TRIGGER trg_asset_scd2 BEFORE UPDATE OR DELETE ON silver.asset
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.asset_timeline AS
    SELECT asset_id, asset_type_code, asset_name, location_id, subsector_id, source_id, source_asset_key, asset_status_code, in_service_date, out_of_service_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.asset
    UNION ALL
    SELECT asset_id, asset_type_code, asset_name, location_id, subsector_id, source_id, source_asset_key, asset_status_code, in_service_date, out_of_service_date, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.asset_hist;
COMMENT ON VIEW silver.asset_timeline IS 'Every version of Asset with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Route -------------------------------------------------------------
CREATE TABLE silver.route_hist (LIKE silver.route INCLUDING DEFAULTS);
ALTER TABLE silver.route_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_route_hist_asset_id ON silver.route_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.route_hist IS 'SCD2 history of silver.route: one row per replaced or deleted version.';
CREATE TRIGGER trg_route_scd2 BEFORE UPDATE OR DELETE ON silver.route
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.route_timeline AS
    SELECT asset_id, route_short_name, route_long_name, route_mode_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.route
    UNION ALL
    SELECT asset_id, route_short_name, route_long_name, route_mode_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.route_hist;
COMMENT ON VIEW silver.route_timeline IS 'Every version of Route with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Stop -------------------------------------------------------------
CREATE TABLE silver.stop_hist (LIKE silver.stop INCLUDING DEFAULTS);
ALTER TABLE silver.stop_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_stop_hist_asset_id ON silver.stop_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.stop_hist IS 'SCD2 history of silver.stop: one row per replaced or deleted version.';
CREATE TRIGGER trg_stop_scd2 BEFORE UPDATE OR DELETE ON silver.stop
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.stop_timeline AS
    SELECT asset_id, stop_code, stop_name, stop_kind_code, parent_stop_asset_id, wheelchair_boarding_code, shelter_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.stop
    UNION ALL
    SELECT asset_id, stop_code, stop_name, stop_kind_code, parent_stop_asset_id, wheelchair_boarding_code, shelter_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.stop_hist;
COMMENT ON VIEW silver.stop_timeline IS 'Every version of Stop with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Vehicle -------------------------------------------------------------
CREATE TABLE silver.vehicle_hist (LIKE silver.vehicle INCLUDING DEFAULTS);
ALTER TABLE silver.vehicle_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_vehicle_hist_asset_id ON silver.vehicle_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.vehicle_hist IS 'SCD2 history of silver.vehicle: one row per replaced or deleted version.';
CREATE TRIGGER trg_vehicle_scd2 BEFORE UPDATE OR DELETE ON silver.vehicle
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.vehicle_timeline AS
    SELECT asset_id, vehicle_label, vehicle_mode_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.vehicle
    UNION ALL
    SELECT asset_id, vehicle_label, vehicle_mode_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.vehicle_hist;
COMMENT ON VIEW silver.vehicle_timeline IS 'Every version of Vehicle with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Route Segment -------------------------------------------------------------
CREATE TABLE silver.route_segment_hist (LIKE silver.route_segment INCLUDING DEFAULTS);
ALTER TABLE silver.route_segment_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_route_segment_hist_asset_id ON silver.route_segment_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.route_segment_hist IS 'SCD2 history of silver.route_segment: one row per replaced or deleted version.';
CREATE TRIGGER trg_route_segment_scd2 BEFORE UPDATE OR DELETE ON silver.route_segment
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.route_segment_timeline AS
    SELECT asset_id, from_stop_asset_id, to_stop_asset_id, segment_length_metres, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.route_segment
    UNION ALL
    SELECT asset_id, from_stop_asset_id, to_stop_asset_id, segment_length_metres, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.route_segment_hist;
COMMENT ON VIEW silver.route_segment_timeline IS 'Every version of Route Segment with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Infrastructure Asset -------------------------------------------------------------
CREATE TABLE silver.infrastructure_asset_hist (LIKE silver.infrastructure_asset INCLUDING DEFAULTS);
ALTER TABLE silver.infrastructure_asset_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_infrastructure_asset_hist_asset_id ON silver.infrastructure_asset_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.infrastructure_asset_hist IS 'SCD2 history of silver.infrastructure_asset: one row per replaced or deleted version.';
CREATE TRIGGER trg_infrastructure_asset_scd2 BEFORE UPDATE OR DELETE ON silver.infrastructure_asset
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.infrastructure_asset_timeline AS
    SELECT asset_id, infrastructure_class_code, material_code, condition_rating_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.infrastructure_asset
    UNION ALL
    SELECT asset_id, infrastructure_class_code, material_code, condition_rating_code, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.infrastructure_asset_hist;
COMMENT ON VIEW silver.infrastructure_asset_timeline IS 'Every version of Infrastructure Asset with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Facility -------------------------------------------------------------
CREATE TABLE silver.facility_hist (LIKE silver.facility INCLUDING DEFAULTS);
ALTER TABLE silver.facility_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_facility_hist_asset_id ON silver.facility_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.facility_hist IS 'SCD2 history of silver.facility: one row per replaced or deleted version.';
CREATE TRIGGER trg_facility_scd2 BEFORE UPDATE OR DELETE ON silver.facility
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.facility_timeline AS
    SELECT asset_id, facility_type_code, capacity_quantity, capacity_unit_code, public_access_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.facility
    UNION ALL
    SELECT asset_id, facility_type_code, capacity_quantity, capacity_unit_code, public_access_flag, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.facility_hist;
COMMENT ON VIEW silver.facility_timeline IS 'Every version of Facility with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Building -------------------------------------------------------------
CREATE TABLE silver.building_hist (LIKE silver.building INCLUDING DEFAULTS);
ALTER TABLE silver.building_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_building_hist_asset_id ON silver.building_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.building_hist IS 'SCD2 history of silver.building: one row per replaced or deleted version.';
CREATE TRIGGER trg_building_scd2 BEFORE UPDATE OR DELETE ON silver.building
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.building_timeline AS
    SELECT asset_id, building_use_code, building_type_code, year_built, storey_count, gross_floor_area_square_metres, reported_unit_count, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.building
    UNION ALL
    SELECT asset_id, building_use_code, building_type_code, year_built, storey_count, gross_floor_area_square_metres, reported_unit_count, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.building_hist;
COMMENT ON VIEW silver.building_timeline IS 'Every version of Building with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

-- Dwelling Unit -------------------------------------------------------------
CREATE TABLE silver.dwelling_unit_hist (LIKE silver.dwelling_unit INCLUDING DEFAULTS);
ALTER TABLE silver.dwelling_unit_hist
    ADD COLUMN valid_to_ts timestamptz NOT NULL,
    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE INDEX ix_dwelling_unit_hist_asset_id ON silver.dwelling_unit_hist (asset_id, valid_from_ts);
COMMENT ON TABLE silver.dwelling_unit_hist IS 'SCD2 history of silver.dwelling_unit: one row per replaced or deleted version.';
CREATE TRIGGER trg_dwelling_unit_scd2 BEFORE UPDATE OR DELETE ON silver.dwelling_unit
    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();
CREATE VIEW silver.dwelling_unit_timeline AS
    SELECT asset_id, building_asset_id, unit_number, dwelling_type_code, bedroom_count, tenure_code, floor_area_square_metres, valid_from_ts, dw_loaded_ts, dw_batch_id,
           NULL::timestamptz AS valid_to_ts, true AS is_current
      FROM silver.dwelling_unit
    UNION ALL
    SELECT asset_id, building_asset_id, unit_number, dwelling_type_code, bedroom_count, tenure_code, floor_area_square_metres, valid_from_ts, dw_loaded_ts, dw_batch_id,
           valid_to_ts, false AS is_current
      FROM silver.dwelling_unit_hist;
COMMENT ON VIEW silver.dwelling_unit_timeline IS 'Every version of Dwelling Unit with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';

