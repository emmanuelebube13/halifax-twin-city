"""Configuration uses the logical model's physical names exactly, and every story is well formed."""
from __future__ import annotations

import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import psycopg
import pytest
from psycopg_pool import PoolTimeout

from halifax_api import stories
from halifax_api.config import load_config
from halifax_api.db import Database, SourceUnavailable
from halifax_api.envelope import TTLCache
from halifax_api.settings import REPO_DIR, Settings

SILVER_SQL = (REPO_DIR / "database" / "sql" / "02_silver_tables.sql").read_text(encoding="utf-8")


def silver_columns(table: str) -> set[str]:
    m = re.search(rf"CREATE TABLE silver\.{table} \((.*?)\n\)", SILVER_SQL, re.S)
    assert m, f"silver.{table} is not in the physical model"
    return {line.split()[0] for line in m.group(1).splitlines() if line.strip() and not line.strip().startswith("CONSTRAINT")}


def test_layer_columns_exist_in_the_model():
    cfg = load_config(REPO_DIR / "config")
    for name, layer in cfg.layers.items():
        if layer.get("subtype_table"):
            cols = silver_columns(layer["subtype_table"])
            for col in layer.get("subtype_columns", []) + ([layer["positive_column"]] if layer.get("positive_column") else []):
                assert col in cols, (name, col)


def test_story_ids_and_sectors_match_reference_data():
    cfg = load_config(REPO_DIR / "config")
    ref = (REPO_DIR / "database" / "sql" / "08_reference_data.sql").read_text(encoding="utf-8")
    sector_ids = {s["sector_id"] for s in cfg.sectors["sectors"]}
    assert len(sector_ids) == 17
    for sid in sector_ids:
        assert f"('{sid}'," in ref
    for sector in cfg.sectors["sectors"]:
        assert f"('{sector['sector_id']}', '{sector['name']}'" in ref, sector
    for story in cfg.stories.values():
        assert story["sector_id"] in sector_ids
        assert f"('{story['subsector_id']}', '{story['sector_id']}'" in ref, story["id"]
        assert story["status"] in {"live", "planned", "collecting_data", "source_incomplete"}
        if story["status"] != "live":
            assert story.get("status_note"), story["id"]


def test_settings_never_show_the_token():
    s = Settings(database_url="postgresql://postgres@localhost:5433/x", config_dir=REPO_DIR / "config",
                 cesium_ion_token="secret-value-123")
    assert "secret-value-123" not in repr(s) and "secret-value-123" not in str(s)


def test_no_emoji_in_config_or_contract():
    emoji = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")
    for folder in (REPO_DIR / "config", REPO_DIR / "engineering" / "contract"):
        for path in folder.rglob("*"):
            if path.is_file():
                assert not emoji.search(path.read_text(encoding="utf-8")), path


def test_ttl_cache_single_flight_and_maxsize_eviction():
    cache = TTLCache(maxsize=2)
    calls = 0
    count_lock = threading.Lock()
    barrier = threading.Barrier(8)

    def compute():
        nonlocal calls
        time.sleep(0.05)
        with count_lock:
            calls += 1
            return f"value-{calls}"

    def worker():
        barrier.wait(timeout=5)
        return cache.get("shared-key", 60, compute)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: worker(), range(8)))

    assert calls == 1
    assert results == ["value-1"] * 8
    assert cache._inflight == {}

    # Maxsize eviction drops the oldest entry when full.
    cache.clear()
    cache.get("a", 60, lambda: 1)
    time.sleep(0.02)
    cache.get("b", 60, lambda: 2)
    time.sleep(0.02)
    cache.get("c", 60, lambda: 3)
    assert set(cache._data) == {"b", "c"}


def test_pool_timeout_does_not_trip_backoff(monkeypatch):
    db = Database("postgresql://postgres@127.0.0.1:5433/halifax_twin_test_api")

    @contextmanager
    def raise_timeout():
        raise PoolTimeout("pool exhausted")
        yield

    monkeypatch.setattr(db.pool, "connection", raise_timeout)
    with pytest.raises(SourceUnavailable):
        db.fetch("SELECT 1")
    assert db._down_until == 0.0

    @contextmanager
    def raise_operational():
        raise psycopg.OperationalError("connection refused")
        yield

    monkeypatch.setattr(db.pool, "connection", raise_operational)
    with pytest.raises(SourceUnavailable):
        db.fetch("SELECT 1")
    assert db._down_until > 0.0


def test_resolve_all_memoizes_checks_and_archive_span():
    cfg = load_config(REPO_DIR / "config")
    calls = []

    class FakeDB:
        def fetch_one(self, query, params=None):
            text = str(query)
            calls.append((text, params))
            if "Stop Arrival" in text and "86400.0" in text:
                return (3.0,)
            if "to_regprocedure" in text:
                return (True,)
            return (True,)

    fake = FakeDB()
    resolved = stories.resolve_all(fake, cfg.stories)
    archive_calls = [c for c in calls if "86400.0" in c[0]]
    assert len(archive_calls) == 1
    assert resolved == {sid: stories.resolve(fake, story) for sid, story in cfg.stories.items()}
