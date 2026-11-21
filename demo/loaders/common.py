"""Helpers every loader shares: database connection, raw file storage, the bronze fetch register.

Every download is kept as a raw file under demo/data/bronze/<source>/<date>/ and logged as one row
in bronze.feed_fetch, whether it worked or not. That register is what bronze.feed_gap reads.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import sys
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

DEMO_DIR = Path(__file__).resolve().parent.parent
if str(DEMO_DIR) not in sys.path:
    sys.path.insert(0, str(DEMO_DIR))

from api.settings import load_settings  # noqa: E402

BRONZE_DIR = DEMO_DIR / "data" / "bronze"
HALIFAX = ZoneInfo("America/Halifax")
USER_AGENT = "halifax-twin-demo/0.2 (open data loader)"


def halifax_time(ts: dt.datetime | None = None) -> str:
    """24-hour Halifax time for log lines."""
    ts = ts or dt.datetime.now(dt.timezone.utc)
    return ts.astimezone(HALIFAX).strftime("%H:%M:%S")


def connect(autocommit: bool = False):
    """Connection to halifax_twin from demo/config.local.json or HALIFAX_TWIN_DB_URL."""
    import psycopg
    url = load_settings().database_url
    if not url:
        raise SystemExit("No database_url. Copy demo/config.example.json to demo/config.local.json and fill it in.")
    return psycopg.connect(url, autocommit=autocommit, application_name="halifax-twin-loader")


@dataclass
class Download:
    source_id: str
    url: str
    fetched_ts: dt.datetime
    http_status: int
    content: bytes | None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.http_status == 200 and self.content is not None and self.error is None

    @property
    def sha256(self) -> str | None:
        return hashlib.sha256(self.content).hexdigest() if self.content else None


def download(source_id: str, url: str, timeout: int = 30) -> Download:
    """Fetch one URL. Never raises: failures come back as a Download with an error."""
    now = dt.datetime.now(dt.timezone.utc)
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        if r.status_code != 200:
            return Download(source_id, url, now, r.status_code, None, f"HTTP {r.status_code}")
        return Download(source_id, url, now, 200, r.content)
    except Exception as e:
        return Download(source_id, url, now, 0, None, f"{type(e).__name__}: {e}"[:1000])


def save_raw(d: Download, name: str, suffix: str, compress: bool = True) -> Path | None:
    """Keep the raw file: demo/data/bronze/<source>/<YYYY-MM-DD>/<name>_<HHMMSS>.<suffix>[.gz] (Halifax date)."""
    if not d.content:
        return None
    local = d.fetched_ts.astimezone(HALIFAX)
    folder = BRONZE_DIR / d.source_id / local.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}_{local.strftime('%H%M%S')}.{suffix}"
    if compress:
        path = path.with_name(path.name + ".gz")
        with gzip.open(path, "wb", compresslevel=6) as f:
            f.write(d.content)
    else:
        path.write_bytes(d.content)
    return path


def log_fetch(conn, d: Download, path: Path | None, header_ts: dt.datetime | None = None,
              entity_count: int | None = None) -> int:
    """One row in bronze.feed_fetch per download. Returns fetch_id, used as dw_batch_id downstream."""
    row = conn.execute(
        """INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status, feed_header_ts, entity_count,
                                          file_path, file_bytes, file_sha256, error_text)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING fetch_id""",
        (d.source_id, d.fetched_ts, d.http_status, header_ts, entity_count,
         str(path.relative_to(DEMO_DIR)) if path else None,
         len(d.content) if d.content else None, d.sha256, d.error)).fetchone()
    return row[0]
