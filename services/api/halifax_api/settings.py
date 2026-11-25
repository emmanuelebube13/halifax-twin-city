"""Settings for the serving API.

Read from environment variables first, then from an optional git-ignored file
services/api/config.local.json. Secrets never live in the repository: the database password is read by
psycopg from pgpass.conf on its own, and the Cesium ion token comes from CESIUM_ION_TOKEN.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = API_DIR.parent.parent
LOCAL_CONFIG = API_DIR / "config.local.json"

DEFAULT_DB_URL = "postgresql://postgres@localhost:5433/halifax_twin"
# Google Photorealistic 3D Tiles on Cesium ion.
DEFAULT_PHOTOREALISTIC_ASSET_ID = 2275207
PLACEHOLDERS = {"", "PASTE_YOUR_CESIUM_ION_TOKEN_HERE", "changeme"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    config_dir: Path
    cesium_ion_token: str | None = None
    cesium_photorealistic_asset_id: int | None = DEFAULT_PHOTOREALISTIC_ASSET_ID
    cors_origins: tuple[str, ...] = ("http://127.0.0.1:5173", "http://localhost:5173")
    # Public site (Cloudflare). Origins of the public web app, allowed by CORS and the only pages that may
    # ask for the public 3D token.
    public_origins: tuple[str, ...] = ()
    # A separate Cesium ion token for the public site, restricted in ion to the public web address.
    # Visitors get it only when they open 3D, and only up to three_d_daily_limit times a day.
    public_cesium_ion_token: str | None = None
    three_d_daily_limit: int = 30
    # Where the day's 3D count is kept, so a restart does not reset it. None keeps it in memory (tests).
    three_d_counter_file: Path | None = None

    def __repr__(self) -> str:  # never show the token, even in a traceback or a log line
        return (f"Settings(database_url={self.database_url!r}, config_dir={str(self.config_dir)!r}, "
                f"cesium_ion_token={'<set>' if self.cesium_ion_token else None}, "
                f"public_cesium_ion_token={'<set>' if self.public_cesium_ion_token else None}, "
                f"public_origins={self.public_origins!r}, three_d_daily_limit={self.three_d_daily_limit})")

    __str__ = __repr__


def _clean(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return None if value in PLACEHOLDERS else value


def load_settings(local_config: Path = LOCAL_CONFIG) -> Settings:
    data: dict = {}
    if local_config.exists():
        # utf-8-sig: Windows PowerShell 5.1 saves files with a byte order mark.
        data = json.loads(local_config.read_text(encoding="utf-8-sig"))
    asset_id = os.environ.get("CESIUM_PHOTOREALISTIC_ASSET_ID") or data.get("cesium_photorealistic_asset_id")
    raw_origins = os.environ.get("HALIFAX_TWIN_PUBLIC_ORIGINS") or data.get("public_origins") or ""
    if isinstance(raw_origins, str):
        raw_origins = raw_origins.split(",")
    public_origins = tuple(o.strip().rstrip("/") for o in raw_origins if o and o.strip().startswith("https://"))
    data_dir = os.environ.get("HALIFAX_TWIN_DATA_DIR") or data.get("data_dir") or "C:/halifax-twin-data"
    return Settings(
        database_url=_clean(os.environ.get("HALIFAX_TWIN_DB_URL") or data.get("database_url")) or DEFAULT_DB_URL,
        config_dir=Path(os.environ.get("HALIFAX_TWIN_CONFIG_DIR") or data.get("config_dir") or REPO_DIR / "config"),
        cesium_ion_token=_clean(os.environ.get("CESIUM_ION_TOKEN") or data.get("cesium_ion_token")),
        cesium_photorealistic_asset_id=int(asset_id) if asset_id else DEFAULT_PHOTOREALISTIC_ASSET_ID,
        public_origins=public_origins,
        cors_origins=("http://127.0.0.1:5173", "http://localhost:5173", *public_origins),
        public_cesium_ion_token=_clean(os.environ.get("CESIUM_ION_TOKEN_PUBLIC") or data.get("public_cesium_ion_token")),
        three_d_daily_limit=int(os.environ.get("HALIFAX_TWIN_3D_DAILY_LIMIT") or data.get("three_d_daily_limit") or 30),
        three_d_counter_file=Path(data_dir) / "three_d_count.json",
    )
