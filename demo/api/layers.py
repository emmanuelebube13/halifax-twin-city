"""Map layers as GeoJSON, read straight from silver. Every response carries as_of, source and attribution."""
from __future__ import annotations

import datetime as dt
import json
import time
from zoneinfo import ZoneInfo

HALIFAX = ZoneInfo("America/Halifax")
ATTRIBUTION = "Contains information licensed under the Open Government Licence – Halifax."

BUSES_SQL = """
WITH latest AS (
    SELECT DISTINCT ON (vehicle_asset_id) vehicle_asset_id, position_ts, trip_event_id,
           position_latitude, position_longitude, bearing_degrees, speed_metres_per_second
      FROM silver.vehicle_position
     WHERE position_ts > now() - interval '3 minutes'
     ORDER BY vehicle_asset_id, position_ts DESC
)
SELECT l.vehicle_asset_id, v.vehicle_label, l.position_ts, l.position_latitude, l.position_longitude,
       l.bearing_degrees, l.speed_metres_per_second, r.route_short_name, r.route_long_name,
       d.reported_delay_seconds, d.stop_name, d.event_start_ts
  FROM latest l
  JOIN silver.vehicle v ON v.asset_id = l.vehicle_asset_id
  LEFT JOIN silver.trip t ON t.event_id = l.trip_event_id
  LEFT JOIN silver.route r ON r.asset_id = t.route_asset_id
  LEFT JOIN LATERAL (
        SELECT sa.reported_delay_seconds, s.stop_name, e.event_start_ts
          FROM silver.stop_arrival sa
          JOIN silver.event e ON e.event_id = sa.event_id
          JOIN silver.stop s ON s.asset_id = sa.stop_asset_id
         WHERE sa.trip_event_id = l.trip_event_id
         ORDER BY sa.stop_sequence_number DESC
         LIMIT 1) d ON true
"""

ROUTES_SQL = """
SELECT a.source_asset_key, r.route_short_name, r.route_long_name, r.route_mode_code,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(l.location_geometry, 0.00015), 5)
  FROM silver.route r
  JOIN silver.asset a ON a.asset_id = r.asset_id
  JOIN silver.location l ON l.location_id = a.location_id
 WHERE a.asset_status_code = 'Active' AND l.location_geometry IS NOT NULL
"""


def iso(t: dt.datetime | None) -> str | None:
    return t.astimezone(HALIFAX).isoformat(timespec="seconds") if t else None


def status_for(delay: int | None, rules: dict) -> str:
    on_time = rules.get("on_time", {})
    if delay is None:
        return "unknown"
    if delay < on_time.get("early_limit_seconds", -60):
        return "early"
    if delay > on_time.get("late_limit_seconds", 300):
        return "late"
    return "on time"


def buses(conn, rules: dict) -> dict:
    rows = conn.execute(BUSES_SQL).fetchall()
    features = []
    newest = None
    for (asset_id, label, pos_ts, lat, lon, bearing, speed, route, route_name, delay, stop, arrived) in rows:
        newest = max(newest, pos_ts) if newest else pos_ts
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": {
                "vehicle_asset_id": asset_id, "label": label, "route": route, "route_name": route_name,
                "delay_seconds": delay, "status": status_for(delay, rules), "last_stop": stop,
                "last_stop_ts": iso(arrived), "position_ts": iso(pos_ts),
                "bearing_degrees": float(bearing) if bearing is not None else None,
                "speed_kmh": round(float(speed) * 3.6) if speed is not None else None,
            },
        })
    return {"type": "FeatureCollection", "features": features, "count": len(features),
            "as_of": iso(newest), "source": "SRC-001 vehicle positions, SRC-002 trip updates (Halifax Transit)",
            "reliability_tier": "Tier 1 – Official", "attribution": ATTRIBUTION}


_routes_cache: dict = {"at": 0.0, "body": None}


def routes(conn) -> dict:
    """Route lines change only when a new schedule loads, so keep them for 10 minutes."""
    if _routes_cache["body"] and time.monotonic() - _routes_cache["at"] < 600:
        return _routes_cache["body"]
    features = [{
        "type": "Feature", "geometry": json.loads(geo),
        "properties": {"route_id": key, "route": short, "route_name": long, "mode": mode},
    } for key, short, long, mode, geo in conn.execute(ROUTES_SQL).fetchall()]
    version = conn.execute(
        "SELECT feed_version_label FROM silver.schedule_version ORDER BY schedule_version_id DESC LIMIT 1").fetchone()
    body = {"type": "FeatureCollection", "features": features, "count": len(features),
            "as_of": version[0] if version else None,
            "source": "SRC-004 GTFS schedule (Halifax Transit)", "reliability_tier": "Tier 1 – Official",
            "attribution": ATTRIBUTION}
    _routes_cache.update(at=time.monotonic(), body=body)
    return body


