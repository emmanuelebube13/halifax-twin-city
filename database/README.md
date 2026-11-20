# Database: PostgreSQL + PostGIS (Physical Model V1)

The Halifax Digital Twin database, built from Logical Model V1 (63 entities). It runs on your own computer, free:
- Bronze holds the raw feed register.
- Silver holds the 3NF model with SCD Type 2 history.
- Gold is reserved for star schemas, which come later.

| Read this | For |
| --- | --- |
| [Physical Model V1](docs/physical-model-v1.md) | Every design decision: naming, types, keys, history, partitions |
| [Modeling Style by Layer](docs/modeling-style-by-layer.md) | Step 7: why Bronze / 3NF Silver / Kimball Gold |
| [Learning Notes](docs/learning-notes-physical-model.md) | Ten concepts with queries to try |

The same three documents are Google Docs in Drive (`Halifax Twin City / 06 Physical Model`), for reading and commenting. The copies here keep the SQL as copy-paste code blocks. If you edit one, update the other.

## What's in this folder

```
database/
├── docs/                            design notes and learning notes (Markdown)
├── sql/
│   ├── 00_create_database.sql         create the halifax_twin database (run once)
│   ├── 01_extensions_and_schemas.sql  PostGIS, schemas bronze / silver / gold
│   ├── 02_silver_tables.sql           63 tables, keys, alternate keys, checks
│   ├── 03_foreign_keys_and_indexes.sql 108 foreign keys, 60 indexes
│   ├── 04_scd2_history.sql            22 _hist tables, trigger, _timeline views
│   ├── 05_vehicle_position_partitions.sql monthly partitions
│   ├── 06_bronze_register.sql         bronze.feed_fetch and the Gate 0 gap view
│   ├── 07_comments.sql                the data dictionary inside the database
│   ├── 08_reference_data.sql          sectors, subsectors, 17 sources, calendar 2015-2035
│   ├── run_all.sql                    runs 01 to 08 in order
│   └── 99_smoke_test.sql              builds a tiny bus trip, checks it, rolls back
└── generator/
    ├── logical_model_spec.py          Logical Model V1 as data (entities, attributes, relationships)
    ├── build_physical_sql.py          writes scripts 01-07 from the spec
    └── build_reference_and_tests_sql.py  writes 00, 08, 99 and run_all
```

## Set up on Windows (one time, about 20 minutes)

1. **Install PostgreSQL 16.** Download the Windows installer from postgresql.org (the EDB build). Keep the defaults, set a password for the `postgres` user, and keep port 5432.
2. **Install PostGIS.** At the end of the install, Stack Builder opens. Choose your PostgreSQL 16 server, then **Spatial Extensions → PostGIS 3.x Bundle**. If you skipped it, run Stack Builder from the Start menu.
3. **Make `psql` available.** Add `C:\Program Files\PostgreSQL\16\bin` to your PATH, or run the commands below from that folder.
4. **Optional:** a viewer such as pgAdmin (installed with PostgreSQL) or DBeaver Community. Both show the table and column comments.

## Build the database

From this folder in PowerShell:

```powershell
cd database\sql
psql -U postgres -f 00_create_database.sql
psql -U postgres -d halifax_twin -f run_all.sql
psql -U postgres -d halifax_twin -f 99_smoke_test.sql
```

The smoke test prints five checks and finishes with *"Everything above was rolled back."* You should see:

1. A GPS ping lands in partition `vehicle_position_2026_11` as `POINT(-63.575 44.6489)`.
2. A bus arrives at Scotia Square 70 seconds late (07:31:10 Halifax time).
3. Renaming the stop leaves two versions in `stop_timeline`: the old one closed, the new one current.
4. An arrival for a trip that doesn't exist is rejected by `fk_stop_arrival_trip`.
5. Reference data: 17 sectors, 29 subsectors, 17 sources, 126 holidays.

To start again from nothing:

```powershell
psql -U postgres -c "DROP DATABASE halifax_twin;"
```

Then run the three build commands again.

## Changing the model

There are two ways to change the database.

- **Small change:** edit the SQL script directly, rebuild, and note it in the changelog below.
- **Model change:** edit `generator/logical_model_spec.py`, then regenerate the scripts:

  ```powershell
  cd database\generator
  python build_physical_sql.py
  python build_reference_and_tests_sql.py
  ```

  Keep the spec, the erwin model and the Logical Model V1 doc in step.

## Tested on

PostgreSQL 16.15 with PostGIS 3, on a clean database, 20 Nov 2026: all scripts ran without errors, and the smoke test and every query in the learning notes passed.

## Changelog

| Date | Version | Change |
| --- | --- | --- |
| 20 Nov 2026 | V1 | First physical model from Logical Model V1: PostgreSQL 16 + PostGIS, SCD2 history, vehicle_position partitions, Bronze register, reference data |
