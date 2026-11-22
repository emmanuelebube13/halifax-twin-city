"""Paged reads from an ArcGIS REST layer, with raw files kept and one bronze.feed_fetch row per page.

Each page is one HTTP request: `<layer>/query?where=1=1&outFields=...&outSR=4326&f=geojson`, ordered by
OBJECTID with resultOffset paging. Every page is saved gzipped under
<data root>/bronze/<source_id>/<YYYY-MM-DD>/<layer>_<HHMMSS>_p<NNN>.geojson.gz (Halifax date and time
the download started)
and logged in bronze.feed_fetch, whether it worked or not.

Until the shared helper from workstream B exists, this module keeps its own fetch logging; it writes the
same columns the demo's common.py wrote.
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from . import settings

HALIFAX = ZoneInfo("America/Halifax")


@dataclass
class Page:
    url: str
    fetched_ts: dt.datetime
    http_status: int
    content: bytes | None
    error: str | None = None
    features: list = field(default_factory=list)
    exceeded: bool = False

    @property
    def ok(self) -> bool:
        return self.http_status == 200 and self.error is None

    @property
    def sha256(self) -> str | None:
        return hashlib.sha256(self.content).hexdigest() if self.content else None


class FetchError(RuntimeError):
    pass


def parse_page(content: bytes) -> tuple[list, bool]:
    """Features and the 'more pages' flag from one GeoJSON response. Raises FetchError on an ArcGIS error body."""
    body = json.loads(content.decode("utf-8-sig"))
    if "error" in body:
        raise FetchError(f"ArcGIS error: {json.dumps(body['error'])[:500]}")
    if body.get("type") != "FeatureCollection":
        raise FetchError("Response is not a GeoJSON FeatureCollection")
    exceeded = bool(body.get("exceededTransferLimit") or body.get("properties", {}).get("exceededTransferLimit"))
    return body.get("features", []), exceeded


def get_page(session: requests.Session, layer_url: str, params: dict, retries: int = 2) -> Page:
    """One page request. Never raises: failures come back as a Page with an error."""
    url = layer_url.rstrip("/") + "/query"
    last = None
    for attempt in range(retries + 1):
        now = dt.datetime.now(dt.timezone.utc)
        try:
            r = session.get(url, params=params, timeout=60)
            if r.status_code != 200:
                last = Page(r.url, now, r.status_code, r.content or None, f"HTTP {r.status_code}")
            else:
                page = Page(r.url, now, 200, r.content)
                try:
                    page.features, page.exceeded = parse_page(r.content)
                    return page
                except (FetchError, ValueError) as e:
                    page.error = str(e)[:1000]
                    last = page
        except requests.RequestException as e:
            last = Page(url, now, 0, None, f"{type(e).__name__}: {e}"[:1000])
        if attempt < retries:
            time.sleep(5 * (attempt + 1))
    return last


def count(session: requests.Session, layer_url: str, where: str = "1=1") -> int:
    r = session.get(layer_url.rstrip("/") + "/query",
                    params={"where": where, "returnCountOnly": "true", "f": "json"}, timeout=60)
    r.raise_for_status()
    body = r.json()
    if "count" not in body:
        raise FetchError(f"Count failed: {json.dumps(body)[:300]}")
    return int(body["count"])


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = settings.USER_AGENT
    return s


def save_raw(source_id: str, name: str, page: Page, page_no: int, run_ts: dt.datetime | None = None) -> Path | None:
    """All pages of one download share the run's start time in their names, so they sort and group together."""
    if not page.content:
        return None
    local = (run_ts or page.fetched_ts).astimezone(HALIFAX)
    folder = settings.bronze_dir() / source_id / local.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}_{local.strftime('%H%M%S')}_p{page_no:03d}.geojson.gz"
    with gzip.open(path, "wb", compresslevel=6) as f:
        f.write(page.content)
    return path


def relative_path(path: Path | None) -> str | None:
    """Forward-slash path relative to the data root, as stored in bronze.feed_fetch.file_path."""
    if path is None:
        return None
    try:
        return path.relative_to(settings.data_dir()).as_posix()
    except ValueError:
        return path.as_posix()


def log_fetch(conn, source_id: str, page: Page, path: Path | None) -> int:
    row = conn.execute(
        """INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status, feed_header_ts, entity_count,
                                          file_path, file_bytes, file_sha256, error_text)
           VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, %s) RETURNING fetch_id""",
        (source_id, page.fetched_ts, page.http_status, len(page.features) if page.ok else None,
         relative_path(path), len(page.content) if page.content else None, page.sha256, page.error)).fetchone()
    return row[0]


def fetch_layer(conn, source_id: str, name: str, layer_url: str, out_fields: list[str],
                page_size: int = 1000, pause_seconds: float = 1.0) -> tuple[list, list[int]]:
    """Download every feature of a layer, page by page. Returns (features, fetch_ids).

    Each page is logged and committed to bronze.feed_fetch at once, so the register survives a failed load.
    Raises FetchError if any page fails or the total does not match the layer's count.
    """
    s = session()
    run_ts = dt.datetime.now(dt.timezone.utc)
    expected = count(s, layer_url)
    features, fetch_ids, offset, page_no = [], [], 0, 1
    while True:
        params = {"where": "1=1", "outFields": ",".join(out_fields), "outSR": "4326", "f": "geojson",
                  "orderByFields": "OBJECTID ASC", "resultOffset": offset, "resultRecordCount": page_size,
                  "returnGeometry": "true"}
        page = get_page(s, layer_url, params)
        path = save_raw(source_id, name, page, page_no, run_ts)
        fetch_ids.append(log_fetch(conn, source_id, page, path))
        conn.commit()
        if not page.ok:
            raise FetchError(f"{name} page {page_no} failed: {page.error}")
        features.extend(page.features)
        if not page.features or (len(page.features) < page_size and not page.exceeded):
            break
        offset += len(page.features)
        page_no += 1
        time.sleep(pause_seconds)
    if len(features) != expected:
        raise FetchError(f"{name}: received {len(features)} features, layer reports {expected}")
    return features, fetch_ids


def prune_raw(source_ids: list[str], days: int = settings.RAW_RETENTION_DAYS) -> int:
    """Delete this package's raw files older than `days`. bronze.feed_fetch rows are kept. Returns files removed."""
    cutoff = dt.datetime.now(HALIFAX).date() - dt.timedelta(days=days)
    removed = 0
    for sid in source_ids:
        root = settings.bronze_dir() / sid
        if not root.is_dir():
            continue
        for day in root.iterdir():
            try:
                d = dt.date.fromisoformat(day.name)
            except ValueError:
                continue
            if day.is_dir() and d < cutoff:
                for f in day.glob("*.geojson.gz"):
                    f.unlink()
                    removed += 1
                if not any(day.iterdir()):
                    day.rmdir()
    return removed
