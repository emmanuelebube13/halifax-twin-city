-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 01  Extensions and schemas
-- Run once, connected to the halifax_twin database.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

-- PostGIS adds the geometry type and spatial functions (ST_Distance, ST_Within ...).
CREATE EXTENSION IF NOT EXISTS postgis;

-- One schema per layer of the medallion architecture.
CREATE SCHEMA IF NOT EXISTS bronze;  -- raw data exactly as received (files + a register of every fetch)
CREATE SCHEMA IF NOT EXISTS silver;  -- the 3NF model from erwin: cleaned, conformed, with history
CREATE SCHEMA IF NOT EXISTS gold;    -- star schemas and serving tables, one per group of business questions (later)

COMMENT ON SCHEMA bronze IS 'Raw landing: data as received from each source, never edited.';
COMMENT ON SCHEMA silver IS 'Conformed 3NF model (Logical Model V1) with SCD Type 2 history.';
COMMENT ON SCHEMA gold   IS 'Analytics and serving: Kimball star schemas per question group (not built yet).';
