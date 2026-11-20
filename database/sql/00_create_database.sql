-- =====================================================================
-- Halifax Digital Twin - 00  Create the database
-- Run once, connected as the postgres superuser to the default database:
--   psql -U postgres -f 00_create_database.sql
-- =====================================================================
CREATE DATABASE halifax_twin
    ENCODING 'UTF8'
    TEMPLATE template0;
COMMENT ON DATABASE halifax_twin IS 'Halifax Digital Twin - local development database (Phase 1 physical model V1).';
