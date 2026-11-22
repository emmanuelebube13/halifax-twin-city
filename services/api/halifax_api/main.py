"""Halifax Digital Twin serving API, contract v0 (engineering/contract/openapi.yaml).

Read-only. Every response, errors included, is the envelope: data, as_of, source, reliability_tier, licence.
Start (from services/api):
    .venv\\Scripts\\python -m uvicorn halifax_api.main:app --host 127.0.0.1 --port 8010
"""
from __future__ import annotations

import datetime as dt
import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import features, layers, numbers, sources, stories
from .config import AppConfig, load_config
from .db import Database, SourceUnavailable
from .envelope import LICENCE, SourceRegister, TTLCache, envelope, iso, now_iso
from .settings import Settings, load_settings

VERSION = "0.1.0"
log = logging.getLogger("halifax_api")
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
HALIFAX = ZoneInfo("America/Halifax")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, source_ids=()):
        self.status, self.code, self.message, self.source_ids = status, code, message, list(source_ids)


def not_found(message: str) -> ApiError:
    return ApiError(404, "not_found", message)


UNAVAILABLE = "This data cannot be read right now. Other layers are not affected."


def is_local_request(request: Request, allowed_origins) -> bool:
    """True only for a caller on this computer whose page (if any) is also served from this computer."""
    host = request.client.host if request.client else None
    if host not in LOCAL_HOSTS:
        return False
    origin = request.headers.get("origin")
    if origin and origin not in allowed_origins and origin not in ("http://127.0.0.1:8010", "http://localhost:8010"):
        return False
    return True


