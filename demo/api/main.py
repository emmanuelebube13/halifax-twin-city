"""Halifax Digital Twin demo: one process that serves the read-only API and the web page.

Start it with demo/start.ps1. By hand, from the demo folder:
    .venv\\Scripts\\python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
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


NOW_SQL = """
WITH pos AS (
    SELECT count(DISTINCT vehicle_asset_id) AS buses, max(position_ts) AS newest
      FROM silver.vehicle_position WHERE position_ts > now() - interval '3 minutes'
),
arr AS (
    SELECT count(reported_delay_seconds) AS arrivals,
           count(*) FILTER (WHERE reported_delay_seconds BETWEEN %(early)s AND %(late)s) AS on_time,
           count(*) FILTER (WHERE reported_delay_seconds > %(late)s) AS late,
           count(*) FILTER (WHERE reported_delay_seconds < %(early)s) AS early,
           max(e.event_start_ts) AS newest
      FROM silver.stop_arrival sa JOIN silver.event e USING (event_id)
     WHERE e.event_start_ts > now() - interval '30 minutes'
),
alr AS (
    SELECT count(*) AS active FROM silver.event
     WHERE source_id = 'SRC-003' AND event_type_code = 'Service Alert' AND event_status_code = 'Active'
),
sched AS (
    SELECT count(DISTINCT scheduled_trip_id) AS trips_today
      FROM gold.planned_stop_time((now() AT TIME ZONE 'America/Halifax')::date)
     WHERE stop_sequence_number = 1
)
SELECT pos.buses, pos.newest, arr.arrivals, arr.on_time, arr.late, arr.early, arr.newest,
       alr.active, sched.trips_today
  FROM pos, arr, alr, sched
"""


def live_transit(database_url: str | None, rules: dict) -> dict:
    """Transportation numbers for the side panel. Never raises: a failure comes back as available = false."""
    if not database_url:
        return {"available": False, "message": "Database not configured."}
    on_time = rules.get("on_time", {})
    try:
        import psycopg
        with psycopg.connect(database_url, connect_timeout=3) as conn:
            r = conn.execute(NOW_SQL, {"early": on_time.get("early_limit_seconds", -60),
                                       "late": on_time.get("late_limit_seconds", 300)}).fetchone()
    except Exception as e:
        return {"available": False, "message": type(e).__name__ + ": " + str(e).strip()[:300]}
    buses, pos_ts, arrivals, ok, late, early, arr_ts, alerts, trips_today = r
    as_of = max([t for t in (pos_ts, arr_ts) if t], default=None)
    return {
        "available": True,
        "as_of": as_of.astimezone(HALIFAX).isoformat(timespec="seconds") if as_of else None,
        "buses_live": buses,
        "arrivals_last_30_min": arrivals,
        "on_time": ok, "late": late, "early": early,
        "on_time_percent": round(100 * ok / arrivals, 1) if arrivals else None,
        "alerts_active": alerts,
        "trips_planned_today": trips_today,
        "on_time_rule": f"{-on_time.get('early_limit_seconds', -60)} s early to {on_time.get('late_limit_seconds', 300)} s late",
        "sources": ["SRC-001 vehicle positions", "SRC-002 trip updates", "SRC-003 service alerts", "SRC-004 GTFS schedule"],
        "reliability_tier": "Tier 1 – Official",
        "attribution": ATTRIBUTION,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Halifax Digital Twin demo API", version=APP_VERSION,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.settings = settings

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app_version": APP_VERSION, "as_of": halifax_now(),
                "database": check_database(settings.database_url), "attribution": ATTRIBUTION}

    @app.get("/api/now")
    def now_in_halifax():
        """Live numbers per sector for the side panel. Public Works and Housing arrive with D06 and D07."""
        return {"as_of": halifax_now(),
                "transportation": live_transit(settings.database_url, settings.business_rules),
                "public_works": {"available": False, "message": "Arrives with task D06."},
                "housing": {"available": False, "message": "Arrives with task D07."}}

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
