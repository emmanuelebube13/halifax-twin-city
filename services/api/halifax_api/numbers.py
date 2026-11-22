"""Numbers for answer sentences and context charts.

Each number is a small read-only query. A number with no data behind it returns value null, never zero
invented from nothing. Counts are zero only when the data that would be counted is present.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .config import AppConfig
from .envelope import iso, json_value, newest

HALIFAX_TODAY = "(now() AT TIME ZONE 'America/Halifax')::date"


@dataclass
class NumberDef:
    id: str
    label: str
    unit: str
    window: str
    compute: Callable  # (db, cfg) -> (value, series | None, as_of)
    source_ids: list[str] = field(default_factory=list)
    rule: Callable[[AppConfig], str] | None = None
    cache_seconds: int = 15


def _share(ok, total):
    return round(100.0 * ok / total, 1) if total else None


# ---------------------------------------------------------------- transit

def buses_live(db, cfg):
    r = db.fetch_one("""SELECT count(DISTINCT vehicle_asset_id), max(position_ts) FROM silver.vehicle_position
                         WHERE position_ts > now() - make_interval(secs => %s)""",
                     (int(cfg.live.get("vehicle_window_seconds", 180)),))
    count, as_of = r
    # Zero buses with no recent positions at all means "no data", not "no buses".
    return (count if as_of else None), None, as_of


ARRIVALS_SQL = """
SELECT count(sa.reported_delay_seconds),
       count(*) FILTER (WHERE sa.reported_delay_seconds BETWEEN %(early)s AND %(late)s),
       count(*) FILTER (WHERE sa.reported_delay_seconds > %(late)s),
       count(*) FILTER (WHERE sa.reported_delay_seconds < %(early)s),
       max(e.event_start_ts)
  FROM silver.event e
  JOIN silver.stop_arrival sa ON sa.event_id = e.event_id
 WHERE e.event_start_ts > now() - make_interval(mins => %(minutes)s)
   AND e.event_start_ts <= now() + interval '5 minutes'
"""


def _arrivals(db, cfg):
    early, late = cfg.on_time
    return db.fetch_one(ARRIVALS_SQL, {"early": early, "late": late,
                                       "minutes": int(cfg.live.get("arrival_window_minutes", 30))})


def _arrival_number(index):
    def compute(db, cfg):
        total, ok, late, early, as_of = _arrivals(db, cfg)
        if not total:
            return None, None, as_of
        return {"share": _share(ok, total), "ok": ok, "late": late, "early": early}[index], None, as_of
    return compute


HOURLY_SQL = """
SELECT date_trunc('hour', e.event_start_ts) AS hour,
       count(sa.reported_delay_seconds),
       count(*) FILTER (WHERE sa.reported_delay_seconds BETWEEN %(early)s AND %(late)s),
       max(e.event_start_ts)
  FROM silver.event e
  JOIN silver.stop_arrival sa ON sa.event_id = e.event_id
 WHERE e.event_start_ts > now() - interval '24 hours' AND e.event_start_ts <= now() + interval '5 minutes'
 GROUP BY 1 ORDER BY 1
