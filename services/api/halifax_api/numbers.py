"""Numbers for answer sentences and context charts.

Each number is a small read-only query. A number with no data behind it returns value null, never zero
invented from nothing. Counts are zero only when the data that would be counted is present.
"""
from __future__ import annotations

import datetime as dt
import threading
import time
import weakref
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo
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
    return round(100.0 * float(ok) / float(total), 1) if total else None


# ---------------------------------------------------------------- transit

def buses_live(db, cfg):
    r = db.fetch_one("""SELECT count(DISTINCT vehicle_asset_id), max(position_ts) FROM silver.vehicle_position
                         WHERE position_ts > now() - make_interval(secs => %s)""",
                     (int(cfg.live.get("vehicle_window_seconds", 180)),))
    count, as_of = r
    if as_of:
        return count, None, as_of
    # No recent positions. If the vehicle feed itself answered recently with no vehicles (overnight, for
    # example), the true answer is zero buses. Only when the feed has not answered is it "no data".
    f = db.fetch_one("""SELECT max(fetched_ts) FROM bronze.feed_fetch
                         WHERE source_id = 'SRC-001' AND http_status = 200 AND error_text IS NULL
                           AND entity_count IS NOT NULL
                           AND fetched_ts > now() - make_interval(secs => %s)""",
                     (int(cfg.live.get("vehicle_window_seconds", 180)),))
    fetched = f[0] if f else None
    return (0 if fetched else None), None, fetched


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

# A closure with no end is of unknown length (the loader leaves the end empty when the source's end
# precedes its start), so it is not counted as in effect.
IN_EFFECT = "e.event_start_ts <= now() AND e.event_end_ts IS NOT NULL AND e.event_end_ts > now()"
# PWK-Q13 is about utility work: the sector loader files closures of type Utility under PWK-03.
UTILITY = "e.subsector_id = 'PWK-03'"


def _type_loaded(db, type_code):
    """Newest load time of any event of this type, or None when the type has no rows at all."""
    return db.fetch_one("""SELECT max(dw_loaded_ts) FROM silver.event WHERE event_type_code = %s""", (type_code,))[0]


