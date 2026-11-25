"""Halifax Digital Twin serving API, contract v0 (engineering/contract/openapi.yaml).

Read-only. Every response, errors included, is the envelope: data, as_of, source, reliability_tier, licence.
Start (from services/api):
    .venv\\Scripts\\python -m uvicorn halifax_api.main:app --host 127.0.0.1 --port 8010
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import pathlib
import threading
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import features, layers, numbers, sources, stories
from .config import AppConfig, load_config
from .db import Database, SourceUnavailable
from .envelope import LICENCE, SourceRegister, TTLCache, envelope, iso, json_value, now_iso
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
THREE_D_LIMIT_NOTE = "3D has reached today's limit, which keeps it free. It comes back tomorrow. The 2D map shows everything."


# Headers that a proxy or tunnel adds. Through a Cloudflare Tunnel every visitor reaches the API from
# 127.0.0.1, so a request carrying any of these came from the internet, not from this computer.
PROXY_HEADERS = ("cf-connecting-ip", "cf-ray", "x-forwarded-for", "x-real-ip", "forwarded")


def is_local_request(request: Request, allowed_origins) -> bool:
    """True only for a caller on this computer whose page (if any) is also served from this computer."""
    host = request.client.host if request.client else None
    if host not in LOCAL_HOSTS:
        return False
    if any(h in request.headers for h in PROXY_HEADERS):
        return False
    origin = request.headers.get("origin")
    local_pages = tuple(o for o in allowed_origins if o.startswith("http://")) + ("http://127.0.0.1:8010", "http://localhost:8010")
    if origin and origin not in local_pages:
        return False
    return True


class DailyCounter:
    """Counts public 3D opens per Halifax day, kept in a small file so a restart does not reset it."""

    def __init__(self, path: pathlib.Path | None, limit: int):
        self.path, self.limit = path, limit
        self.lock = threading.Lock()
        self.day, self.count = "", 0
        if path and path.exists():
            try:
                saved = json.loads(path.read_text(encoding="utf-8"))
                self.day, self.count = str(saved.get("day", "")), int(saved.get("count", 0))
            except (ValueError, OSError):
                pass

    def take(self, today: str) -> bool:
        """Uses one of today's opens. False once today's limit is reached."""
        with self.lock:
            if self.day != today:
                self.day, self.count = today, 0
            if self.count >= self.limit:
                return False
            self.count += 1
            if self.path:
                try:
                    self.path.write_text(json.dumps({"day": self.day, "count": self.count}), encoding="utf-8")
                except OSError:
                    log.warning("could not save the 3D count")
            return True

    def left(self, today: str) -> int:
        with self.lock:
            return self.limit if self.day != today else max(0, self.limit - self.count)


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
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET"],
                       allow_headers=["*"], allow_credentials=False)

    def ok(data, as_of, source_ids):
        return envelope(data, as_of, source_ids, register)

    def respond(request: Request, body: dict, max_age: int = 0, private: bool = False) -> Response:
        raw = json.dumps(body, default=json_value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if private:
            return Response(content=raw, media_type="application/json", headers={"Cache-Control": "private, no-store"})
        etag = f'W/"{hashlib.blake2b(raw, digest_size=8).hexdigest()}"'
        # s-maxage is for Cloudflare's edge only (browsers ignore it): even "always fresh" answers such as the
        # live buses are shared for a few seconds there, so thousands of visitors make a handful of requests here.
        cc = f"public, max-age={max_age}, s-maxage={max(max_age, 5)}" if max_age > 0 else "public, max-age=0, s-maxage=5"
        headers = {"ETag": etag, "Cache-Control": cc}
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        return Response(content=raw, media_type="application/json", headers=headers)

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
    def health(request: Request):
        reachable, postgis, gold = False, None, False
        try:
            r = db.fetch_one("""SELECT (SELECT extversion FROM pg_extension WHERE extname = 'postgis'),
                                       to_regprocedure('gold.planned_stop_time(date)') IS NOT NULL""")
            reachable, postgis, gold = True, r[0], bool(r[1])
        except SourceUnavailable:
            pass
        return respond(
            request,
            envelope({"status": "ok" if reachable else "degraded", "version": VERSION,
                      "database": {"reachable": reachable, "postgis_version": postgis},
                      "gold_planned_stop_time": gold}, now_iso(), [], None),
            max_age=0,
        )

    three_d_count = DailyCounter(settings.three_d_counter_file, settings.three_d_daily_limit)

    def halifax_today() -> str:
        return dt.datetime.now(HALIFAX).date().isoformat()

    def allowed_public_page(request: Request) -> bool:
        return request.headers.get("origin") in settings.public_origins

    @app.get("/v1/three-d/token")
    def three_d_token(request: Request):
        """The 3D token, asked for each time someone opens 3D. On this computer it is the local token; for a
        public visitor it is the public token, counted against today's limit."""
        if is_local_request(request, settings.cors_origins) and settings.cesium_ion_token:
            token = settings.cesium_ion_token
        elif settings.public_cesium_ion_token and allowed_public_page(request):
            if not three_d_count.take(halifax_today()):
                raise ApiError(429, "three_d_limit", THREE_D_LIMIT_NOTE)
            token = settings.public_cesium_ion_token
        else:
            raise ApiError(403, "three_d_unavailable", "3D is not offered here. The 2D map shows everything.")
        return respond(request, envelope({"cesium_ion_token": token}, now_iso(), [], None), private=True)

    @app.get("/v1/client-config")
    def client_config(request: Request):
        local = is_local_request(request, settings.cors_origins)
        token = settings.cesium_ion_token if local else None
        # public visitors never get a token here; they ask /v1/three-d/token when they open 3D
        on_request = (not local and bool(settings.public_cesium_ion_token) and allowed_public_page(request)
                      and three_d_count.left(halifax_today()) > 0)
        if token or on_request:
            note = None
        elif not local and settings.public_cesium_ion_token and allowed_public_page(request):
            note = THREE_D_LIMIT_NOTE
        elif settings.cesium_ion_token:
            note = "3D is available only on the computer that runs the API."
        else:
            note = "3D needs a Cesium ion token on this computer. 2D works without it."
        live = cfg.live
        return respond(
            request,
            envelope({
                "three_d_available": bool(token) or on_request,
                "three_d_on_request": on_request,
                "three_d_note": note,
                "cesium_ion_token": token,
                "cesium_photorealistic_asset_id": settings.cesium_photorealistic_asset_id,
                "time_zone": cfg.rules.get("display", {}).get("time_zone", "America/Halifax"),
                "stale_after_seconds": int(live.get("stale_after_seconds", 120)),
                "live_refresh_seconds": int(live.get("refresh_seconds", 15)),
                "business_rules": cfg.rules,
                "attribution": LICENCE,
            }, now_iso(), [], None),
            private=True,
        )

    # ------------------------------------------------------------------ register

    def resolved_stories() -> tuple[dict[str, dict], str]:
        def compute():
            return stories.resolve_all(db, cfg.stories), now_iso()
        return cache.get("stories", 60, compute)

    @app.get("/v1/sectors")
    def sectors(request: Request):
        resolved, as_of = resolved_stories()
        by_sector: dict[str, list[dict]] = {}
        for s in resolved.values():
            by_sector.setdefault(s["sector_id"], []).append(s)
        out = []
        for sec in cfg.sectors["sectors"]:
            own = by_sector.get(sec["sector_id"], [])
            out.append({**sec, "status": "live" if any(s["status"] == "live" for s in own) else "planned",
                        "story_ids": [s["id"] for s in own]})
        return respond(
            request,
            envelope({"max_pins": cfg.sectors.get("max_pins", 5), "groups": cfg.sectors["groups"],
                      "sectors": out}, as_of, [], None),
            max_age=30,
        )

    @app.get("/v1/stories")
    def list_stories(request: Request):
        resolved, as_of = resolved_stories()
        data = [stories.summary(s) for s in resolved.values()]
        ids = [sid for s in cfg.stories.values() for sid in s.get("trust", {}).get("source_ids", [])]
        return respond(request, ok(data, as_of, ids), max_age=30)

    @app.get("/v1/stories/{story_id}")
    def get_story(request: Request, story_id: str = Path(pattern=r"^[A-Z]{3}-Q[0-9]{2}$")):
        resolved, as_of = resolved_stories()
        story = resolved.get(story_id)
        if not story:
            raise not_found(f"There is no story {story_id}.")
        return respond(request, ok(story, as_of, story.get("trust", {}).get("source_ids", [])), max_age=30)

    # ------------------------------------------------------------------ map layers

    @app.get("/v1/live/{layer}")
    def live(request: Request, layer: str):
        conf = cfg.live_layers.get(layer)
        if not conf:
            raise not_found(f"There is no live layer called {layer}.")
        window = int(cfg.live.get("vehicle_window_seconds", 180))
        try:
            fc, as_of, seen = cache.get(("live", layer), conf.get("cache_seconds", 5),
                                        lambda: layers.vehicles(db, window, cfg.on_time))
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, conf.get("source_ids", []))
        return respond(request, ok(fc, as_of, conf.get("source_ids", []) + seen), max_age=0)

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
    def get_layer(request: Request, layer: str, bbox: str | None = Query(None, max_length=100),
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
        return respond(
            request,
            ok(fc, as_of, conf.get("source_ids", []) + seen),
            max_age=min(int(conf.get("cache_seconds", 60)), 300),
        )

    @app.get("/v1/replay/{layer}")
    def get_replay(request: Request, layer: str, minutes: int = Query(30, ge=1, le=60)):
        conf = cfg.live_layers.get(layer)
        if not conf:
            raise not_found(f"There is no replay for {layer}.")
        end = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        start = end - dt.timedelta(minutes=minutes)
        try:
            tracks, as_of = cache.get(("replay", layer, minutes), 10,
                                      lambda: layers.replay(db, start, end, cfg.on_time))
        except SourceUnavailable:
            raise ApiError(503, "source_unavailable", UNAVAILABLE, conf.get("source_ids", []))
        return respond(
            request,
            ok({"layer": layer, "minutes": minutes, "from": iso(start), "to": iso(end), "tracks": tracks},
               as_of, conf.get("source_ids", [])),
            max_age=10,
        )

    # ------------------------------------------------------------------ numbers, features, sources

    @app.get("/v1/numbers/{number_id}")
    def get_number(request: Request, number_id: str = Path(pattern=r"^[a-z]{3}\.[a-z0-9_]+$")):
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
        return respond(request, ok(data, as_of, d.source_ids), max_age=min(int(d.cache_seconds), 300))

    @app.get("/v1/features/{kind}/{feature_id}")
    def get_feature(request: Request, kind: str, feature_id: int = Path(ge=1)):
        fn = features.DETAIL.get(kind)
        if not fn:
            raise not_found("kind must be location, asset or event.")
        def compute():
            if kind == "asset":
                return fn(db, feature_id, live=(int(cfg.live.get("vehicle_window_seconds", 180)), cfg.on_time))
            return fn(db, feature_id)
        found = cache.get(("feature", kind, feature_id), 10, compute)
        if not found:
            raise not_found(f"There is no {kind} {feature_id}.")
        feature, as_of, source_ids = found
        return respond(request, ok(feature, as_of, source_ids), max_age=10)

    @app.get("/v1/sources")
    def get_sources(request: Request):
        stale_after = int(cfg.live.get("stale_after_seconds", 120))
        data, as_of = cache.get(
            ("sources", stale_after),
            15,
            lambda: (sources.list_sources(db, stale_after), now_iso()),
        )
        return respond(request, envelope(data, as_of, [], None), max_age=10)

    return app


app = create_app()
