"""The response envelope, value conversion and small caches."""
from __future__ import annotations

import datetime as dt
import threading
import time
from decimal import Decimal
from typing import Any, Callable

from .db import Database, SourceUnavailable

LICENCE = "Contains information licensed under the Open Government Licence – Halifax"
UTC = dt.timezone.utc


def iso(t: dt.datetime | None) -> str | None:
    """UTC, second precision, Z suffix: 2026-11-21T23:15:04Z."""
    if t is None:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=UTC)
    return t.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def now_iso() -> str:
    return iso(dt.datetime.now(UTC))


def json_value(v: Any) -> Any:
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() and abs(v) < 2**53 and v.as_tuple().exponent >= 0 else float(v)
    if isinstance(v, dt.datetime):
        return iso(v)
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, dt.timedelta):
        return v.total_seconds()
    return v


def newest(*times: dt.datetime | None) -> dt.datetime | None:
    present = [t for t in times if t is not None]
    return max(present) if present else None


class TTLCache:
    """Keeps computed answers for a few seconds so a burst of map requests costs one query."""

    def __init__(self, maxsize: int = 256):
        self._maxsize = maxsize
        self._data: dict[Any, tuple[float, Any]] = {}
        self._expires: dict[Any, float] = {}
        self._lock = threading.Lock()
        self._inflight: dict[Any, threading.Lock] = {}
        self._inflight_refs: dict[Any, int] = {}

    def _store(self, key, value, seconds: float) -> None:
        now = time.monotonic()
        with self._lock:
            expired = [k for k, exp in self._expires.items() if now >= exp]
            for k in expired:
                self._expires.pop(k, None)
                self._data.pop(k, None)
            if self._maxsize > 0 and key not in self._data and len(self._data) >= self._maxsize:
                oldest = min(self._data, key=lambda k: self._data[k][0])
                self._data.pop(oldest, None)
                self._expires.pop(oldest, None)
            if self._maxsize > 0:
                self._data[key] = (now, value)
                if seconds > 0:
                    self._expires[key] = now + seconds
                else:
                    self._expires.pop(key, None)

    def get(self, key, seconds: float, compute: Callable[[], Any]):
        if seconds <= 0:
            value = compute()
            self._store(key, value, seconds)
            return value
        with self._lock:
            hit = self._data.get(key)
            if hit and time.monotonic() - hit[0] < seconds:
                return hit[1]
            key_lock = self._inflight.setdefault(key, threading.Lock())
            self._inflight_refs[key] = self._inflight_refs.get(key, 0) + 1
        try:
            with key_lock:
                with self._lock:
                    hit = self._data.get(key)
                    if hit and time.monotonic() - hit[0] < seconds:
                        return hit[1]
                value = compute()
                self._store(key, value, seconds)
                return value
        finally:
            with self._lock:
                refs = self._inflight_refs.get(key, 0) - 1
                if refs <= 0:
                    self._inflight_refs.pop(key, None)
                    if self._inflight.get(key) is key_lock:
                        self._inflight.pop(key, None)
                else:
                    self._inflight_refs[key] = refs

    def clear(self):
        with self._lock:
            self._data.clear()
            self._expires.clear()


TIER_ORDER = {"Tier 1": 1, "Tier 2": 2, "Tier 3": 3}


class SourceRegister:
    """silver.source with publisher names, re-read every 10 minutes. Never fails: unknown ids keep their id."""

    SQL = """SELECT s.source_id, s.dataset_name, p.party_name, s.reliability_tier_code
               FROM silver.source s LEFT JOIN silver.party p ON p.party_id = s.publisher_party_id"""

    def __init__(self, db: Database, cache: TTLCache):
        self.db, self.cache = db, cache

    def _all(self) -> dict[str, tuple[str, str | None, str]]:
        def load():
            try:
                return {r[0]: (r[1], r[2], r[3]) for r in self.db.fetch(self.SQL)}
            except SourceUnavailable:
                return None
        found = self.cache.get("source-register", 600, load)
        if found is None:
            # Remember the failure briefly (not for 10 minutes), so an outage does not cost a query per response.
            found = self.cache.get("source-register-failed", 30, load) or {}
            if found:
                self.cache.get("source-register", 0, lambda: found)
        return found

    def _freshness(self) -> dict:
        from .sources import freshness

        def load():
            try:
                return freshness(self.db)
            except SourceUnavailable:
                return None
        return self.cache.get("source-freshness", 30, load) or {}

    def refs(self, ids) -> list[dict]:
        known = self._all()
        fresh = self._freshness() if ids else {}
        out, seen = [], set()
        for sid in ids:
            if not sid or sid in seen:
                continue
            seen.add(sid)
            name, publisher, _ = known.get(sid, (sid, None, None))
            checked, changed = fresh.get(sid, (None, None))
            out.append({"source_id": sid, "name": name, "publisher": publisher,
                        "checked_ts": iso(checked), "last_changed_ts": iso(changed)})
        return out

    def tier(self, ids) -> str | None:
        known = self._all()
        tiers = [known[s][2] for s in ids if s in known and known[s][2]]
        return max(tiers, key=lambda t: TIER_ORDER.get(t, 9)) if tiers else None


def envelope(data, as_of, source_ids, register: SourceRegister | None, error: dict | None = None) -> dict:
    ids = list(dict.fromkeys(s for s in source_ids if s))
    body = {
        "data": data,
        "as_of": as_of if (as_of is None or isinstance(as_of, str)) else iso(as_of),
        "source": register.refs(ids) if register else [{"source_id": s, "name": s, "publisher": None} for s in ids],
        "reliability_tier": register.tier(ids) if register and ids else None,
        "licence": LICENCE,
    }
    if error:
        body["error"] = error
    return body