TRAILS_SQL = """
SELECT vehicle_asset_id, extract(epoch FROM position_ts) * 1000, position_longitude, position_latitude
  FROM silver.vehicle_position
 WHERE position_ts > now() - make_interval(mins => %s)
 ORDER BY vehicle_asset_id, position_ts
"""


def trails(conn, minutes: int) -> dict:
    """Every GPS point of every bus over the last N minutes, for animation and replay.
    Shape: {"buses": {"<vehicle_asset_id>": [[epoch_ms, lon, lat], ...]}}"""
    minutes = max(1, min(int(minutes), 60))
    out: dict[str, list] = {}
    for vid, ms, lon, lat in conn.execute(TRAILS_SQL, (minutes,)).fetchall():
        out.setdefault(str(vid), []).append([int(ms), float(lon), float(lat)])
    return {"minutes": minutes, "buses": out, "count": len(out),
            "as_of": dt.datetime.now(HALIFAX).isoformat(timespec="seconds"),
            "source": "SRC-001 vehicle positions (Halifax Transit)", "reliability_tier": "Tier 1 – Official",
            "attribution": ATTRIBUTION}


ANALYTICS_SQL = """
SELECT r.route_short_name, r.route_long_name,
       count(sa.reported_delay_seconds) AS arrivals,
       count(*) FILTER (WHERE sa.reported_delay_seconds BETWEEN %(early)s AND %(late)s) AS on_time,
       count(*) FILTER (WHERE sa.reported_delay_seconds > %(late)s) AS late,
       count(*) FILTER (WHERE sa.reported_delay_seconds < %(early)s) AS early,
       round(avg(sa.reported_delay_seconds) / 60.0, 1) AS avg_delay_min
  FROM silver.stop_arrival sa
  JOIN silver.event e ON e.event_id = sa.event_id
  JOIN silver.trip t ON t.event_id = sa.trip_event_id
  JOIN silver.route r ON r.asset_id = t.route_asset_id
 WHERE e.event_date = (now() AT TIME ZONE 'America/Halifax')::date
 GROUP BY 1, 2
HAVING count(sa.reported_delay_seconds) >= 10
"""

HOURLY_SQL = """
SELECT extract(hour FROM e.event_start_ts AT TIME ZONE 'America/Halifax')::int AS hour,
       count(sa.reported_delay_seconds) AS arrivals,
       count(*) FILTER (WHERE sa.reported_delay_seconds BETWEEN %(early)s AND %(late)s) AS on_time
  FROM silver.stop_arrival sa JOIN silver.event e ON e.event_id = sa.event_id
 WHERE e.event_date = (now() AT TIME ZONE 'America/Halifax')::date
 GROUP BY 1 ORDER BY 1
"""


def analytics(conn, rules: dict) -> dict:
    on_time = rules.get("on_time", {})
    p = {"early": on_time.get("early_limit_seconds", -60), "late": on_time.get("late_limit_seconds", 300)}
    routes = [{"route": r[0], "route_name": r[1], "arrivals": r[2], "on_time": r[3], "late": r[4], "early": r[5],
               "avg_delay_min": float(r[6]) if r[6] is not None else None,
               "on_time_percent": round(100 * r[3] / r[2], 1) if r[2] else None}
              for r in conn.execute(ANALYTICS_SQL, p).fetchall()]
    routes.sort(key=lambda r: (r["on_time_percent"] if r["on_time_percent"] is not None else 101))
    hours = [{"hour": h, "arrivals": a, "on_time": o, "on_time_percent": round(100 * o / a, 1) if a else None}
             for h, a, o in conn.execute(HOURLY_SQL, p).fetchall()]
    total = sum(r["arrivals"] for r in routes)
    ok = sum(r["on_time"] for r in routes)
    return {"as_of": dt.datetime.now(HALIFAX).isoformat(timespec="seconds"),
            "question": "TRN-Q01: is every bus on time? Today, by route",
            "arrivals_today": total, "on_time_percent_today": round(100 * ok / total, 1) if total else None,
            "routes": routes, "hours": hours,
            "on_time_rule": f"{-p['early']} s early to {p['late']} s late",
            "source": "SRC-002 trip updates, SRC-004 schedule (Halifax Transit)", "reliability_tier": "Tier 1 – Official",
            "attribution": ATTRIBUTION}
