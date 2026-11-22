"""Shared test fixtures. Database tests run only against a scratch database, never halifax_twin."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
TEST_DB_URL = os.environ.get("HALIFAX_TWIN_TEST_DB_URL",
                             "postgresql://postgres@localhost:5433/halifax_twin_test_sector")
SOURCES = ("SRC-015", "SRC-066")


def load_fixture(name: str) -> list:
    return json.loads((FIXTURES / f"{name}.geojson").read_text(encoding="utf-8"))["features"]


@pytest.fixture
def features():
    return load_fixture


def _clean(conn):
    """Remove every row these loaders write for their sources (scratch database only)."""
    src = list(SOURCES)
    for t in ("road_closure", "building_permit"):
        conn.execute(f"DELETE FROM silver.{t} WHERE event_id IN "
                     "(SELECT event_id FROM silver.event WHERE source_id = ANY(%s))", (src,))
    conn.execute("DELETE FROM silver.event WHERE source_id = ANY(%s)", (src,))
    conn.execute("DELETE FROM silver.location WHERE source_id = ANY(%s)", (src,))
    conn.execute("DELETE FROM silver.location_hist WHERE source_id = ANY(%s)", (src,))
    conn.execute("DELETE FROM bronze.feed_fetch WHERE source_id = ANY(%s)", (src,))


@pytest.fixture
def db():
    """A connection to the scratch database, cleaned before and after the test."""
    psycopg = pytest.importorskip("psycopg")
    try:
        conn = psycopg.connect(TEST_DB_URL, connect_timeout=5)
    except psycopg.OperationalError as e:
        pytest.skip(f"scratch database not reachable: {e}")
    name = conn.execute("SELECT current_database()").fetchone()[0]
    if name == "halifax_twin":
        conn.close()
        pytest.fail("Refusing to run tests against halifax_twin; use a scratch database")
    missing = [s for s in SOURCES if not conn.execute(
        "SELECT 1 FROM silver.source WHERE source_id = %s", (s,)).fetchone()]
    if missing:
        conn.close()
        pytest.fail(f"Scratch database lacks {missing}: run database/sql/08_reference_data.sql")
    _clean(conn)
    conn.commit()
    yield conn
    conn.rollback()
    _clean(conn)
    conn.commit()
    conn.close()