def closures_active(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, None, None
    n = db.fetch_one(f"""SELECT count(*) FROM silver.event e
                           WHERE e.event_type_code = 'Road Closure' AND {UTILITY} AND {IN_EFFECT}""")[0]
    return n, None, loaded


def closure_median_days(db, cfg):
    r = db.fetch_one(f"""SELECT percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM e.event_end_ts - e.event_start_ts) / 86400.0),
                                max(e.dw_loaded_ts)
                           FROM silver.event e
                          WHERE e.event_type_code = 'Road Closure' AND {UTILITY}
                            AND e.event_end_ts IS NOT NULL AND {IN_EFFECT}""")
    return (round(float(r[0]), 1) if r[0] is not None else None), None, r[1]


def closures_by_month(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, [], None
    rows = db.fetch(f"""SELECT to_char(date_trunc('month', e.event_start_ts AT TIME ZONE 'America/Halifax'), 'YYYY-MM'),
                              count(*)
                         FROM silver.event e
                        WHERE e.event_type_code = 'Road Closure' AND {UTILITY}
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
    NumberDef("trn.on_time_share_24h", "On time by hour", "percent", "Last 24 hours, by hour",
              on_time_share_24h, TRANSIT_RT, _on_time_rule, cache_seconds=60),
    NumberDef("trn.trips_planned_today", "Trips planned today", "trips", "Today's service day in Halifax time",
              trips_planned_today, ["SRC-004"], cache_seconds=600),
    NumberDef("pwk.closures_active", "Utility closures in effect", "closures", "Now, utility work closures", closures_active, ["SRC-015"],
              cache_seconds=60),
    NumberDef("pwk.closure_median_days", "Median planned length", "days",
              "Utility closures in effect now that have a planned end", closure_median_days, ["SRC-015"], cache_seconds=60),
    NumberDef("pwk.closures_by_month", "Utility closures starting each month", "closures",
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


# ---------------------------------------------------------------- wider release 1 (architect-approved 21 Nov 2026)
# Transit analytics read workstream B's gold functions. While a function is not installed the number is null.

def _measures(cfg):
    return cfg.rules.get("transit_measures", {})


def _closure_rules(cfg):
    return cfg.rules.get("closures", {})


def _window(cfg, key="window_days", default=7):
    days = int(_measures(cfg).get(key, default))
    return {"from_expr": f"{HALIFAX_TODAY} - {days - 1}", "to_expr": HALIFAX_TODAY, "days": days}


def _gold(db, signature):
    return bool(db.fetch_one("SELECT to_regprocedure(%s) IS NOT NULL", (signature,))[0])


def _feed_as_of(db):
    return db.fetch_one("""SELECT max(fetched_ts) FROM bronze.feed_fetch
                            WHERE source_id = 'SRC-002' AND http_status BETWEEN 200 AND 299""")[0]


LATENESS = "gold.route_lateness_by_hour(date,date,integer,integer)"


def _lateness_rows(db, cfg, group):
    w = _window(cfg)
    early, late = cfg.on_time
    return db.fetch(f"""SELECT {group}, sum(arrival_count), sum(late_count)
                          FROM gold.route_lateness_by_hour({w['from_expr']}, {w['to_expr']}, %s::int, %s::int)
                         GROUP BY 1""", (early, late))


def late_share_7d(db, cfg):
    if not _gold(db, LATENESS):
        return None, None, None
    rows = _lateness_rows(db, cfg, "true")
    n, late = (rows[0][1], rows[0][2]) if rows else (0, 0)
    return (_share(late, n) if n else None), None, _feed_as_of(db)


def late_share_by_route(db, cfg):
    if not _gold(db, LATENESS):
        return None, [], None
    rows = [r for r in _lateness_rows(db, cfg, "route_short_name") if r[1] >= 50]
    rows.sort(key=lambda r: -float(r[2]) / float(r[1]))
    series = [{"t": r[0], "value": _share(r[2], r[1])} for r in rows[:15]]
    n, late = sum(r[1] for r in rows), sum(r[2] for r in rows)
    return (_share(late, n) if n else None), series, _feed_as_of(db)


def late_share_by_hour(db, cfg):
    if not _gold(db, LATENESS):
        return None, [], None
    rows = sorted(_lateness_rows(db, cfg, "hour_of_day"))
    series = [{"t": f"{int(h):02d}", "value": _share(late, n)} for h, n, late in rows]
    n, late = sum(r[1] for r in rows), sum(r[2] for r in rows)
    return (_share(late, n) if n else None), series, _feed_as_of(db)


BUNCHING = "gold.bunching_by_route_hour(date,date,numeric,numeric)"


def _bunching(db, cfg, group):
    w = _window(cfg)
    m = _measures(cfg)
    return db.fetch(f"""SELECT {group}, sum(headways_judged), sum(bunched_count)
                          FROM gold.bunching_by_route_hour({w['from_expr']}, {w['to_expr']}, %s::numeric, %s::numeric)
                         GROUP BY 1""", (m.get("bunched_ratio", 0.25), m.get("long_gap_ratio", 1.5)))


def bunched_share_7d(db, cfg):
    if not _gold(db, BUNCHING):
        return None, None, None
    rows = _bunching(db, cfg, "true")
    n, b = (rows[0][1], rows[0][2]) if rows else (0, 0)
    return (_share(b, n) if n else None), None, _feed_as_of(db)


def bunched_by_hour(db, cfg):
    if not _gold(db, BUNCHING):
        return None, [], None
    rows = sorted(_bunching(db, cfg, "hour_of_day"))
    series = [{"t": f"{int(h):02d}", "value": _share(b, n)} for h, n, b in rows]
    n, b = sum(r[1] for r in rows), sum(r[2] for r in rows)
    return (_share(b, n) if n else None), series, _feed_as_of(db)


STOP_WAIT = "gold.stop_wait_comparison(date,date)"


def _stop_wait(db, cfg, group):
    w = _window(cfg)
    return db.fetch(f"""SELECT {group},
                               sum(excess_wait_seconds * headways_observed) / nullif(sum(headways_observed), 0),
                               sum(headways_observed)
                          FROM gold.stop_wait_comparison({w['from_expr']}, {w['to_expr']})
                         GROUP BY 1""")


def excess_wait_7d(db, cfg):
    if not _gold(db, STOP_WAIT):
        return None, None, None
    rows = _stop_wait(db, cfg, "true")
    v = rows[0][1] if rows else None
    return (round(float(v)) if v is not None else None), None, _feed_as_of(db)


def excess_wait_by_route(db, cfg):
    if not _gold(db, STOP_WAIT):
        return None, [], None
    rows = [r for r in _stop_wait(db, cfg, "route_short_name") if r[1] is not None and r[2] >= 20]
    rows.sort(key=lambda r: -float(r[1]))
    series = [{"t": r[0], "value": round(float(r[1]))} for r in rows[:15]]
    total = sum(r[2] for r in rows)
    value = round(sum(float(r[1]) * float(r[2]) for r in rows) / float(total)) if total else None
    return value, series, _feed_as_of(db)


TRIP_STATUS = "gold.scheduled_trip_status(date,timestamp with time zone,integer)"


# Trip status counts per service day. A finished day cannot change, so its counts are kept for a day;
# today's and yesterday's (until 06:00 the next morning, when the last trips are due) are kept 10 minutes.
# Each day is its own call with a constant date: one call is about 0.1 s, while one query over a
# generate_series of days was several seconds (the inlined function plans badly with a lateral date).
_DAY_COUNTS: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()  # per Database: {(day, gap): (at, counts)}
_DAY_LOCK = threading.Lock()


def _halifax_now():
    return dt.datetime.now(ZoneInfo("America/Halifax"))


def _day_complete(day: dt.date) -> bool:
    return _halifax_now() >= dt.datetime.combine(day + dt.timedelta(days=1), dt.time(6, 0),
                                                 tzinfo=ZoneInfo("America/Halifax"))


def _day_counts(db, gap: int, day: dt.date) -> dict:
    key = (day, gap)
    with _DAY_LOCK:
        hit = _DAY_COUNTS.setdefault(db, {}).get(key)
    ttl = 86400 if _day_complete(day) else 600
    if hit and time.monotonic() - hit[0] < ttl:
        return hit[1]
    counts = dict(db.fetch("""SELECT trip_status, count(*)
                                FROM gold.scheduled_trip_status(%s::date, now(), %s::int) GROUP BY 1""", (day, gap)))
    with _DAY_LOCK:
        _DAY_COUNTS.setdefault(db, {})[key] = (time.monotonic(), counts)
    return counts


def _days_counts(db, gap: int, days: list[dt.date]) -> list[dict]:
    """Several days at once, each on its own pooled connection."""
    with ThreadPoolExecutor(max_workers=min(4, len(days))) as pool:
        return list(pool.map(lambda d: _day_counts(db, gap, d), days))


def _trip_status_counts(db, cfg, day: dt.date):
    return _day_counts(db, int(_measures(cfg).get("coverage_gap_seconds", 300)), day)


def _trip_number(kind):
    def compute(db, cfg):
        if not _gold(db, TRIP_STATUS):
            return None, None, None
        counts = _trip_status_counts(db, cfg, _halifax_now().date() - dt.timedelta(days=1))
        if not counts:
            return None, None, None
        value = {"not_run": counts.get("Not seen", 0) + counts.get("Cancelled", 0),
                 "not_covered": counts.get("Not covered", 0),
                 "planned": sum(counts.values())}[kind]
        # If nothing could be checked, "0 not run" would be a false answer.
        if kind == "not_run" and counts.get("Not covered", 0) == sum(counts.values()):
            value = None
        return value, None, _feed_as_of(db)
    return compute


def trips_not_run_by_day(db, cfg):
    if not _gold(db, TRIP_STATUS):
        return None, [], None
    gap = int(_measures(cfg).get("coverage_gap_seconds", 300))
    today = _halifax_now().date()
    days = [today - dt.timedelta(days=n) for n in range(7, 0, -1)]
    series = []
    for day, counts in zip(days, _days_counts(db, gap, days)):
        total = sum(counts.values())
        if not total:
            continue  # no schedule covers the day: no point, as before
        not_run = counts.get("Not seen", 0) + counts.get("Cancelled", 0)
        # A day the collector did not cover at all has no answer, not zero.
        series.append({"t": day.isoformat(), "value": None if counts.get("Not covered", 0) == total else not_run})
    return (series[-1]["value"] if series else None), series, _feed_as_of(db)


SEGMENTS = "gold.segment_speed(date,date,numeric)"


def _segments(db, cfg):
    w = _window(cfg, "segment_window_days", 28)
    m = _measures(cfg)
    return db.fetch(f"""SELECT route_short_name, from_stop_name, to_stop_name, median_speed_km_per_hour,
                               slow_day_share, days_observed
                          FROM gold.segment_speed({w['from_expr']}, {w['to_expr']}, %s::numeric)""",
                    (m.get("slow_ratio", 1.2),))


def _consistently_slow(rows, cfg):
    m = _measures(cfg)
    share, min_days = float(m.get("consistently_slow_share", 0.5)), int(m.get("consistently_slow_min_days", 5))
    return [r for r in rows if r[4] is not None and float(r[4]) >= share and r[5] >= min_days]


def slow_segments_count(db, cfg):
    if not _gold(db, SEGMENTS):
        return None, None, None
    rows = _segments(db, cfg)
    if not rows:
        return None, None, None
    return len(_consistently_slow(rows, cfg)), None, _feed_as_of(db)


def slowest_segments(db, cfg):
    if not _gold(db, SEGMENTS):
        return None, [], None
    observed = _segments(db, cfg)
    rows = _consistently_slow(observed, cfg)
    rows.sort(key=lambda r: (-float(r[4]), float(r[3] or 0)))
    series = [{"t": f"{r[0]}: {r[1]} to {r[2]}", "value": json_value(r[3])} for r in rows[:10]]
    return (len(rows) if observed else None), series, _feed_as_of(db)


# ---------------------------------------------------------------- closures, all types (TRN-Q25, PWK-Q16, TRN-Q09)

# Distances in metres in UTM zone 20N (EPSG:32620), which covers Halifax: planar and fast.
ROUTES_UTM = """r AS MATERIALIZED (
    SELECT rt.route_short_name, ST_Transform(rl.location_geometry, 32620) AS g
      FROM silver.asset ra
      JOIN silver.route rt    ON rt.asset_id = ra.asset_id
      JOIN silver.location rl ON rl.location_id = ra.location_id
     WHERE ra.asset_type_code = 'Route' AND ra.asset_status_code = 'Active' AND rl.location_geometry IS NOT NULL)"""
NEAR_ROUTE = "EXISTS (SELECT 1 FROM r WHERE ST_DWithin(r.g, ST_Transform(l.location_geometry, 32620), %(near)s))"


def _count_closures(where):
    def compute(db, cfg):
        loaded = _type_loaded(db, "Road Closure")
        if loaded is None:
            return None, None, None
        c = _closure_rules(cfg)
        n = db.fetch_one(f"""WITH {ROUTES_UTM}
                             SELECT count(*) FROM silver.event e
                               JOIN silver.road_closure x ON x.event_id = e.event_id
                               LEFT JOIN silver.location l ON l.location_id = e.location_id
                              WHERE e.event_type_code = 'Road Closure' AND {where}""",
                         {"near": float(c.get("route_buffer_metres", 20)),
                          "days": int(c.get("upcoming_days", 30))})[0]
        return n, None, loaded
    return compute


UPCOMING = "e.event_start_ts > now() AND e.event_start_ts <= now() + make_interval(days => %(days)s)"


def closure_median_days_all(db, cfg):
    r = db.fetch_one(f"""SELECT percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM e.event_end_ts - e.event_start_ts) / 86400.0),
                                max(e.dw_loaded_ts)
                           FROM silver.event e
                          WHERE e.event_type_code = 'Road Closure' AND e.event_end_ts IS NOT NULL AND {IN_EFFECT}""")
    return (round(float(r[0]), 1) if r[0] is not None else None), None, r[1]


def closure_length_bands(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, [], None
    rows = dict(db.fetch(f"""SELECT CASE WHEN d < 1 THEN 'Under 1 day' WHEN d <= 7 THEN '1 to 7 days'
                                         WHEN d <= 28 THEN '8 to 28 days' ELSE 'Over 28 days' END, count(*)
                               FROM (SELECT extract(epoch FROM e.event_end_ts - e.event_start_ts) / 86400.0 AS d
                                       FROM silver.event e
                                      WHERE e.event_type_code = 'Road Closure' AND e.event_end_ts IS NOT NULL
                                        AND {IN_EFFECT}) s
                              GROUP BY 1"""))
    bands = ["Under 1 day", "1 to 7 days", "8 to 28 days", "Over 28 days"]
    series = [{"t": b, "value": rows.get(b, 0)} for b in bands]
    return sum(rows.values()), series, loaded


def upcoming_by_week(db, cfg):
    loaded = _type_loaded(db, "Road Closure")
    if loaded is None:
        return None, [], None
    days = int(_closure_rules(cfg).get("upcoming_days", 30))
    rows = db.fetch(f"""SELECT to_char(date_trunc('week', e.event_start_ts AT TIME ZONE 'America/Halifax'), 'YYYY-MM-DD'),
                               count(*)
                          FROM silver.event e
                         WHERE e.event_type_code = 'Road Closure' AND {UPCOMING}
                         GROUP BY 1 ORDER BY 1""", {"days": days})
    series = [{"t": w, "value": n} for w, n in rows]
    return sum(n for _, n in rows), series, loaded


# TRN-Q09: delay at stops beside a closure while it is in effect, against delay everywhere, last 7 days.
CLOSURE_DELAY_SQL = """
WITH c AS (
    SELECT e.event_id, e.event_start_ts, e.event_end_ts, x.closure_reason_code, l.location_geometry
      FROM silver.event e
      JOIN silver.road_closure x ON x.event_id = e.event_id
      JOIN silver.location l     ON l.location_id = e.location_id
     WHERE e.event_type_code = 'Road Closure'
       AND e.event_start_ts < now() AND e.event_end_ts IS NOT NULL
       AND e.event_end_ts > now() - make_interval(days => %(days)s)
),
stops AS MATERIALIZED (
    SELECT a.asset_id, ST_Transform(sl.location_geometry, 32620) AS g
      FROM silver.asset a JOIN silver.location sl ON sl.location_id = a.location_id
     WHERE a.asset_type_code = 'Stop' AND a.asset_status_code = 'Active'
),
cs AS MATERIALIZED (
    SELECT DISTINCT c.event_id, c.event_start_ts, c.event_end_ts, c.closure_reason_code, s.asset_id AS stop_asset_id
      FROM c JOIN stops s ON ST_DWithin(s.g, ST_Transform(c.location_geometry, 32620), %(near)s)
),
near AS (
    SELECT DISTINCT ON (sa.event_id) sa.event_id, sa.reported_delay_seconds, cs.closure_reason_code
      FROM cs
      JOIN silver.stop_arrival sa ON sa.stop_asset_id = cs.stop_asset_id
      JOIN silver.event e         ON e.event_id = sa.event_id
     WHERE e.event_start_ts > now() - make_interval(days => %(days)s)
       AND e.event_start_ts BETWEEN cs.event_start_ts AND cs.event_end_ts
       AND sa.reported_delay_seconds IS NOT NULL
),
everywhere AS (
    SELECT avg(sa.reported_delay_seconds) AS delay, count(sa.reported_delay_seconds) AS n
      FROM silver.event e JOIN silver.stop_arrival sa ON sa.event_id = e.event_id
     WHERE e.event_start_ts > now() - make_interval(days => %(days)s)
)
SELECT {group}, avg(near.reported_delay_seconds), count(*), (SELECT delay FROM everywhere), (SELECT n FROM everywhere)
  FROM near GROUP BY 1
"""
MIN_NEAR_ARRIVALS = 30


def _closure_delay(db, cfg, group):
    c, m = _closure_rules(cfg), _measures(cfg)
    return db.fetch(CLOSURE_DELAY_SQL.format(group=group),
                    {"near": float(c.get("stop_buffer_metres", 30)), "days": int(m.get("window_days", 7))})


def closure_delay_gap(db, cfg):
    rows = _closure_delay(db, cfg, "true")
    if not rows or rows[0][2] < MIN_NEAR_ARRIVALS or rows[0][3] is None:
        return None, None, None
    _, near, n, everywhere, _ = rows[0]
    return round(float(near) - float(everywhere)), None, _feed_as_of(db)


def delay_near_closures_by_reason(db, cfg):
    rows = [r for r in _closure_delay(db, cfg, "closure_reason_code") if r[2] >= MIN_NEAR_ARRIVALS]
    if not rows:
        return None, [], None
    everywhere = float(rows[0][3])
    rows.sort(key=lambda r: -float(r[1]))
    series = [{"t": r[0], "value": round(float(r[1]) - everywhere)} for r in rows]
    return series[0]["value"], series, _feed_as_of(db)


# ---------------------------------------------------------------- permits (HRE-Q08, HRE-Q30)

def units_created_by_year(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, [], None
    rows = db.fetch("""SELECT extract(year FROM e.event_date)::int, sum(bp.units_created_count),
                              count(bp.units_created_count)
                         FROM silver.event e JOIN silver.building_permit bp ON bp.event_id = e.event_id
                        WHERE e.event_type_code = 'Building Permit'
                        GROUP BY 1 ORDER BY 1""")
    this_year = db.fetch_one(f"SELECT extract(year FROM {HALIFAX_TODAY})::int")[0]
    series = [{"t": str(y), "value": (json_value(total) if filled else None)} for y, total, filled in rows]
    value = next((p["value"] for p in series if p["t"] == str(this_year)), None)
    return value, series, loaded


ISSUE_TO_COMPLETION = """
SELECT {group}, percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.event_end_ts - e.event_start_ts)), count(*)
  FROM silver.event e
 WHERE e.event_type_code = 'Building Permit' AND e.event_end_ts IS NOT NULL AND e.event_end_ts >= e.event_start_ts
   {where}
 GROUP BY 1 ORDER BY 1
