# Learning note: Phase 1 full-stack performance optimization (`opt-phase1-performance`)

25 Nov 2026 · Prepared for Emmanuel Mbachu

## 1. What was built and why

As `halifax_twin` grew past half a million GPS positions and 230,000 events in its first four days, four layers of avoidable work showed up together:

1. **Database index coverage (`database/generator/build_physical_sql.py`):**
   - PostgreSQL automatically creates a B-tree index for every `PRIMARY KEY` and `UNIQUE` constraint (`ak1_*`), so single-column foreign-key indexes whose column is already the leading column of an alternate key (`ix_event_source_id` alongside `ak1_event (source_id, source_event_key)`, `ix_stop_arrival_trip_event_id` alongside `ak1_stop_arrival (trip_event_id, stop_sequence_number)`, and five others) paid write maintenance on every insert without accelerating reads.
   - Conversely, hot time-range and watermark queries (`position_ts > now() - 180s`, `event_type_code = ... AND event_start_ts ...`, `max(dw_loaded_ts)` per source/type, and `scheduled_trip` lookups by `(source_trip_key, route_asset_id)`) lacked composite indexes. Adding those seven indexes and dropping the seven redundant FK indexes speeds both live queries and freshness checks while keeping index count neutral.

2. **MVCC write amplification in collectors (`services/collector/`):**
   - Under PostgreSQL Multi-Version Concurrency Control (MVCC), every `UPDATE` writes a brand-new physical row version (tuple) and marks the old tuple dead until `VACUUM` reclaims it—even if every column value stayed identical.
   - Adding `WHERE (...) IS DISTINCT FROM (...)` to `ON CONFLICT DO UPDATE` statements in `transit_realtime/store.py` and `gtfs_schedule/loader.py`, plus skipping Silver writes when a GTFS-RT protobuf's SHA-256 hash has not changed since the previous cycle, eliminates ~90% of dead-tuple churn on `silver.event`, `silver.stop_arrival`, `silver.stop`, and `silver.route`.

3. **HTTP compression, conditional `ETag` caching, and shared story queries (`services/api/`):**
   - GeoJSON coordinates compress extremely well (~8–10x) under GZip because adjacent points repeat similar digit prefixes (`-63.57...`, `44.64...`). Adding `GZipMiddleware`, direct C-speed `json.dumps` serialization (bypassing FastAPI's recursive `jsonable_encoder` walk over thousands of features), and weak `ETag` (`304 Not Modified`) headers cuts multi-megabyte layer transfers down to a few hundred kilobytes on first load and zero bytes on repeat polls.
   - Separating `PoolTimeout` from `OperationalError` ensures a temporary burst of slow queries returns `503` only for that caller instead of tripping a 10-second global circuit breaker.
   - Sharing cached base query results across sibling numbers on the same story (`TRN-Q01`, `TRN-Q02`, `TRN-Q03`, `TRN-Q04`, `TRN-Q09`, `TRN-Q11`) turns 2–4 identical database scans per story into 1.

4. **Frontend React render isolation, 10 Hz glide caching, and 2D/3D frame loops (`apps/web/`):**
   - Moving the 1-second `useNow(1000)` clock out of root `App()` into small timestamp leaf components stops React from rebuilding ~5,000+ search items and re-rendering the map tree every second while idle.
   - Passing pre-indexed polylines (`routeIndex.getIndexed()`), binary-searching track timestamps, and caching route-segment snap projections eliminates redundant geometry math 10 times per second, while pausing glide loops when Replay is paused or the browser tab is hidden saves laptop and phone battery.
   - Enabling `ETag` and `Cache-Control` on `/tiles/` lets browsers cache PMTiles byte-range blocks, splitting vendor chunks keeps `maplibre` and `react` cached across deploys, subsetting IBM Plex to `latin` + `latin-ext` preserves English, French, and Mi'kmaw typography while cutting 44 unused font files, and setting `asynchronous: true` on `cleanTwin3D` primitives keeps Cesium mesh builds off the UI thread.

## 2. How to verify

```powershell
# 1. Database generator and index rules (8 tests)
C:\Users\emman\AppData\Local\Programs\Python\Python312\python.exe -m unittest discover -s halifax-twin-city\database\generator\tests -v

# 2. Collector suite including IS DISTINCT FROM idempotency (46 tests, scratch DB)
powershell -ExecutionPolicy Bypass -File halifax-twin-city\scripts\collector-test.ps1

# 3. Serving API suite including ETag 304, GZip, PoolTimeout isolation (159 tests, scratch DB)
cd halifax-twin-city\services\api
.\.venv\Scripts\python.exe -m pytest

# 4. Web unit tests (110 tests) and production build
cd ..\..\apps\web
node_modules\.bin\vitest.cmd run --configLoader runner
npm.cmd run build
```

## 3. Hands-on exercise

Open a SQL prompt against `halifax_twin` and inspect how PostgreSQL uses your new composite indexes and how MVCC dead tuples behave across two 30-second collector cycles:

```powershell
$pg = 'C:\halifax-twin-data\pgsql\bin\psql.exe'

# 1. Verify PostgreSQL uses an Index Scan on ix_vehicle_position_position_ts for the 3-minute live window:
& $pg -h localhost -p 5433 -U postgres -w -d halifax_twin -c "EXPLAIN (ANALYZE, BUFFERS) SELECT count(DISTINCT vehicle_asset_id), max(position_ts) FROM silver.vehicle_position WHERE position_ts > now() - interval '180 seconds';"

# 2. Watch n_tup_upd and n_dead_tup on silver.stop_arrival across 60 seconds:
& $pg -h localhost -p 5433 -U postgres -w -d halifax_twin -c "SELECT relname, n_tup_ins, n_tup_upd, n_dead_tup FROM pg_stat_user_tables WHERE relname IN ('event', 'stop_arrival');"
```

Compare the `Execution Time` of the `EXPLAIN ANALYZE` plan (sub-millisecond index scan on `ix_vehicle_position_position_ts`) against what PostgreSQL had to do previously when only `(vehicle_asset_id, position_ts)` existed.

## 4. Enterprise and certification mapping

PostgreSQL MVCC internals, `VACUUM`, and composite B-tree prefix indexing (PostgreSQL Associate / Database Administration); idempotent CDC/upsert pipelines (`IS DISTINCT FROM`, Databricks / SnowPro Data Engineer); HTTP conditional requests (`RFC 9110` `ETag` / `If-None-Match` / `206 Partial Content`) and single-flight cache stampede protection (system design and REST API engineering).
