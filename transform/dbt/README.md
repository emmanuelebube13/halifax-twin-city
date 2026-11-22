# Data quality checks (dbt)

Automated checks for the data quality rules in `engineering/model/standards.md` (Phase 2 task 6). dbt Core with dbt-postgres, free, local. Read-only: there are no models, only tests over sources in `bronze` and `silver`, and the runner opens a read-only session.

## First time

```powershell
cd transform\dbt
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item profiles.example.yml profiles.yml   # git-ignored; holds no password
```

The password stays in `%APPDATA%\postgresql\pgpass.conf`; libpq reads it because the profile's password is empty.

## Run

```powershell
.\run-quality.ps1                      # all tests, then source freshness
.\run-quality.ps1 -Select tag:DQ-044   # one rule
.\run-quality.ps1 -TestsOnly
```

Each test is named `dq_<id>_...` and tagged with its rule id (`DQ-044`). Severity `warn` rules report without failing the run; `error` rules fail it.

## Layout

| Path | What |
| --- | --- |
| `models/bronze_sources.yml` | `bronze.feed_fetch`, `bronze.feed_gap`, freshness per source (DQ-090 to 094) |
| `models/silver_sources.yml` | Silver tables and their column and table tests |
| `tests/generic/` | Custom generic tests: `valid_geometry` (ST_IsValid), SRID, envelope, subtype and location rules, SCD2 overlap |
| `tests/*.sql` | Singular tests for cross-table rules (DQ-004, 042, 043, 061, 064, 096) |
| `test_rule_coverage.py` | Checks every rule id in `standards.md` has a dbt check and the other way round |