def create_app(settings: Settings | None = None, database: Database | None = None,
               config: AppConfig | None = None) -> FastAPI:
    settings = settings or load_settings()
    cfg = config or load_config(settings.config_dir)
    db = database or Database(settings.database_url)
    cache = TTLCache()
    register = SourceRegister(db, cache)

    @asynccontextmanager
    async def lifespan(app):
        db.open()
        yield
        db.close()

    app = FastAPI(title="Halifax Digital Twin serving API", version=VERSION, lifespan=lifespan,
                  docs_url="/v1/docs", redoc_url=None, openapi_url="/v1/openapi.json")
    app.state.settings, app.state.config, app.state.db, app.state.cache = settings, cfg, db, cache
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET"],
                       allow_headers=["*"], allow_credentials=False)

    def ok(data, as_of, source_ids):
        return envelope(data, as_of, source_ids, register)

    # ------------------------------------------------------------------ errors, always in the envelope

    def error_body(status, code, message, source_ids=()):
        return JSONResponse(envelope(None, None, list(source_ids), register if code != "internal_error" else None,
                                     error={"code": code, "message": message}), status_code=status)

    @app.exception_handler(ApiError)
    async def api_error(request, exc: ApiError):
        return error_body(exc.status, exc.code, exc.message, exc.source_ids)

    @app.exception_handler(SourceUnavailable)
    async def unavailable(request, exc):
        return error_body(503, "source_unavailable", UNAVAILABLE)

    @app.exception_handler(RequestValidationError)
    async def bad_request(request, exc):
        fields = sorted({str(e.get("loc", ["?"])[-1]) for e in exc.errors()})
        return error_body(400, "bad_request", "Check these parameters: " + ", ".join(fields) + ".")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        if exc.status_code == 404:
            return error_body(404, "not_found", "There is nothing at this address.")
        if exc.status_code == 405:
            return error_body(405, "bad_request", "This API is read-only. Use GET.")
        return error_body(exc.status_code, "bad_request", "The request could not be served.")

    @app.exception_handler(Exception)
    async def internal(request, exc):
        log.exception("unhandled error on %s", request.url.path)
        return error_body(500, "internal_error", "Something went wrong on the server. It has been logged.")

    # ------------------------------------------------------------------ operational

    @app.get("/v1/health")
    def health():
        reachable, postgis, gold = False, None, False
        try:
            r = db.fetch_one("""SELECT (SELECT extversion FROM pg_extension WHERE extname = 'postgis'),
                                       to_regprocedure('gold.planned_stop_time(date)') IS NOT NULL""")
            reachable, postgis, gold = True, r[0], bool(r[1])
        except SourceUnavailable:
            pass
        return envelope({"status": "ok" if reachable else "degraded", "version": VERSION,
                         "database": {"reachable": reachable, "postgis_version": postgis},
                         "gold_planned_stop_time": gold}, now_iso(), [], None)

    @app.get("/v1/client-config")
    def client_config(request: Request):
        token = settings.cesium_ion_token if is_local_request(request, settings.cors_origins) else None
        if token:
            note = None
        elif settings.cesium_ion_token:
            note = "3D is available only on the computer that runs the API."
        else:
            note = "3D needs a Cesium ion token on this computer. 2D works without it."
        live = cfg.live
        return envelope({
            "three_d_available": bool(token),
            "three_d_note": note,
            "cesium_ion_token": token,
            "cesium_photorealistic_asset_id": settings.cesium_photorealistic_asset_id,
            "time_zone": cfg.rules.get("display", {}).get("time_zone", "America/Halifax"),
            "stale_after_seconds": int(live.get("stale_after_seconds", 120)),
            "live_refresh_seconds": int(live.get("refresh_seconds", 15)),
            "business_rules": cfg.rules,
            "attribution": LICENCE,
        }, now_iso(), [], None)

    # ------------------------------------------------------------------ register

    def resolved_stories() -> dict[str, dict]:
        def compute():
            return {sid: stories.resolve(db, s) for sid, s in cfg.stories.items()}
        return cache.get("stories", 60, compute)

    @app.get("/v1/sectors")
    def sectors():
        by_sector: dict[str, list[dict]] = {}
        for s in resolved_stories().values():
            by_sector.setdefault(s["sector_id"], []).append(s)
        out = []
        for sec in cfg.sectors["sectors"]:
            own = by_sector.get(sec["sector_id"], [])
            out.append({**sec, "status": "live" if any(s["status"] == "live" for s in own) else "planned",
                        "story_ids": [s["id"] for s in own]})
        return envelope({"max_pins": cfg.sectors.get("max_pins", 5), "groups": cfg.sectors["groups"],
                         "sectors": out}, now_iso(), [], None)

    @app.get("/v1/stories")
    def list_stories():
        data = [stories.summary(s) for s in resolved_stories().values()]
        ids = [sid for s in cfg.stories.values() for sid in s.get("trust", {}).get("source_ids", [])]
        return ok(data, now_iso(), ids)

    @app.get("/v1/stories/{story_id}")
    def get_story(story_id: str = Path(pattern=r"^[A-Z]{3}-Q[0-9]{2}$")):
        story = resolved_stories().get(story_id)
        if not story:
            raise not_found(f"There is no story {story_id}.")
        return ok(story, now_iso(), story.get("trust", {}).get("source_ids", []))

    # ------------------------------------------------------------------ map layers

    @app.get("/v1/live/{layer}")
    def live(layer: str):
        conf = cfg.live_layers.get(layer)
        if not conf:
            raise not_found(f"There is no live layer called {layer}.")
        window = int(cfg.live.get("vehicle_window_seconds", 180))
        try:
            fc, as_of, seen = cache.get(("live", layer), conf.get("cache_seconds", 5),
                                        lambda: layers.vehicles(db, window, cfg.on_time))
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, conf.get("source_ids", []))
        return ok(fc, as_of, conf.get("source_ids", []) + seen)

    def parse_bbox(bbox: str | None):
        if not bbox:
            return None
        try:
            w, s, e, n = (float(x) for x in bbox.split(","))
        except ValueError:
            raise ApiError(400, "bad_request", "bbox must be west,south,east,north in degrees.")
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise ApiError(400, "bad_request", "bbox must be west,south,east,north in degrees.")
        return w, s, e, n

    @app.get("/v1/layers/{layer}")
    def get_layer(layer: str, bbox: str | None = Query(None, max_length=100),
                  limit: int = Query(5000, ge=1, le=10000)):
        conf = cfg.layers.get(layer)
        if not conf:
            raise not_found(f"There is no layer called {layer}.")
        box = parse_bbox(bbox)
        try:
            if conf.get("gold_measure"):
                today = dt.datetime.now(HALIFAX).date()
                thresholds = cfg.rules.get("transit_measures", {})
                compute = lambda: layers.gold_stop_layer(db, layer, conf, limit, today, thresholds)  # noqa: E731
            else:
                compute = lambda: layers.generic_layer(db, layer, conf, box, limit)  # noqa: E731
            fc, as_of, seen = cache.get(("layer", layer, box, limit), conf.get("cache_seconds", 60), compute)
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, conf.get("source_ids", []))
        return ok(fc, as_of, conf.get("source_ids", []) + seen)

    @app.get("/v1/replay/{layer}")
    def get_replay(layer: str, minutes: int = Query(30, ge=1, le=60)):
        conf = cfg.live_layers.get(layer)
        if not conf:
            raise not_found(f"There is no replay for {layer}.")
        end = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        start = end - dt.timedelta(minutes=minutes)
        try:
            tracks, as_of = cache.get(("replay", layer, minutes), 10, lambda: layers.replay(db, start, end))
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, conf.get("source_ids", []))
        return ok({"layer": layer, "minutes": minutes, "from": iso(start), "to": iso(end), "tracks": tracks},
                  as_of, conf.get("source_ids", []))

    # ------------------------------------------------------------------ numbers, features, sources

    @app.get("/v1/numbers/{number_id}")
    def get_number(number_id: str = Path(pattern=r"^[a-z]{3}\.[a-z0-9_]+$")):
        d = numbers.NUMBERS.get(number_id)
        if not d:
            raise not_found(f"There is no number {number_id}.")
        try:
            value, series, as_of = cache.get(("number", number_id), d.cache_seconds, lambda: d.compute(db, cfg))
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, d.source_ids)
        data = {"id": d.id, "label": d.label, "value": value, "unit": d.unit, "window": d.window}
        if d.rule:
            data["rule"] = d.rule(cfg)
        if series is not None:
            data["series"] = series
        return ok(data, as_of, d.source_ids)

    @app.get("/v1/features/{kind}/{feature_id}")
    def get_feature(kind: str, feature_id: int = Path(ge=1)):
        fn = features.DETAIL.get(kind)
        if not fn:
            raise not_found("kind must be location, asset or event.")
        found = fn(db, feature_id)
        if not found:
            raise not_found(f"There is no {kind} {feature_id}.")
        feature, as_of, source_ids = found
        return ok(feature, as_of, source_ids)

    @app.get("/v1/sources")
    def get_sources():
        data = sources.list_sources(db, int(cfg.live.get("stale_after_seconds", 120)))
        return envelope(data, now_iso(), [], None)

    return app


app = create_app()
