# T03: the transit collector, ported and running

21 Nov 2026 · Workstream B, branch `t03-transit-collector`

## What was built and why

The demo's transit loaders worked, so they were moved, not rewritten. They now live in `services/collector/` as one Python package, `collector`, with tests that run against a real (scratch) database:

| Part | Does | Lands in |
| --- | --- | --- |
| `gtfs_schedule` | Loads Halifax Transit's GTFS file (SRC-004) | `location`, `asset`, `stop`, `route`, `schedule_version`, `service_calendar`, `service_calendar_exception`, `scheduled_trip`, `scheduled_stop_time` |
| `transit_realtime` | Every 30 s: vehicle positions, trip updates, alerts (SRC-001 to 003) | `vehicle_position`, `event` + `trip`, `event` + `stop_arrival`, `event` + `service_alert`, `event_asset_involvement` |
| `retention` | Deletes raw files older than 7 days | files under `C:\halifax-twin-data\bronze` |
| `database/gold/` | Read-only functions for TRN-Q02, Q03, Q04, Q05, Q11 | `gold` schema |

Changes from the demo, each for a reason:

- **Its own settings module.** The demo reached into the web app's settings with a `sys.path` trick. Now `collector/settings.py` reads `HALIFAX_TWIN_DB_URL` and `HALIFAX_TWIN_DATA_DIR`. A collector should not depend on the website.
- **Portable file paths.** `bronze.feed_fetch.file_path` now holds `bronze/SRC-001/2026-11-21/vehicle_positions_210513.pb.gz`: relative, forward slashes. Move the data folder or read it from Linux and the register still points at the right file.
- **Retention.** Raw trip updates are about 425 MB a day. The 21 Nov decision keeps raw files for 7 days and the parsed history for good. The register rows are never deleted, so the Gate 0 gap check still works after the files are gone.
- **One collector per database.** The collector takes a PostgreSQL *advisory lock*: a named lock that lives as long as the connection. A second copy cannot get it and stops at once. This is safer than a lock file, because if the collector crashes the database releases the lock by itself.

### Ideas worth knowing

**1. Idempotent loads.** Running the schedule loader twice must change nothing. The check is concrete: every `_hist` table stays at 0 rows after a reload. It does, because each row is written in one statement and the SCD2 trigger ignores updates that change nothing.

**2. Facts versus predictions.** Trip updates predict every stop ahead. Only stops already passed are stored, so `stop_arrival` holds what happened, not guesses.

**3. Honest measures.** A gold measure must never report a collector outage as bad service. `scheduled_trip_status` says "Not covered" when the collector was not fetching, and `stop_headway` marks a gap "incomplete" when a bus in between was not recorded.

**4. Excess wait.** If buses come every 10 minutes exactly, a rider waits 5 minutes on average. If they come in pairs every 20 minutes, the average gap is still 10 but the rider waits about 10. The formula `sum(h^2) / (2 x sum(h))` captures that; it is how transit agencies measure regularity.

## How to run it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1   # schedule (about 6 s)
powershell -ExecutionPolicy Bypass -File scripts\collector-start.ps1           # realtime, in the background
powershell -ExecutionPolicy Bypass -File scripts\collector-stop.ps1
powershell -ExecutionPolicy Bypass -File scripts\collector-test.ps1            # 44 tests, scratch database
```

To start it at logon, run `scripts\collector-register-task.ps1` once from the main checkout.

## Hands-on exercise

1. Check Gate 0 yourself. In pgAdmin on `halifax_twin`:

   ```sql
   SELECT source_id, max(gap) AS largest_gap, count(*) FILTER (WHERE gap > interval '2 minutes') AS holes
     FROM bronze.feed_gap WHERE source_id IN ('SRC-001', 'SRC-002', 'SRC-003') GROUP BY 1;
   ```

2. Stop the collector with `collector-stop.ps1`, wait three minutes, start it again, and run the query. Find your hole.
3. Then ask TRN-Q05 for today and see the hole from the other side: trips planned during your three minutes show as "Not covered", not "Not seen".

   ```sql
   SELECT trip_status, count(*)
     FROM gold.scheduled_trip_status((now() AT TIME ZONE 'America/Halifax')::date)
    GROUP BY 1;
   ```

4. Try to start a second copy by hand from `services\`: `collector\.venv\Scripts\python.exe -m collector.transit_realtime --once`. Read the message, and find the lock with `SELECT * FROM pg_locks WHERE locktype = 'advisory';`.

## Maps to

Streaming ingestion and medallion pipelines (bronze register, idempotent silver loads, gold measures); the Databricks and Microsoft Fabric data engineer certifications cover the same ideas. PostgreSQL advisory locks and window functions (`lag`, `lead`, `percentile_cont`) are core PostgreSQL skills.
