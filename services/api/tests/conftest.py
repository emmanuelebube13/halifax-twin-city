"""Test fixtures. Tests run against a scratch database, never halifax_twin.

The scratch database (default halifax_twin_test_api on localhost:5433) is created and built with
database/sql/run_all.sql the first time, then emptied and seeded from tests/seed.sql.
Override with HALIFAX_TWIN_TEST_DB_URL. psycopg reads the password from pgpass.conf on its own.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import warnings
from pathlib import Path

import psycopg
import pytest

warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi.testclient import TestClient  # noqa: E402

from halifax_api.config import load_config  # noqa: E402
from halifax_api.db import Database  # noqa: E402
from halifax_api.main import create_app  # noqa: E402
from halifax_api.settings import REPO_DIR, Settings  # noqa: E402

TESTS = Path(__file__).resolve().parent
TEST_DB_URL = os.environ.get("HALIFAX_TWIN_TEST_DB_URL", "postgresql://postgres@localhost:5433/halifax_twin_test_api")
PSQL = os.environ.get("PSQL", r"C:\halifax-twin-data\pgsql\bin\psql.exe")
FAKE_TOKEN = "test-token-not-a-real-cesium-token"


def _dbname(url: str) -> str:
    return psycopg.conninfo.conninfo_to_dict(url)["dbname"]


def _run_sql_file(path: Path):
    with psycopg.connect(TEST_DB_URL, autocommit=True) as conn:
        conn.execute(path.read_text(encoding="utf-8"))


def _ensure_database():
    name = _dbname(TEST_DB_URL)
    if name == "halifax_twin":
        pytest.exit("Refusing to run tests against halifax_twin. Use a scratch database.")
    admin = psycopg.conninfo.make_conninfo(TEST_DB_URL, dbname="postgres")
    try:
        with psycopg.connect(admin, autocommit=True, connect_timeout=3) as conn:
            exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone()
            if not exists:
                conn.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(name)))
    except psycopg.OperationalError:
        return False
    with psycopg.connect(TEST_DB_URL, autocommit=True) as conn:
        built = conn.execute("SELECT to_regclass('silver.event') IS NOT NULL").fetchone()[0]
    if not built:
        psql = PSQL if Path(PSQL).exists() else shutil.which("psql")
        info = psycopg.conninfo.conninfo_to_dict(TEST_DB_URL)
        subprocess.run([psql, "-h", info.get("host", "localhost"), "-p", str(info.get("port", 5432)),
                        "-U", info.get("user", "postgres"), "-w", "-d", name, "-v", "ON_ERROR_STOP=1", "-q",
                        "-f", str(REPO_DIR / "database" / "sql" / "run_all.sql")], check=True)
    return True


@pytest.fixture(scope="session")
def database_ready():
    if not _ensure_database():
        pytest.skip("Scratch PostgreSQL is not reachable on localhost:5433.")
    install_gold()
    seed()
    return True


GOLD_FILES = ["planned_stop_time.sql", "observed_stop_arrival.sql", "stop_headway.sql", "trn_q02_route_lateness.sql",
              "trn_q03_bunching.sql", "trn_q04_stop_wait.sql", "trn_q05_trip_status.sql", "trn_q11_segment_speed.sql"]


def install_gold():
    """Workstream B's gold functions: from database/gold once merged, else the pinned copy in tests/fixtures/gold."""
    folder = REPO_DIR / "database" / "gold"
    if not (folder / GOLD_FILES[-1]).exists():
        folder = TESTS / "fixtures" / "gold"
    for name in GOLD_FILES:
        _run_sql_file(folder / name)


def drop_gold():
    with psycopg.connect(TEST_DB_URL, autocommit=True) as conn:
        for (sig,) in conn.execute("""SELECT p.oid::regprocedure::text FROM pg_proc p
                                         JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'gold'""").fetchall():
            conn.execute(f"DROP FUNCTION IF EXISTS {sig} CASCADE")


def seed():
    _run_sql_file(TESTS / "empty.sql")
    _run_sql_file(TESTS / "seed.sql")


def make_client(db_url: str = TEST_DB_URL, token: str | None = FAKE_TOKEN, config_dir: Path | None = None,
                client_host: str = "127.0.0.1") -> TestClient:
    settings = Settings(database_url=db_url, config_dir=config_dir or REPO_DIR / "config", cesium_ion_token=token)
    app = create_app(settings=settings, database=Database(db_url), config=load_config(settings.config_dir))
    return TestClient(app, client=(client_host, 50000))


@pytest.fixture(scope="session")
def client(database_ready):
    with make_client() as c:
        yield c


@pytest.fixture()
def empty_database(database_ready):
    _run_sql_file(TESTS / "empty.sql")
    with make_client() as c:  # a fresh app, so no cached answers
        yield c
    seed()


@pytest.fixture()
def unreachable_client():
    # Port 1 refuses connections at once: the database is "down" for this app.
    with make_client(db_url="postgresql://postgres@127.0.0.1:1/halifax_twin_test_api") as c:
        yield c


@pytest.fixture()
def no_gold(database_ready):
    drop_gold()
    with make_client() as c:
        yield c
    install_gold()
