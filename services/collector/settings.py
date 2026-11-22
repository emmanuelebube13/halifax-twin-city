"""Collector settings: where the database is, where raw files and logs go, and the business rules they use.

Read from environment variables, with defaults that match the build machine (engineering/build-plan.md,
section 3). No secret is ever stored here: the database password lives only in pgpass.conf, which
psycopg reads by itself, so the connection string carries no password.

    HALIFAX_TWIN_DB_URL     default postgresql://postgres@localhost:5433/halifax_twin
    HALIFAX_TWIN_DATA_DIR   default C:\\halifax-twin-data (raw files in bronze\\, logs in logs\\)

Business rules come from config/business-rules.yaml at the repository root (owned by the serving API
workstream). If the file or a value is missing, the default in this module is used.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
BUSINESS_RULES = REPO_ROOT / "config" / "business-rules.yaml"

DEFAULT_DB_URL = "postgresql://postgres@localhost:5433/halifax_twin"
DEFAULT_DATA_DIR = Path("C:/halifax-twin-data") if os.name == "nt" else Path.home() / "halifax-twin-data"
DEFAULT_RAW_RETENTION_DAYS = 7          # build plan, section 2: raw files kept for a rolling 7 days


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DB_URL
    data_dir: Path = DEFAULT_DATA_DIR
    raw_retention_days: int = DEFAULT_RAW_RETENTION_DAYS
    business_rules: dict = field(default_factory=dict, compare=False)

    @property
    def bronze_dir(self) -> Path:
        return self.data_dir / "bronze"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"


def read_business_rules(path: Path = BUSINESS_RULES) -> dict:
    """The rules file as a dict; empty when the file is absent. utf-8-sig: PowerShell 5.1 adds a byte order mark."""
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
    return data if isinstance(data, dict) else {}


def raw_retention_days(rules: dict) -> int:
    """raw_retention_days from the rules, or the default when it is missing or not a positive whole number."""
    value = rules.get("raw_retention_days")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return DEFAULT_RAW_RETENTION_DAYS
    return value


def load_settings(rules_path: Path = BUSINESS_RULES) -> Settings:
    rules = read_business_rules(rules_path)
    url = (os.environ.get("HALIFAX_TWIN_DB_URL") or "").strip() or DEFAULT_DB_URL
    data_dir = (os.environ.get("HALIFAX_TWIN_DATA_DIR") or "").strip()
    return Settings(
        database_url=url,
        data_dir=Path(data_dir) if data_dir else DEFAULT_DATA_DIR,
        raw_retention_days=raw_retention_days(rules),
        business_rules=rules,
    )


def describe_database(url: str) -> str:
    """host:port/dbname for log lines. Never prints a user or password, even if someone put one in the URL."""
    from psycopg.conninfo import conninfo_to_dict
    try:
        info = conninfo_to_dict(url)
    except Exception:
        return "(unreadable database URL)"
    return f"{info.get('host', 'localhost')}:{info.get('port', '5432')}/{info.get('dbname', '?')}"
