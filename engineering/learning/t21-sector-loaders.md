# Learning note: t21-sector-loaders (Public Works and Housing loaders)

21 Nov 2026 · workstream C

## What was built and why

A small loader, `services/collector/hrm_arcgis/`, that reads three Halifax open data layers from ArcGIS REST and writes them into the conformed core:

- street closures and sidewalk closures (SRC-015) as `event` + `road_closure`, for PWK-Q13 "Where does utility work restrict street access or parking, and for how long?";
- building permits (SRC-066) as `event` + `building_permit`, for HRE-Q29 "How many building permits are issued, for how many units, and where?".

Every event gets its own `location` row with real geometry (lines for closures, points for permits), so the map can draw them without any special code: a layer is just an event type plus a subsector.

Three ideas carry the design:

1. **Bronze first.** Every page downloaded is saved as a raw file and registered in `bronze.feed_fetch` before anything is parsed. If a transform is wrong, the raw data is still there to reload from.
2. **Set-based, idempotent writes.** Rows are copied into a temporary staging table, then three `INSERT ... SELECT ... ON CONFLICT` statements write location, event and subtype. The alternate key (`source_id` + the source's own key) decides insert or update, and the update runs only `WHERE (old values) IS DISTINCT FROM (new values)`. Running the same load twice changes nothing.
3. **SCD Type 2 stays honest.** Because unchanged rows are never updated, the history trigger on `silver.location` only records real changes. A reload adds no false versions.

## How to run it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sector-refresh.ps1   # unattended refresh, as the scheduled task runs it
cd services\collector
..\..\.venv\Scripts\python -m hrm_arcgis              # load all three layers
..\..\.venv\Scripts\python -m hrm_arcgis --profile    # how full is each field?
```

## Hands-on exercise

1. In pgAdmin, open `halifax_twin` and run:

   ```sql
   SELECT r.closure_reason_code, count(*) AS closures,
          round(avg(extract(epoch FROM e.event_end_ts - e.event_start_ts) / 86400)::numeric, 1) AS avg_days
     FROM silver.road_closure r JOIN silver.event e USING (event_id)
    WHERE e.event_end_ts < '2090-01-01'
    GROUP BY 1 ORDER BY avg_days DESC;
   ```

   Which kind of closure lasts longest? Why is the `2090` filter there? (Look for the closure that ends on 31 Dec 2099.)

2. Run the loader twice and compare `SELECT count(*), max(dw_loaded_ts) FROM silver.event WHERE source_id = 'SRC-066';` after each run. Then explain, from `store.py`, why neither number moved.

## Keeping it fresh (added 22 Nov 2026)

A one-off load goes stale: the stories say "now", so the data must be refreshed on a schedule. `scripts\sector-refresh.ps1` wraps the loader for unattended use (its own virtual environment, a dated log file, one run at a time, a non-zero exit code on failure so Task Scheduler shows it), and `scripts\sector-register-task.ps1` schedules it every 6 hours. Because the loader is idempotent, a refresh that finds no change writes nothing; only new or edited rows move.

Exercise: run `powershell -ExecutionPolicy Bypass -File scripts\sector-refresh.ps1`, open the day's `sector_refresh_*.log` in `C:\halifax-twin-data\logs`, then run `SELECT source_id, max(fetched_ts) FROM bronze.feed_fetch GROUP BY 1;` and explain how a freshness check would use that column.

Enterprise mapping: scheduling, idempotent reruns and freshness checks are the orchestration topics behind Azure Data Factory triggers, Airflow DAGs and dbt source freshness.

## Enterprise mapping

Incremental upsert with change detection (`MERGE` / `ON CONFLICT`, "delta loads") and raw landing zones are core topics of the Microsoft DP-203 / DP-700 data engineering certifications and of Informatica or Azure Data Factory pipelines; spatial loading with PostGIS maps to Esri and OGC skills.
