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
