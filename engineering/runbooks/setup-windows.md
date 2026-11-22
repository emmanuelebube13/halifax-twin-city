# Runbook: the Windows build machine

21 Nov 2026. How the build machine was set up for the main build, how to start and stop the database, how to rebuild it, how to set the Cesium token, and what the architect must do by hand. Commands are PowerShell unless marked otherwise.

## 1. The machine

| Item | Value (checked 21 Nov 2026) |
| :---- | :---- |
| Operating system | Windows 11 Home |
| Processor | AMD Ryzen 7 7700 (8 cores) |
| Memory | 32 GB |
| Graphics | NVIDIA GeForce RTX 5070, 12 GB, driver 610.88 |
| git | 2.56.0 |
| GitHub CLI (`gh`) | 2.102.0 |
| rclone | 1.76.0 (for `scripts/sync-drive.ps1`) |
| Node | 24.21.0, npm 11.19.0 |
| Python | 3.12.10 through `py -3.12` (3.14 and 3.15 are also installed; use 3.12, library wheels for the newer ones may be missing) |
| PostgreSQL for the twin | Portable 16.15 with PostGIS 3.7.0, `localhost:5433` (section 3) |
| Other PostgreSQL | Windows service `postgresql-x64-16` on port 5432. Not used by the twin, has no PostGIS. Leave it alone. |
| Blender | Not installed (needed only for T30, pins) |

The repository sits inside OneDrive (`C:\Users\emman\OneDrive\Documents\Project\Halifax_Twin_city\halifax-twin-city`). Keep data, virtual environments of any size, tiles and logs out of it: OneDrive would try to upload them.

## 2. Folders outside the repository

| Folder | Holds |
| :---- | :---- |
| `C:\halifax-twin-data` | The data root (`HALIFAX_TWIN_DATA_DIR`) |
| `C:\halifax-twin-data\pgsql` | PostgreSQL and PostGIS programs (portable) |
| `C:\halifax-twin-data\pgdata` | The database cluster (all databases) |
| `C:\halifax-twin-data\bronze` | Raw feed files, kept for 7 days |
| `C:\halifax-twin-data\logs` | `postgres.log` and the collector logs |
| `C:\halifax-twin-data\tiles` | The Protomaps basemap extract (not committed) |
| `C:\halifax-twin-data\worktrees` | One git worktree per builder workstream |
| `C:\halifax-twin-data\downloads` | The installer archives used below |

## 3. How the portable PostgreSQL was made

No installer and no administrator rights were used. To repeat it:

1. Download the EDB binaries archive `postgresql-16.15-1-windows-x64-binaries.zip` (from the EDB "zip archives" page linked from postgresql.org) and extract it so its `pgsql` folder becomes `C:\halifax-twin-data\pgsql`.
2. Download the OSGeo PostGIS bundle `postgis-bundle-pg16-3.7.0x64.zip` (from download.osgeo.org, PostGIS Windows builds for PostgreSQL 16) and copy its contents over `C:\halifax-twin-data\pgsql`, merging folders.
3. **Restore the EDB copy of `bin\libcurl.dll`.** The bundle's `libcurl.dll` needs `libbrotlidec.dll` and `libnghttp2-14.dll`, which neither archive has. With the bundle's copy in place, `CREATE EXTENSION postgis` fails with "The specified module could not be found". Copy `bin\libcurl.dll` from the EDB archive back over it.
4. Create the cluster, with a password prompt so the password never appears in a command or history:

   ```powershell
   C:\halifax-twin-data\pgsql\bin\initdb.exe -D C:\halifax-twin-data\pgdata -U postgres -E UTF8 --locale=C --auth=scram-sha-256 --pwprompt
   ```

5. Append the settings in section 4 to the end of `C:\halifax-twin-data\pgdata\postgresql.conf`.
6. Create the password file (section 5), start the server (section 6) and build the database (section 7).

`--locale=C` gives byte-order sorting and avoids Windows locale names in the cluster. Text that people read is sorted in the application, not by the database.

## 4. Settings appended to `postgresql.conf`

The block at the end of the file, under "Halifax Digital Twin project instance (portable, user space)":

