"""Helpers every collector shares: settings, database connection, raw file storage, the bronze fetch register.

Every download is kept as a raw file under <data dir>/bronze/<source>/<Halifax date>/ and logged as one
row in bronze.feed_fetch, whether it worked or not. That register is what bronze.feed_gap reads.
bronze.feed_fetch.file_path holds the path relative to the data dir, with forward slashes
(for example bronze/SRC-001/2026-11-21/vehicle_positions_204512.pb.gz), so it reads the same on any machine.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zoneinfo import ZoneInfo

import requests

from .settings import Settings, load_settings

HALIFAX = ZoneInfo("America/Halifax")
USER_AGENT = "halifax-twin-collector/1.0 (open data loader)"

_settings: Settings | None = None


def settings() -> Settings:
    """The settings in use, read once from the environment."""
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def use_settings(s: Settings | None) -> None:
    """Replace the settings in use (tests point them at a scratch database and a temporary folder)."""
    global _settings
    _settings = s


def halifax_time(ts: dt.datetime | None = None) -> str:
    """24-hour Halifax time for log lines."""
    ts = ts or dt.datetime.now(dt.timezone.utc)
    return ts.astimezone(HALIFAX).strftime("%H:%M:%S")


class Log:
    """Prints a line with the Halifax time, and appends it to <logs>/<name>_<Halifax date>.log when to_file is on."""

    def __init__(self, name: str, to_file: bool = False):
        self.name = name
        self.to_file = to_file

    def __call__(self, msg: str) -> None:
        now = dt.datetime.now(dt.timezone.utc)
        line = f"{halifax_time(now)}  {msg}"
        print(line, flush=True)
        if self.to_file:
            try:
                folder = settings().logs_dir
                folder.mkdir(parents=True, exist_ok=True)
                day = now.astimezone(HALIFAX).strftime("%Y-%m-%d")
                with open(folder / f"{self.name}_{day}.log", "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except OSError as e:                    # a full disk must not stop the collector
                print(f"(could not write the log file: {e})", file=sys.stderr, flush=True)


def connect(autocommit: bool = False, application_name: str = "halifax-twin-collector"):
    """Connection to the database in HALIFAX_TWIN_DB_URL. The password comes from pgpass.conf, never from here."""
    import psycopg
    return psycopg.connect(settings().database_url, autocommit=autocommit, application_name=application_name)


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


def relative_path(path: Path) -> str:
    """The path as stored in bronze.feed_fetch.file_path: relative to the data dir, forward slashes."""
    return PurePosixPath(Path(path).resolve().relative_to(settings().data_dir.resolve())).as_posix()


def stored_path(file_path: str) -> Path:
    """The local file for a bronze.feed_fetch.file_path value."""
    return settings().data_dir / Path(*PurePosixPath(file_path).parts)


def save_raw(d: Download, name: str, suffix: str, compress: bool = True) -> Path | None:
    """Keep the raw file: <data dir>/bronze/<source>/<YYYY-MM-DD>/<name>_<HHMMSS>.<suffix>[.gz] (Halifax date)."""
    if not d.content:
        return None
    local = d.fetched_ts.astimezone(HALIFAX)
    folder = settings().bronze_dir / d.source_id / local.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}_{local.strftime('%H%M%S')}.{suffix}"
    if compress:
        path = path.with_name(path.name + ".gz")
        with gzip.open(path, "wb", compresslevel=6) as f:
            f.write(d.content)
    else:
        path.write_bytes(d.content)
    return path


def save_raw_once(conn, d: Download, name: str, suffix: str, compress: bool = True) -> Path | None:
    """Like save_raw, but an identical file still kept for this source is reused instead of saved again."""
    if not d.content:
        return None
    row = conn.execute(
        """SELECT file_path FROM bronze.feed_fetch
            WHERE source_id = %s AND file_sha256 = %s AND file_path IS NOT NULL
            ORDER BY fetched_ts DESC LIMIT 1""", (d.source_id, d.sha256)).fetchone()
    if row and stored_path(row[0]).exists():
        return stored_path(row[0])
    return save_raw(d, name, suffix, compress)


def log_fetch(conn, d: Download, path: Path | None, header_ts: dt.datetime | None = None,
              entity_count: int | None = None) -> int:
    """One row in bronze.feed_fetch per download. Returns fetch_id, used as dw_batch_id downstream."""
    row = conn.execute(
        """INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status, feed_header_ts, entity_count,
                                          file_path, file_bytes, file_sha256, error_text)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING fetch_id""",
        (d.source_id, d.fetched_ts, d.http_status, header_ts, entity_count,
         relative_path(path) if path else None,
         len(d.content) if d.content else None, d.sha256, d.error)).fetchone()
    return row[0]
