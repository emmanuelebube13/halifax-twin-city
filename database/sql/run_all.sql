-- =====================================================================
-- Halifax Digital Twin - run every build script in order.
-- Usage (from the sql folder), after creating the database with 00:
--   psql -U postgres -d halifax_twin -f run_all.sql
-- =====================================================================
\set ON_ERROR_STOP on
\echo 'Building the Halifax Digital Twin database...'
\ir 01_extensions_and_schemas.sql
\ir 02_silver_tables.sql
\ir 03_foreign_keys_and_indexes.sql
\ir 04_scd2_history.sql
\ir 05_vehicle_position_partitions.sql
\ir 06_bronze_register.sql
\ir 07_comments.sql
\ir 08_reference_data.sql
\echo 'Done. Next: run 99_smoke_test.sql to check it works.'
