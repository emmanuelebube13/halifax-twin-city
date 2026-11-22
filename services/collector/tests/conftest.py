"""Shared test fixtures.

Database tests run against a scratch database, never halifax_twin:
    HALIFAX_TWIN_TEST_DB_URL   default postgresql://postgres@localhost:5433/halifax_twin_test_collector
scripts/collector-test.ps1 creates it with database/sql/run_all.sql. When it cannot be reached, the
database tests are skipped and the parsing tests still run.
"""
import os
import sys
from pathlib import Path

import pytest

SERVICES = Path(__file__).resolve().parents[2]
if str(SERVICES) not in sys.path:
    sys.path.insert(0, str(SERVICES))

from collector import common  # noqa: E402
from collector.settings import Settings  # noqa: E402

DEFAULT_TEST_DB_URL = "postgresql://postgres@localhost:5433/halifax_twin_test_collector"

# Tables the transit collectors write. TRUNCATE ... CASCADE also empties their subtypes and
# associations; it never reaches the reference rows (sector, subsector, source, party, calendar).
CLEAN_TABLES = [
    "bronze.feed_fetch", "silver.location", "silver.asset", "silver.event", "silver.schedule_version",
    "silver.location_hist", "silver.asset_hist", "silver.route_hist", "silver.stop_hist", "silver.vehicle_hist",
]


@pytest.fixture
def data_dir(tmp_path):
    """Settings pointing raw files and logs at a temporary folder (no database)."""
    common.use_settings(Settings(database_url="postgresql://localhost:1/none", data_dir=tmp_path / "data"))
    yield tmp_path / "data"
    common.use_settings(None)


@pytest.fixture(scope="session")
def test_db_url():
    import psycopg
    from psycopg.conninfo import conninfo_to_dict
    url = os.environ.get("HALIFAX_TWIN_TEST_DB_URL") or DEFAULT_TEST_DB_URL
    if conninfo_to_dict(url).get("dbname") in (None, "halifax_twin"):
        pytest.exit("Refusing to run tests against halifax_twin. Set HALIFAX_TWIN_TEST_DB_URL to a scratch database.")
    try:
        with psycopg.connect(url, connect_timeout=5) as conn:
            built = conn.execute("SELECT to_regclass('bronze.feed_fetch') IS NOT NULL").fetchone()[0]
    except Exception as e:
        pytest.skip(f"Scratch database not reachable ({type(e).__name__}); run scripts/collector-test.ps1")
    if not built:
        pytest.skip("Scratch database exists but is not built; run database/sql/run_all.sql on it")
    return url


@pytest.fixture
def db(test_db_url, tmp_path):
    """An emptied scratch database and a temporary data folder. Yields the database URL."""
    import psycopg
    with psycopg.connect(test_db_url, autocommit=True) as conn:
        conn.execute(f"TRUNCATE {', '.join(CLEAN_TABLES)} RESTART IDENTITY CASCADE")
    common.use_settings(Settings(database_url=test_db_url, data_dir=tmp_path / "data"))
    yield test_db_url
    common.use_settings(None)


@pytest.fixture
def sql(db):
    """Run one query on the scratch database and return all rows."""
    import psycopg

    def run(query, params=None):
        with psycopg.connect(db, autocommit=True) as conn:
            return conn.execute(query, params).fetchall()
    return run