| Setting | Value | Why |
| :---- | :---- | :---- |
| `port` | 5433 | The existing Windows service already uses 5432. |
| `listen_addresses` | `'localhost'` | Only this machine can connect; nothing on the network. |
| `timezone` | `'UTC'` | Timestamps are stored and compared in UTC; Halifax time is the application's job when it displays them. |
| `log_timezone` | `'America/Halifax'` | Log lines read in local time when the architect checks them. |
| `shared_buffers` | 4GB | PostgreSQL's own page cache: one eighth of RAM, leaving room for Windows' file cache, the browser, Vite and CesiumJS on a shared workstation. |
| `effective_cache_size` | 16GB | Not an allocation: it tells the planner about half the RAM is likely to be caching data, so it prefers index scans. |
| `work_mem` | 64MB | Memory per sort or hash step in a query; large enough for GTFS stop-time sorts in memory, small enough that a few parallel queries cannot exhaust RAM. |
| `maintenance_work_mem` | 1GB | Faster index builds (including spatial GiST indexes) and vacuum after bulk loads; few of these run at once. |
| `max_wal_size` | 4GB | Fewer forced checkpoints during bulk loads such as the schedule loader's COPY of about 324,000 stop times. |

Everything else is the default (for example `max_connections` 100). Authentication is `scram-sha-256` for every connection (`pg_hba.conf`). Changing `port`, `listen_addresses` or `shared_buffers` needs a restart; the others take effect after `SELECT pg_reload_conf();`.

## 5. The password file

`psql` and `psycopg` read the password from `%APPDATA%\postgresql\pgpass.conf` by themselves, so no command, script or connection string contains it. The file has one line per server, in the form `host:port:database:user:password`, for example `localhost:5433:*:postgres:<the password>`.

- Only the architect edits this file. Agents never open, print or copy it.
- It must not be inside the repository or OneDrive.
- If `psql -w` says "fe_sendauth: no password supplied", the file is missing or its line does not match the host, port or user.

## 6. Start, stop and check the database

```powershell
$pg = 'C:\halifax-twin-data\pgsql\bin'

# Is it running?
& "$pg\pg_isready.exe" -h localhost -p 5433

# Start (returns once the server accepts connections)
& "$pg\pg_ctl.exe" -D C:\halifax-twin-data\pgdata -l C:\halifax-twin-data\logs\postgres.log start

# Stop (fast: rolls back open transactions and disconnects clients). Stop the collector first.
& "$pg\pg_ctl.exe" -D C:\halifax-twin-data\pgdata stop -m fast

# Status with process id
& "$pg\pg_ctl.exe" -D C:\halifax-twin-data\pgdata status

# Open a SQL prompt on the twin
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d halifax_twin
```

**After a reboot the database is not running.** It is not a Windows service. Start it with the command above before the collector, the API or any test. Two ways to make it start by itself:

- **Without administrator rights (recommended for now):** put a shortcut in the Startup folder (`Win + R`, type `shell:startup`) whose target is
  `C:\halifax-twin-data\pgsql\bin\pg_ctl.exe -D C:\halifax-twin-data\pgdata -l C:\halifax-twin-data\logs\postgres.log start`.
  It starts when the architect logs in.
- **As a Windows service (needs an administrator prompt):** `pg_ctl.exe register -N halifax-twin-pg16 -D C:\halifax-twin-data\pgdata -S auto`. The service account then needs full control of `C:\halifax-twin-data\pgdata` and write access to the log folder. Only do this if the architect wants the database up before login.

## 7. Build or rebuild `halifax_twin`

The database was built on 21 Nov 2026 and its smoke test passed. To rebuild it from nothing (this **deletes all collected data**; stop the collector and the API first):

```powershell
$pg = 'C:\halifax-twin-data\pgsql\bin'
cd C:\Users\emman\OneDrive\Documents\Project\Halifax_Twin_city\halifax-twin-city\database\sql

& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d postgres -c "DROP DATABASE IF EXISTS halifax_twin WITH (FORCE);"
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d postgres -f 00_create_database.sql
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d halifax_twin -f run_all.sql
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d halifax_twin -f 99_smoke_test.sql
```

The smoke test prints five checks and ends with "Everything above was rolled back." (`database/README.md` lists what each check shows.) After a rebuild, apply any loader reference rows again (workstream C regenerates `08_reference_data.sql`, which `run_all.sql` already includes) and reload the GTFS schedule (workstream B).

**Tests never use `halifax_twin`.** Each test suite makes its own scratch database, for example:

```powershell
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d postgres -c "CREATE DATABASE halifax_twin_test_api ENCODING 'UTF8' TEMPLATE template0;"
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d halifax_twin_test_api -f run_all.sql
# ... run the tests ...
& "$pg\psql.exe" -h localhost -p 5433 -U postgres -w -d postgres -c "DROP DATABASE halifax_twin_test_api WITH (FORCE);"
```