"""


def _days(interval):
    return round(interval.total_seconds() / 86400) if interval is not None else None


def issue_to_completion_median_days(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, None, None
    rows = db.fetch(ISSUE_TO_COMPLETION.format(group="true",
                                               where="AND e.event_end_ts > now() - interval '365 days'"))
    return (_days(rows[0][1]) if rows else None), None, loaded


def issue_to_completion_by_year(db, cfg):
    loaded = _type_loaded(db, "Building Permit")
    if loaded is None:
        return None, [], None
    rows = db.fetch(ISSUE_TO_COMPLETION.format(
        group="extract(year FROM e.event_end_ts AT TIME ZONE 'America/Halifax')::int", where=""))
    series = [{"t": str(y), "value": _days(d)} for y, d, _ in rows]
    return (series[-1]["value"] if series else None), series, loaded


TRANSIT_GOLD = ["SRC-002", "SRC-004"]
_rule = _on_time_rule
NUMBERS.update({n.id: n for n in [
    NumberDef("trn.late_share_7d", "Arrivals late", "percent", "Recorded arrivals, last 7 service days",
              late_share_7d, TRANSIT_GOLD, _rule, cache_seconds=600),
    NumberDef("trn.late_share_by_route", "Late share by route", "percent",
              "Last 7 service days; the 15 routes with the highest late share (at least 50 arrivals)",
              late_share_by_route, TRANSIT_GOLD, _rule, cache_seconds=600),
    NumberDef("trn.late_share_by_hour", "Late share by hour", "percent",
              "Last 7 service days, by Halifax hour of arrival", late_share_by_hour, TRANSIT_GOLD, _rule,
              cache_seconds=600),
    NumberDef("trn.bunched_share_7d", "Arrivals bunched", "percent",
              "Judged headways, last 7 service days", bunched_share_7d, TRANSIT_GOLD,
              lambda cfg: "Bunched: less than 0.25 x the scheduled gap behind the bus ahead (interim, not yet decided)",
              cache_seconds=600),
    NumberDef("trn.bunched_by_hour", "Bunched share by hour", "percent",
              "Last 7 service days, by Halifax hour", bunched_by_hour, TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.excess_wait_7d", "Extra wait at stops", "seconds",
              "Expected wait minus planned expected wait, weighted by headways, last 7 service days",
              excess_wait_7d, TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.excess_wait_by_route", "Extra wait by route", "seconds",
              "Last 7 service days; the 15 routes with the largest extra wait", excess_wait_by_route,
              TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.trips_not_run_yesterday", "Trips not run", "trips",
              "Yesterday's service day: not seen in the feed or cancelled, where the collector was running",
              _trip_number("not_run"), TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.trips_planned_yesterday", "Trips planned", "trips", "Yesterday's service day",
              _trip_number("planned"), TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.trips_not_covered_yesterday", "Trips not checked", "trips",
              "Yesterday's service day: the collector was not fetching for the whole trip",
              _trip_number("not_covered"), TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.trips_not_run_by_day", "Trips not run by day", "trips", "Last 7 service days",
              trips_not_run_by_day, TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.slow_segments_count", "Consistently slow segments", "segments",
              "Last 28 service days; slow on at least half of 5 or more observed days",
              slow_segments_count, TRANSIT_GOLD,
              lambda cfg: "Slow day: median time above 1.2 x planned (interim, not yet decided)", cache_seconds=600),
    NumberDef("trn.slowest_segments", "Slowest segments", "km/h",
              "The 10 most consistently slow stop-to-stop segments, straight-line median speed",
              slowest_segments, TRANSIT_GOLD, cache_seconds=600),
    NumberDef("trn.closures_in_effect", "Closures in effect", "closures", "Now, every closure type",
              _count_closures(IN_EFFECT), ["SRC-015"], cache_seconds=60),
    NumberDef("trn.closure_median_days_all", "Median planned length", "days",
              "Closures of every type in effect now that have a planned end", closure_median_days_all, ["SRC-015"],
              cache_seconds=60),
    NumberDef("trn.closures_on_routes", "Closures on bus routes", "closures",
              "In effect now, within 20 m of a bus route", _count_closures(f"{IN_EFFECT} AND {NEAR_ROUTE}"),
              ["SRC-015", "SRC-004"], cache_seconds=300),
    NumberDef("trn.closure_length_bands", "Closures by planned length", "closures",
              "Closures in effect now with a planned end", closure_length_bands, ["SRC-015"], cache_seconds=60),
    NumberDef("pwk.upcoming_closures_30d", "Planned closures", "closures", "Starting in the next 30 days",
              _count_closures(UPCOMING), ["SRC-015"], cache_seconds=300),
    NumberDef("pwk.upcoming_on_routes_30d", "Planned closures on bus routes", "closures",
              "Starting in the next 30 days, within 20 m of a bus route",
              _count_closures(f"{UPCOMING} AND {NEAR_ROUTE}"), ["SRC-015", "SRC-004"], cache_seconds=300),
    NumberDef("pwk.upcoming_sidewalk_30d", "Planned sidewalk closures", "closures",
              "Starting in the next 30 days, sidewalk closures",
              _count_closures(f"{UPCOMING} AND x.closure_type_code = 'Sidewalk'"), ["SRC-015"], cache_seconds=300),
    NumberDef("pwk.upcoming_by_week", "Planned closures by week", "closures",
              "Starting in the next 30 days, by week (Monday)", upcoming_by_week, ["SRC-015"], cache_seconds=300),
    NumberDef("trn.closure_delay_gap", "Extra delay beside closures", "seconds",
              "Last 7 days: average delay at stops within 30 m of a closure in effect, minus the average everywhere",
              closure_delay_gap, ["SRC-002", "SRC-015"], cache_seconds=600),
    NumberDef("trn.delay_near_closures_by_reason", "Extra delay by closure type", "seconds",
              "Last 7 days, by closure type (at least 30 arrivals beside closures)",
              delay_near_closures_by_reason, ["SRC-002", "SRC-015"], cache_seconds=600),
    NumberDef("hre.units_created_by_year", "New units by year", "units",
              "Units created by permits issued each calendar year; value is the current year",
              units_created_by_year, ["SRC-066"], cache_seconds=300),
    NumberDef("hre.issue_to_completion_median_days", "Issue to completion", "days",
              "Median days from permit issue to completion, permits completed in the last 365 days",
              issue_to_completion_median_days, ["SRC-066"], cache_seconds=300),
    NumberDef("hre.issue_to_completion_by_year", "Issue to completion by year", "days",
              "Median days from issue to completion, by year of completion", issue_to_completion_by_year,
              ["SRC-066"], cache_seconds=300),
]})