"""


def on_time_share_24h(db, cfg):
    early, late = cfg.on_time
    rows = db.fetch(HOURLY_SQL, {"early": early, "late": late})
    series = [{"t": iso(h), "value": _share(ok, n)} for h, n, ok, _ in rows]
    total, ok = sum(r[1] for r in rows), sum(r[2] for r in rows)
    return _share(ok, total), series, newest(*(r[3] for r in rows))


def trips_planned_today(db, cfg):
    exists = db.fetch_one("SELECT to_regprocedure('gold.planned_stop_time(date)') IS NOT NULL")[0]
    if not exists:
        return None, None, None
    r = db.fetch_one(f"""SELECT count(DISTINCT scheduled_trip_id),
                               (SELECT max(dw_loaded_ts) FROM silver.schedule_version)
                          FROM gold.planned_stop_time({HALIFAX_TODAY})""")
    return (r[0] if r[1] else None), None, r[1]


# ---------------------------------------------------------------- events by type (Public Works, Housing)

IN_EFFECT = "e.event_start_ts <= now() AND (e.event_end_ts IS NULL OR e.event_end_ts > now())"


def _type_loaded(db, type_code):
    """Newest load time of any event of this type, or None when the type has no rows at all."""
    return db.fetch_one("""SELECT max(dw_loaded_ts) FROM silver.event WHERE event_type_code = %s""", (type_code,))[0]


def closures_active(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, None, None
    n = db.fetch_one(f"SELECT count(*) FROM silver.event e WHERE e.event_type_code = 'Road Closure' AND {IN_EFFECT}")[0]
    return n, None, loaded


def closure_median_days(db, cfg):
    r = db.fetch_one(f"""SELECT percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM e.event_end_ts - e.event_start_ts) / 86400.0),
                                max(e.dw_loaded_ts)
                           FROM silver.event e
                          WHERE e.event_type_code = 'Road Closure' AND e.event_end_ts IS NOT NULL AND {IN_EFFECT}""")
    return (round(float(r[0]), 1) if r[0] is not None else None), None, r[1]


def closures_by_month(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, [], None
    rows = db.fetch("""SELECT to_char(date_trunc('month', e.event_start_ts AT TIME ZONE 'America/Halifax'), 'YYYY-MM'),
                              count(*)
                         FROM silver.event e
                        WHERE e.event_type_code = 'Road Closure'
                          AND e.event_start_ts >= date_trunc('month', now() AT TIME ZONE 'America/Halifax')
                                                  - interval '11 months'
                        GROUP BY 1 ORDER BY 1""")
    series = [{"t": m, "value": n} for m, n in rows]
    return (series[-1]["value"] if series else 0), series, loaded


PERMITS_YEAR = f"e.event_date >= date_trunc('year', {HALIFAX_TODAY})::date"


def permits_ytd(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, None, None
    n = db.fetch_one(f"SELECT count(*) FROM silver.event e WHERE e.event_type_code = 'Building Permit' AND {PERMITS_YEAR}")[0]
    return n, None, loaded


def units_created_ytd(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, None, None
    r = db.fetch_one(f"""SELECT sum(bp.units_created_count), count(bp.units_created_count)
                           FROM silver.event e JOIN silver.building_permit bp ON bp.event_id = e.event_id
                          WHERE e.event_type_code = 'Building Permit' AND {PERMITS_YEAR}""")
    # If the source never fills unit counts, say so with null rather than claiming zero units.
    return (json_value(r[0]) if r[1] else None), None, loaded


def permits_by_year(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, [], None
    rows = db.fetch("""SELECT extract(year FROM e.event_date)::int, count(*)
                         FROM silver.event e WHERE e.event_type_code = 'Building Permit'
                        GROUP BY 1 ORDER BY 1""")
    this_year = db.fetch_one(f"SELECT extract(year FROM {HALIFAX_TODAY})::int")[0]
    series = [{"t": str(y), "value": n} for y, n in rows]
    value = next((n for y, n in rows if y == this_year), 0)
    return value, series, loaded


def _on_time_rule(cfg: AppConfig) -> str:
    return cfg.on_time_rule_text


TRANSIT_RT = ["SRC-002"]
NUMBERS: dict[str, NumberDef] = {n.id: n for n in [
    NumberDef("trn.buses_live", "Buses on the road", "buses", "Reported a position in the last 3 minutes",
              buses_live, ["SRC-001"], cache_seconds=5),
    NumberDef("trn.on_time_share", "Arrivals on time", "percent", "Stop arrivals in the last 30 minutes",
              _arrival_number("share"), TRANSIT_RT, _on_time_rule),
    NumberDef("trn.on_time_count", "On time", "arrivals", "Stop arrivals in the last 30 minutes",
              _arrival_number("ok"), TRANSIT_RT, _on_time_rule),
    NumberDef("trn.late_count", "Late", "arrivals", "Stop arrivals in the last 30 minutes",
              _arrival_number("late"), TRANSIT_RT, _on_time_rule),
    NumberDef("trn.early_count", "Early", "arrivals", "Stop arrivals in the last 30 minutes",
              _arrival_number("early"), TRANSIT_RT, _on_time_rule),
    NumberDef("trn.on_time_share_24h", "On time by hour", "percent", "Last 24 hours, by hour (UTC hour start)",
              on_time_share_24h, TRANSIT_RT, _on_time_rule, cache_seconds=60),
    NumberDef("trn.trips_planned_today", "Trips planned today", "trips", "Today's service day in Halifax time",
              trips_planned_today, ["SRC-004"], cache_seconds=600),
    NumberDef("pwk.closures_active", "Closures in effect", "closures", "Now", closures_active, ["SRC-015"],
              cache_seconds=60),
    NumberDef("pwk.closure_median_days", "Median planned length", "days",
              "Closures in effect now that have a planned end", closure_median_days, ["SRC-015"], cache_seconds=60),
    NumberDef("pwk.closures_by_month", "Closures starting each month", "closures",
              "Last 12 months in Halifax time; value is the current month", closures_by_month, ["SRC-015"],
              cache_seconds=300),
    NumberDef("hre.permits_ytd", "Permits this year", "permits", "1 Jan to today, Halifax time", permits_ytd,
              ["SRC-066"], cache_seconds=300),
    NumberDef("hre.units_created_ytd", "New units this year", "units",
              "Units created by permits issued 1 Jan to today", units_created_ytd, ["SRC-066"], cache_seconds=300),
    NumberDef("hre.permits_by_year", "Building permits by year", "permits",
              "Calendar years in Halifax time; value is the current year to date", permits_by_year, ["SRC-066"],
              cache_seconds=300),
]}
