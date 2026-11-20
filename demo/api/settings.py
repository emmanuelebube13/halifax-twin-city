"""Demo settings: read from demo/config.local.json, then overridden by environment variables.

Secrets (the database password and the Cesium ion token) only ever live in config.local.json,
which is in .gitignore, or in environment variables. Nothing secret is committed.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

DEMO_DIR = Path(__file__).resolve().parent.parent
LOCAL_CONFIG = DEMO_DIR / "config.local.json"
BUSINESS_RULES = DEMO_DIR / "config" / "business-rules.yaml"
WEB_DIR = DEMO_DIR / "web"

PLACEHOLDERS = {"", "PASTE_YOUR_CESIUM_ION_TOKEN_HERE"}


@dataclass
class Settings:
    database_url: str | None = None
    cesium_ion_token: str | None = None
    cesium_photorealistic_asset_id: int | None = None
    host: str = "127.0.0.1"
    port: int = 8000
    business_rules: dict = field(default_factory=dict)


def _clean(value):
    if value is None:
        return None
    value = str(value).strip()
    if value in PLACEHOLDERS or "YOUR_PASSWORD" in value:
        return None
    return value


def load_settings(config_path: Path = LOCAL_CONFIG, rules_path: Path = BUSINESS_RULES) -> Settings:
    data = {}
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding="utf-8"))

    asset_id = data.get("cesium_photorealistic_asset_id")
    s = Settings(
        database_url=_clean(os.environ.get("HALIFAX_TWIN_DB_URL") or data.get("database_url")),
        cesium_ion_token=_clean(os.environ.get("CESIUM_ION_TOKEN") or data.get("cesium_ion_token")),
        cesium_photorealistic_asset_id=int(asset_id) if asset_id else None,
        host=data.get("host", "127.0.0.1"),
        port=int(data.get("port", 8000)),
    )
    if rules_path.exists():
        s.business_rules = yaml.safe_load(rules_path.read_text(encoding="utf-8")) or {}
    return s
