-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 05  Partitions for vehicle positions
-- Vehicle positions arrive every few seconds for every bus, so the table is split by month. Old months can be dropped in one statement once they are condensed into stop arrivals.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

-- A default partition catches anything outside the monthly ranges.
CREATE TABLE silver.vehicle_position_default PARTITION OF silver.vehicle_position DEFAULT;

-- Monthly partitions from November 2026 to December 2027.
-- To add a month later, copy one line and change the dates.
CREATE TABLE silver.vehicle_position_2026_11 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE silver.vehicle_position_2026_12 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE silver.vehicle_position_2027_01 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE silver.vehicle_position_2027_02 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE silver.vehicle_position_2027_03 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE silver.vehicle_position_2027_04 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE silver.vehicle_position_2027_05 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE silver.vehicle_position_2027_06 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE silver.vehicle_position_2027_07 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE silver.vehicle_position_2027_08 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE silver.vehicle_position_2027_09 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE silver.vehicle_position_2027_10 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE silver.vehicle_position_2027_11 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE silver.vehicle_position_2027_12 PARTITION OF silver.vehicle_position FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Indexes declared on the parent are created on every partition automatically.
-- (The trip_event_id foreign-key index is already made in script 03.)
CREATE INDEX ix_vehicle_position_position_geom_gist ON silver.vehicle_position USING gist (position_geom);
