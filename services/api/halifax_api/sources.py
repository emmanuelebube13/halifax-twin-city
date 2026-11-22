"""The source register with load status from bronze.feed_fetch."""
from __future__ import annotations

import datetime as dt

from .envelope import iso

SOURCES_SQL = """
SELECT s.source_id, s.dataset_name, p.party_name, s.licence_name, s.reliability_tier_code, s.cadence_code,
       s.source_url, ok.fetched_ts, last.fetched_ts, last.failed
  FROM silver.source s
  LEFT JOIN silver.party p ON p.party_id = s.publisher_party_id
  LEFT JOIN LATERAL (
        SELECT f.fetched_ts FROM bronze.feed_fetch f
         WHERE f.source_id = s.source_id AND f.http_status BETWEEN 200 AND 299 AND f.error_text IS NULL
         ORDER BY f.fetched_ts DESC LIMIT 1) ok ON true
  LEFT JOIN LATERAL (
        SELECT f.fetched_ts, NOT (f.http_status BETWEEN 200 AND 299 AND f.error_text IS NULL) AS failed
          FROM bronze.feed_fetch f
         WHERE f.source_id = s.source_id
         ORDER BY f.fetched_ts DESC LIMIT 1) last ON true
 ORDER BY s.source_id
"""

# How long a periodic source may go without a successful load before it is stale.
CADENCE_LIMITS = {
    "Daily": dt.timedelta(days=2),
    "Weekly": dt.timedelta(days=8),
    "Monthly": dt.timedelta(days=32),
    "Quarterly": dt.timedelta(days=100),
}


def status_of(cadence: str | None, last_ok, last_failed: bool | None, now: dt.datetime,
              live_limit: dt.timedelta) -> str:
    if last_failed:
        return "down"
    if last_ok is None:
        return "unknown"
    limit = live_limit if cadence == "Real-time" else CADENCE_LIMITS.get(cadence or "")
    if limit is not None and now - last_ok > limit:
        return "stale"
    return "ok"


def list_sources(db, stale_after_seconds: int) -> list[dict]:
    now = dt.datetime.now(dt.timezone.utc)
    live_limit = dt.timedelta(seconds=stale_after_seconds)
    out = []
    for sid, name, publisher, licence, tier, cadence, url, last_ok, last_attempt, failed in db.fetch(SOURCES_SQL):
        out.append({"source_id": sid, "dataset_name": name, "publisher": publisher, "licence": licence,
                    "reliability_tier": tier, "last_loaded_ts": iso(last_ok), "last_attempt_ts": iso(last_attempt),
                    "status": status_of(cadence, last_ok, failed, now, live_limit), "cadence_code": cadence,
                    "source_url": url})
    return out
