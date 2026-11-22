"""Stories are configuration (config/stories/*.json). This module only decides, honestly, whether each
story can be answered now.

A story's configured `status` is the most it can be. Its optional `requires` list names checks against the
database; if one fails, the story is reported as `collecting_data` (or the check's own status) with that
check's note, so the map never shows an answer the data cannot support.

Checks:
  {"check": "event_type_rows", "event_type_code": "Road Closure", "note": "..."}
  {"check": "archive_days", "min_days": 14, "note": "..."}            stop arrivals span at least N days
  {"check": "gold_function", "signature": "gold.planned_stop_time(date)", "note": "..."}
  {"check": "subtype_column_filled", "event_type_code": "Building Permit", "table": "building_permit",
   "column": "units_created_count", "status": "source_incomplete", "note": "..."}
"""
from __future__ import annotations

from psycopg import sql

from .config import IDENTIFIER
from .db import SourceUnavailable

SUMMARY_KEYS = ("id", "question", "sector_id", "subsector_id", "lenses", "status", "status_note")


def _passes(db, req: dict) -> bool:
    check = req.get("check")
    if check == "event_type_rows":
        return bool(db.fetch_one("SELECT EXISTS (SELECT 1 FROM silver.event WHERE event_type_code = %s)",
                                 (req["event_type_code"],))[0])
    if check == "archive_days":
        r = db.fetch_one("""SELECT extract(epoch FROM max(e.event_start_ts) - min(e.event_start_ts)) / 86400.0
                              FROM silver.event e
                             WHERE e.event_type_code = 'Stop Arrival'""")
        return r[0] is not None and float(r[0]) >= float(req["min_days"])
    if check == "gold_function":
        return bool(db.fetch_one("SELECT to_regprocedure(%s) IS NOT NULL", (req["signature"],))[0])
    if check == "subtype_column_filled":
        table, column = req["table"], req["column"]
        if not (IDENTIFIER.match(table) and IDENTIFIER.match(column)):
            return False
        q = sql.SQL("""SELECT EXISTS (SELECT 1 FROM silver.event e JOIN silver.{} x ON x.event_id = e.event_id
                                       WHERE e.event_type_code = %s AND x.{} IS NOT NULL)""").format(
            sql.Identifier(table), sql.Identifier(column))
        return bool(db.fetch_one(q, (req["event_type_code"],))[0])
    return False  # an unknown check never claims readiness


def resolve(db, story: dict) -> dict:
    """The story with status and status_note decided against the data now."""
    out = {k: v for k, v in story.items() if k != "requires"}
    out.setdefault("status_note", None)
    if out.get("status") != "live":
        return out
    for req in story.get("requires", []):
        try:
            ok = _passes(db, req)
        except SourceUnavailable:
            ok = False
            req = {**req, "note": "The database cannot be read right now."}
        if not ok:
            out["status"] = req.get("status", "collecting_data")
            out["status_note"] = req.get("note")
            break
    return out


def summary(story: dict) -> dict:
    return {k: story.get(k) for k in SUMMARY_KEYS}
