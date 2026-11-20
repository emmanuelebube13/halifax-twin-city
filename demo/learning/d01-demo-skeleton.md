# D01: demo skeleton and start script

20 Nov 2026 · Task D01 of the demo build

## What was built and why

The demo needs one place for its code and one command to start it, before any data or map work begins. D01 builds that empty shell:

| Piece | What it does | Why |
| --- | --- | --- |
| `demo/start.ps1` | Creates `demo\.venv`, installs packages only when `requirements.txt` changes, checks the port, starts the app, opens the browser | One command, the same every time (brief: "easy to start") |
| `demo/api/main.py` | A FastAPI app with `/api/health`, `/api/config` and the web page | API and page in one process, so there is only one thing to start |
| `demo/api/settings.py` | Reads `config.local.json`, then environment variables | Secrets stay out of the public repository |
| `demo/config.example.json` | Placeholder config, safe to commit | Shows what to fill in without leaking anything |
| `demo/config/business-rules.yaml` | On time, frequent service, 5-minute walk | Interim rules live in one file the architect owns, not in code |
| `demo/web/` | Header, sector rail, Live lens, side panel from wireframe 01 | The frame that D09 fills with the map |
| `demo/tests/test_app.py` | 7 tests | Proves the shell starts, and the token never leaves this PC |

### Three ideas worth knowing

**1. The app must open even when things are broken.** `/api/health` tries the database with a 3-second timeout and reports the result. It never raises. The demo is shown live, so a stopped PostgreSQL service should show "Not reachable", not a blank page. D11 uses the same idea per layer.

**2. The token only goes to this PC.** `/api/config` checks who is asking (`request.client.host`). Only `127.0.0.1` or `::1` gets the Cesium token. The server also listens only on `127.0.0.1`, so other machines can't reach it at all. That's two locks on one door.

**3. Settings in layers.** Defaults in code, then `config.local.json`, then environment variables. Placeholders such as `YOUR_PASSWORD` are treated as "not set", so a copied but unedited example file can't be mistaken for real settings.

## How to run it

```powershell
powershell -ExecutionPolicy Bypass -File demo\start.ps1
```

If the live-buses collector is still running on port 8000, the script says so and stops. Use another port:

```powershell
powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Port 8010
```

Run the tests:

```powershell
powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Test
```

Open http://localhost:8000/api/docs to try the API in the browser.

## Hands-on exercise

Connect the shell to your database and watch the health check change.

1. Copy `demo\config.example.json` to `demo\config.local.json`.
2. Put your real `postgres` password into `database_url`. Leave the token placeholder as it is.
3. Start the demo. In the side panel, **Database** should read `halifax_twin: 63 silver tables, PostGIS 3.x`.
4. Check the count yourself in psql:

   ```sql
   SELECT count(*)
   FROM information_schema.tables
   WHERE table_schema = 'silver'
     AND table_type = 'BASE TABLE'
     AND table_name NOT LIKE '%\_hist'
     AND table_name NOT LIKE 'vehicle\_position\_%';
   ```

   Why do the two `NOT LIKE` lines matter? Remove them one at a time and explain the new number, using what you know about the `_hist` tables and the monthly partitions.
5. Stop the PostgreSQL service (Services, `postgresql-x64-18`), wait 30 seconds, and watch the page. The app should keep running and the Database line should turn to "Not reachable". Start the service again.
