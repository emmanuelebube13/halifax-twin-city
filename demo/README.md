# Halifax Digital Twin: demo build

A working demo of the Halifax Digital Twin across its three Phase 1 domains (Transportation, Public Works, Housing and Real Estate), running on one Windows PC. It follows the Drive document *00 Start here: agent brief, DEMO build*. The main build follows the original brief and task cards; nothing here changes them.

## Start it

From the repository folder, in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File demo\start.ps1
```

The first run takes a few minutes: it creates `demo\.venv` and installs the packages. After that it starts in seconds. The browser opens http://localhost:8010. Stop with Ctrl+C.

| Option | Does |
| --- | --- |
| `-Port 8020` | Use another port (default 8010) |
| `-NoBrowser` | Don't open the browser |
| `-Reinstall` | Rebuild `demo\.venv` from scratch |
| `-Test` | Run the tests instead of the app |

## Configure it (once, on the demo PC)

Copy `demo\config.example.json` to `demo\config.local.json` and fill in:

- `database_url`: your `halifax_twin` connection string with the real `postgres` password;
- `cesium_ion_token`: your Cesium ion token (restrict it to localhost in the ion dashboard);
- `cesium_photorealistic_asset_id`: the Google Photorealistic 3D Tiles asset ID from the ion Asset Depot.

`config.local.json` is in `.gitignore`. Never commit it, and never paste the token into a document or a chat. The environment variables `HALIFAX_TWIN_DB_URL` and `CESIUM_ION_TOKEN` override the file.

Without the file the app still starts: 2D only, no database.

## Folders

```
demo/
├── start.ps1              one command: venv, packages, app
├── requirements.txt
├── config.example.json    copy to config.local.json (ignored by git)
├── config/
│   └── business-rules.yaml  interim rules: on time, frequent service, 5-minute walk
├── api/                   FastAPI app: /api/* plus the web page
├── web/                   plain HTML, CSS and JavaScript modules, no build step
├── loaders/               one module per source (D02 to D07)
├── tests/
└── learning/              one learning note per task
```

## API so far

| Endpoint | Returns |
| --- | --- |
| `/api/health` | App version, Halifax time, database check, attribution |
| `/api/config` | 3D availability, business rules; the Cesium token only for requests from this PC |
| `/api/docs` | Interactive API documentation |

Contains information licensed under the Open Government Licence – Halifax.
