"""Halifax Digital Twin demo: one process that serves the read-only API and the web page.

Start it with demo/start.ps1. By hand, from the demo folder:
    .venv\\Scripts\\python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .settings import WEB_DIR, Settings, load_settings

APP_VERSION = "0.1.0-d01"
HALIFAX = ZoneInfo("America/Halifax")
LOCAL_CLIENTS = {"127.0.0.1", "::1", "localhost"}
ATTRIBUTION = "Contains information licensed under the Open Government Licence – Halifax."


def halifax_now() -> str:
    """Current time in Halifax, ISO 8601 with offset (shown on screen as 24-hour time)."""
    return dt.datetime.now(HALIFAX).isoformat(timespec="seconds")


def check_database(database_url: str | None) -> dict:
    """Try the database without ever failing the app. The demo must open even if PostgreSQL is down."""
    if not database_url:
        return {"configured": False, "reachable": False,
                "message": "No database_url in demo/config.local.json or HALIFAX_TWIN_DB_URL."}
    try:
        import psycopg
        with psycopg.connect(database_url, connect_timeout=3) as conn:
            row = conn.execute(
                """SELECT current_database(),
                          (SELECT extversion FROM pg_extension WHERE extname = 'postgis'),
                          (SELECT count(*) FROM information_schema.tables
                            WHERE table_schema = 'silver' AND table_type = 'BASE TABLE'
                              AND table_name NOT LIKE '%\\_hist' ESCAPE '\\'
                              AND table_name NOT LIKE 'vehicle\\_position\\_%' ESCAPE '\\')""").fetchone()
        return {"configured": True, "reachable": True, "database": row[0],
                "postgis_version": row[1], "silver_table_count": row[2]}
    except Exception as e:  # report, never raise
        return {"configured": True, "reachable": False, "message": type(e).__name__ + ": " + str(e).strip()[:300]}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Halifax Digital Twin demo API", version=APP_VERSION,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.settings = settings

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app_version": APP_VERSION, "as_of": halifax_now(),
                "database": check_database(settings.database_url), "attribution": ATTRIBUTION}

    @app.get("/api/config")
    def config(request: Request):
        """Settings the page needs. The Cesium token goes to the page only when it is opened on this PC."""
        is_local = request.client is not None and request.client.host in LOCAL_CLIENTS
        token = settings.cesium_ion_token if is_local else None
        return {"as_of": halifax_now(),
                "cesium_ion_token": token,
                "cesium_photorealistic_asset_id": settings.cesium_photorealistic_asset_id,
                "three_d_available": bool(token),
                "business_rules": settings.business_rules}

    # The web page. Mounted last so /api/* routes win.
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
