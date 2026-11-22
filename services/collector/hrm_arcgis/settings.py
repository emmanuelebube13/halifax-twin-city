"""Settings from the environment. No secrets here: psycopg reads the password from pgpass.conf itself."""
from __future__ import annotations

import os
from pathlib import Path

DEFAULT_DB_URL = "postgresql://postgres@localhost:5433/halifax_twin"
DEFAULT_DATA_DIR = r"C:\halifax-twin-data"
USER_AGENT = "halifax-twin-hrm-arcgis-loader/0.1 (open data loader; Halifax Digital Twin)"
RAW_RETENTION_DAYS = 7


def database_url() -> str:
    return os.environ.get("HALIFAX_TWIN_DB_URL") or DEFAULT_DB_URL


def data_dir() -> Path:
    return Path(os.environ.get("HALIFAX_TWIN_DATA_DIR") or DEFAULT_DATA_DIR)


def bronze_dir() -> Path:
    return data_dir() / "bronze"
