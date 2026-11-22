# Collectors

Python collectors for the Halifax Digital Twin, one package per source group. Each downloads open data, keeps the raw file, logs every download in `bronze.feed_fetch`, and writes into silver using the logical model's names exactly.

```
services/collector/            the Python package "collector" (run from services/)
├── settings.py                HALIFAX_TWIN_DB_URL, HALIFAX_TWIN_DATA_DIR, config/business-rules.yaml
├── common.py                  connection, download, raw files, bronze.feed_fetch
├── retention.py               deletes raw files older than raw_retention_days
├── transit_realtime/          SRC-001 to SRC-003, every 30 s (workstream B)
├── gtfs_schedule/             SRC-004, when Halifax Transit publishes a new file (workstream B)
├── hrm_arcgis/                HRM ArcGIS REST sources (workstream C)
└── tests/
```

## Settings

| Variable | Default | Use |
| --- | --- | --- |
| `HALIFAX_TWIN_DB_URL` | `postgresql://postgres@localhost:5433/halifax_twin` | No password in it: psycopg reads `pgpass.conf` itself |
| `HALIFAX_TWIN_DATA_DIR` | `C:\halifax-twin-data` | Raw files in `bronze\`, logs in `logs\` |
| `raw_retention_days` in `config/business-rules.yaml` | 7 when the file or value is missing | Raw files older than this are deleted |

`bronze.feed_fetch.file_path` is relative to the data folder, with forward slashes: `bronze/SRC-001/2026-11-21/vehicle_positions_204512.pb.gz`.

## Run

| What | Command |
| --- | --- |
| Load the GTFS schedule | `scripts\collector-load-schedule.ps1` |
| Start the realtime collector in the background | `scripts\collector-start.ps1` |
| Stop it | `scripts\collector-stop.ps1` |
| Start it at logon (run once, by hand) | `scripts\collector-register-task.ps1` |
| Delete old raw files now | from `services\`: `collector\.venv\Scripts\python.exe -m collector.retention` |
| Tests | `scripts\collector-test.ps1` |

Run every PowerShell script with `powershell -ExecutionPolicy Bypass -File <script>`. The scripts create `services\collector\.venv` with Python 3.12 the first time.

## Tests

`scripts\collector-test.ps1` creates the scratch database `halifax_twin_test_collector` from `database/sql/run_all.sql` the first time, then runs pytest. Tests never touch `halifax_twin`: the fixture refuses it. Parsing tests need no database; the database tests are skipped when the scratch database cannot be reached.

## Retention

Raw files are kept for a rolling `raw_retention_days` (7) and then deleted by the realtime collector at start-up and once a day, across the whole `bronze` folder. Rows in `bronze.feed_fetch` are never deleted, so the register and `bronze.feed_gap` stay complete; `file_path` then points at a file that is gone.
