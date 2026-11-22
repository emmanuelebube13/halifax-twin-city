# Serving API (workstream D)

FastAPI service for contract v0 (`engineering/contract/openapi.yaml`). Read-only, port 8010, bound to 127.0.0.1. It reads `silver`, `bronze.feed_fetch` and the `gold` functions, and the configuration in `config/`.

## Run

```powershell
cd services\api
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn halifax_api.main:app --host 127.0.0.1 --port 8010
```

Settings come from the environment (or a git-ignored `services/api/config.local.json`):

| Variable | Default | Note |
| :---- | :---- | :---- |
| `HALIFAX_TWIN_DB_URL` | `postgresql://postgres@localhost:5433/halifax_twin` | No password: psycopg reads `pgpass.conf` |
| `CESIUM_ION_TOKEN` | not set | Sent only to callers on this computer; without it the map is 2D |
| `HALIFAX_TWIN_CONFIG_DIR` | `config/` at the repository root | Business rules, sectors, layers, stories |

Interactive documentation: http://127.0.0.1:8010/v1/docs. Stop with Ctrl+C.

## Test

Tests use a scratch database (`halifax_twin_test_api`, created and built from `database/sql/run_all.sql` on first run), never `halifax_twin`.

```powershell
.venv\Scripts\python -m pytest
```

## Adding a story or a layer

- A layer is configuration in `config/layers.json`: a kind (location, asset or event), a type code, optional subsectors, a subtype table and its columns (physical names from the model), and a time filter.
- A story is a file in `config/stories/`. Its answer template uses `{number_id}` placeholders; numbers live in `halifax_api/numbers.py`. A story's `requires` checks (archive length, gold function installed, a subtype column filled) decide at request time whether it is `live` or `collecting_data`.

Docker files are present but unverified: see `docker.md`.