## 8. Environment variables

Set once, as user variables, then open a new terminal. Neither holds a secret.

```powershell
[Environment]::SetEnvironmentVariable('HALIFAX_TWIN_DB_URL', 'postgresql://postgres@localhost:5433/halifax_twin', 'User')
[Environment]::SetEnvironmentVariable('HALIFAX_TWIN_DATA_DIR', 'C:\halifax-twin-data', 'User')
```

`.env.example` at the repository root lists every variable the code reads. A local `.env` copy is git-ignored.

## 9. Set the Cesium ion token

Everything works without the token (2D only). To turn on realistic 3D:

1. On the Cesium ion website, **rotate** the token that was pasted into a chat on 20 Nov (delete it and create a new one), and restrict the new one to the local addresses the app uses (`http://localhost` and `http://127.0.0.1` with the Vite and API ports). Give it only the scopes the 3D view needs (reading assets, including Google Photorealistic 3D Tiles).
2. Store it as a user environment variable without it appearing on screen or in the PowerShell history:

   ```powershell
   $s = Read-Host 'Cesium ion token' -AsSecureString
   [Environment]::SetEnvironmentVariable('CESIUM_ION_TOKEN', [System.Net.NetworkCredential]::new('', $s).Password, 'User')
   Remove-Variable s
   ```

3. Open a new terminal and check that it is set, without printing it:

   ```powershell
   if ($env:CESIUM_ION_TOKEN) { 'token is set' } else { 'token is not set' }
   ```

4. Restart the API. Its `/v1/client-config` reports 3D as available, and gives the token only to requests from localhost.

Never paste the token into a chat, an issue, a pull request, a file in the repository or a screenshot.

## 10. Python and Node

```powershell
# Python: one virtual environment per service, created with 3.12
cd <repository>\services\api        # or services\collector
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Node: the web app
cd <repository>\apps\web
npm install
```

The Windows venv launcher starts two Python processes for one script; stopping a collector must stop both (learned in the demo). Port 8000 belongs to the older live-buses app; the serving API uses 8010.

## 11. Drive sync

`scripts/sync-drive.ps1` mirrors the Drive folder "Halifax Twin City" into `drive/` and `docs/` with `rclone sync`, then commits and pushes. `rclone sync` **deletes anything in `drive/` or `docs/` that is not on Drive**, so nothing is ever written there by hand or by an agent. The rclone remote's login lives in rclone's own config file in the user profile; never commit or print it.

## 12. What the architect must do by hand

| Task | Why it cannot be done for you |
| :---- | :---- |
| Rotate and restrict the Cesium ion token, then set `CESIUM_ION_TOKEN` (section 9) | Needs the architect's ion account; a token must never pass through a chat |
| Set `HALIFAX_TWIN_DB_URL` and `HALIFAX_TWIN_DATA_DIR` as user variables (section 8) | Not set yet on 21 Nov; harmless, but each tool otherwise relies on its own default |
| Decide how the database starts after a reboot: Startup shortcut, service, or by hand (section 6) | A service needs administrator rights |
| Decide whether the machine stays on, awake and logged in day and night | Gate 0 needs 48 hours with no gap over 2 minutes; Windows sleep settings stop the collector |
| Approve and run `scripts/collector-register-task.ps1` (written by workstream B) | It changes Task Scheduler on the architect's account |
| Install Blender (free, blender.org) when the pin work (T30) starts | System software; not needed for release 1 |
| Keep the password file up to date if the `postgres` password changes (section 5) | Only the architect handles the password |

## 13. Troubleshooting

| Symptom | Cause and fix |
| :---- | :---- |
| `CREATE EXTENSION postgis` fails: "The specified module could not be found" | The PostGIS bundle's `libcurl.dll` is in `bin`. Restore the EDB copy (section 3, step 3). |
| `pg_isready` says "no response" after a reboot | The portable server does not start by itself. Start it (section 6). |
| `pg_ctl start` fails, log says the port is in use | Another server is on 5433; check `Get-NetTCPConnection -LocalPort 5433`. The Windows service is on 5432 and is not the cause. |
| `psql` asks for a password or says "no password supplied" | The password file is missing or does not match `localhost:5433` (section 5). |
| Connected but tables are missing | You are on port 5432 (the other server) or the `postgres` database. Use `-p 5433 -d halifax_twin`. |
| A config file read by Python fails on its first character | PowerShell 5.1 saved it with a byte order mark. Readers must accept it (`encoding='utf-8-sig'`). |
