"""Map layers as GeoJSON, read from silver.

The live vehicles layer has its own query (latest position per bus, with route, headsign, delay and next
stop). Every other layer is generic over the conformed core: configuration names a kind (location, asset
or event), a type code and an optional subtype table, and the same query shape serves any sector.
"""
from __future__ import annotations

import json

from psycopg import sql

from .envelope import json_value, newest

# ---------------------------------------------------------------- live vehicles

VEHICLES_SQL = """
WITH latest AS (
    SELECT DISTINCT ON (vehicle_asset_id)
           vehicle_asset_id, position_ts, trip_event_id, source_id, position_latitude, position_longitude,
           bearing_degrees, speed_metres_per_second, current_stop_sequence_number, vehicle_stop_status_code
      FROM silver.vehicle_position
     WHERE position_ts > now() - make_interval(secs => %(window)s)
       AND (%(vehicle_id)s::bigint IS NULL OR vehicle_asset_id = %(vehicle_id)s::bigint)
       AND position_ts <= now() + interval '5 minutes'
     ORDER BY vehicle_asset_id, position_ts DESC
)
SELECT l.vehicle_asset_id, a.source_asset_key, a.subsector_id, ss.sector_id, l.source_id,
       coalesce(v.vehicle_label, a.source_asset_key) AS label,
       l.position_ts, l.position_latitude, l.position_longitude, l.bearing_degrees, l.speed_metres_per_second,
       t.event_id AS trip_id, t.route_asset_id, r.route_short_name, r.route_long_name,
       d.reported_delay_seconds, st.trip_headsign, nx.stop_name
  FROM latest l
  JOIN silver.asset a           ON a.asset_id = l.vehicle_asset_id
  LEFT JOIN silver.subsector ss ON ss.subsector_id = a.subsector_id
  LEFT JOIN silver.vehicle v    ON v.asset_id = l.vehicle_asset_id
  LEFT JOIN silver.trip t       ON t.event_id = l.trip_event_id
  LEFT JOIN silver.event te     ON te.event_id = l.trip_event_id
  LEFT JOIN silver.route r      ON r.asset_id = t.route_asset_id
  LEFT JOIN LATERAL (
        SELECT sa.reported_delay_seconds, sa.stop_sequence_number
          FROM silver.stop_arrival sa
         WHERE sa.trip_event_id = l.trip_event_id
         ORDER BY sa.stop_sequence_number DESC
         LIMIT 1) d ON true
  -- The trip's plan: realtime trips are keyed '<GTFS trip_id>|<service date>' (demo loaders), and
  -- trip.scheduled_trip_id is left empty until open question 7 is settled.
  LEFT JOIN LATERAL (
        SELECT s2.scheduled_trip_id, s2.trip_headsign
          FROM silver.scheduled_trip s2
          JOIN silver.schedule_version sv ON sv.schedule_version_id = s2.schedule_version_id
         WHERE s2.source_trip_key = split_part(te.source_event_key, '|', 1)
           AND s2.route_asset_id = t.route_asset_id
         ORDER BY (te.event_date BETWEEN sv.service_period_start_date AND sv.service_period_end_date) DESC,
                  sv.feed_published_date DESC, sv.schedule_version_id DESC
         LIMIT 1) st ON true
  LEFT JOIN LATERAL (
        SELECT s.stop_name
          FROM silver.scheduled_stop_time sst
          JOIN silver.stop s ON s.asset_id = sst.stop_asset_id
         WHERE sst.scheduled_trip_id = st.scheduled_trip_id
           AND sst.stop_sequence_number >= coalesce(l.current_stop_sequence_number, d.stop_sequence_number + 1, 0)
           AND NOT coalesce(l.vehicle_stop_status_code = 'STOPPED_AT'
                            AND sst.stop_sequence_number = l.current_stop_sequence_number, false)
         ORDER BY sst.stop_sequence_number
         LIMIT 1) nx ON true
 ORDER BY l.vehicle_asset_id
"""


def status_for(delay: int | None, on_time: tuple[int, int]) -> str:
    early, late = on_time
    if delay is None:
        return "unknown"
    if delay < early:
        return "early"
    if delay > late:
        return "late"
    return "on_time"


def _float(v):
    return float(v) if v is not None else None


LIVE_VEHICLE_FIELDS = ("route_short_name", "route_long_name", "route_id", "trip_id", "headsign", "status",
                       "delay_seconds", "next_stop_name")


def vehicles(db, window_seconds: int, on_time: tuple[int, int], vehicle_id: int | None = None
             ) -> tuple[dict, object, list[str]]:
    """Returns (FeatureCollection, as_of, source ids seen). With vehicle_id, only that bus."""
    features, as_of, sources = [], None, set()
    for (vid, key, subsector, sector, source_id, label, pos_ts, lat, lon, bearing, speed, trip_id, route_id,
         short, long_name, delay, headsign, next_stop) in db.fetch(
            VEHICLES_SQL, {"window": window_seconds, "vehicle_id": vehicle_id}):
        as_of = newest(as_of, pos_ts)
        sources.add(source_id)
        features.append({
            "type": "Feature", "id": vid,
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": {
                "kind": "asset", "sector_id": sector, "subsector_id": subsector, "id": vid, "source_key": key,
                "source_id": source_id, "label": label, "route_short_name": short, "route_long_name": long_name,
                "route_id": route_id, "trip_id": trip_id, "headsign": headsign,
                "status": status_for(delay, on_time), "delay_seconds": delay, "next_stop_name": next_stop,
                "bearing": _float(bearing), "speed_metres_per_second": _float(speed),
                "position_ts": json_value(pos_ts),
            },
        })
    return {"type": "FeatureCollection", "layer": "vehicles", "features": features}, as_of, sorted(sources)


REPLAY_SQL = """
SELECT p.vehicle_asset_id, coalesce(v.vehicle_label, a.source_asset_key), r.route_short_name,
       (extract(epoch FROM p.position_ts) * 1000)::bigint, p.position_longitude, p.position_latitude, p.position_ts
  FROM silver.vehicle_position p
  JOIN silver.asset a        ON a.asset_id = p.vehicle_asset_id
  LEFT JOIN silver.vehicle v ON v.asset_id = p.vehicle_asset_id
  LEFT JOIN silver.trip t    ON t.event_id = p.trip_event_id
  LEFT JOIN silver.route r   ON r.asset_id = t.route_asset_id
 WHERE p.position_ts > %(start)s AND p.position_ts <= %(end)s
 ORDER BY p.vehicle_asset_id, p.position_ts
"""


def replay(db, start, end) -> tuple[list[dict], object]:
    tracks: dict[int, dict] = {}
    as_of = None
    for vid, label, route, ms, lon, lat, ts in db.fetch(REPLAY_SQL, {"start": start, "end": end}):
        as_of = newest(as_of, ts)
        track = tracks.setdefault(vid, {"id": vid, "label": label, "route_short_name": route, "positions": []})
        if route:
            track["route_short_name"] = route  # the most recent trip's route wins
        track["positions"].append([int(ms), float(lon), float(lat)])
    return list(tracks.values()), as_of


# ---------------------------------------------------------------- generic layers

BASE = {
    "asset": {
        "table": "asset", "key": "asset_id", "type_col": "asset_type_code", "source_key": "source_asset_key",
        "extra": ["asset_type_code", "asset_status_code", "asset_name"],
    },
    "event": {
        "table": "event", "key": "event_id", "type_col": "event_type_code", "source_key": "source_event_key",
        "extra": ["event_type_code", "event_status_code", "event_start_ts", "event_end_ts", "event_date"],
    },
    "location": {
        "table": "location", "key": "location_id", "type_col": "location_type_code",
        "source_key": "source_location_key", "extra": ["location_type_code", "geometry_type_code"],
    },
}


def layer_query(layer: dict, bbox: tuple[float, float, float, float] | None, limit: int):
    kind = layer["kind"]
    b = BASE[kind]
    t = sql.Identifier
    base_cols = sql.SQL(", ").join(sql.SQL("b.") + t(c) for c in b["extra"])
    sub_cols = list(layer.get("subtype_columns", []))
    geom = sql.SQL("l.location_geometry") if kind != "location" else sql.SQL("b.location_geometry")
    simplify = layer.get("simplify_degrees")
    geom_expr = (sql.SQL("ST_SimplifyPreserveTopology({}, {})").format(geom, sql.Literal(float(simplify)))
                 if simplify else geom)
    parts = [sql.SQL("SELECT b.{key}, b.source_id, b.{skey}, {subsector}, ss.sector_id, b.dw_loaded_ts, "
                     "ST_AsGeoJSON({geom}, 6), {name}, {base_cols}").format(
        key=t(b["key"]), skey=t(b["source_key"]), geom=geom_expr, base_cols=base_cols,
        subsector=sql.SQL("b.subsector_id") if kind != "location" else sql.SQL("NULL::varchar"),
        name=sql.SQL("l.location_name") if kind != "location" else sql.SQL("b.location_name"))]
    if sub_cols:
        parts.append(sql.SQL(", ") + sql.SQL(", ").join(sql.SQL("x.") + t(c) for c in sub_cols))
    params: dict = {"type_code": layer[f"{kind}_type_code"], "limit": limit + 1}

    parts.append(sql.SQL(" FROM silver.{} b").format(t(b["table"])))
    if kind != "location":
        parts.append(sql.SQL(" LEFT JOIN silver.location l ON l.location_id = b.location_id"
                             " LEFT JOIN silver.subsector ss ON ss.subsector_id = b.subsector_id"))
    else:
        parts.append(sql.SQL(" LEFT JOIN silver.subsector ss ON false"))
    if layer.get("subtype_table"):
        parts.append(sql.SQL(" {join} silver.{tab} x ON x.{fk} = b.{key}").format(
            join=sql.SQL("JOIN"), tab=t(layer["subtype_table"]),
            fk=t("event_id" if kind == "event" else b["key"]), key=t(b["key"])))
    where = [sql.SQL("b.{} = %(type_code)s").format(t(b["type_col"]))]
    if layer.get("subsector_ids") and kind != "location":
        where.append(sql.SQL("b.subsector_id = ANY(%(subsectors)s)"))
        params["subsectors"] = list(layer["subsector_ids"])
    if layer.get("positive_column"):
        where.append(sql.SQL("x.{} > 0").format(t(layer["positive_column"])))
    if kind == "asset" and layer.get("active_only"):
        where.append(sql.SQL("b.asset_status_code = 'Active'"))
    if kind == "event":
        tf = layer.get("time_filter")
        if tf == "in_effect":
            if layer.get("end_required"):
                # An event with no end is of unknown length, not "still in force".
                where.append(sql.SQL("b.event_start_ts <= now() AND b.event_end_ts IS NOT NULL AND b.event_end_ts > now()"))
            else:
                where.append(sql.SQL("b.event_start_ts <= now() AND (b.event_end_ts IS NULL OR b.event_end_ts > now())"))
        elif tf == "ended_recent_days":
            where.append(sql.SQL("b.event_end_ts IS NOT NULL AND b.event_end_ts > now() - make_interval(days => %(days)s)"))
            params["days"] = int(layer.get("recent_days", 365))
        elif tf == "upcoming_days":
            where.append(sql.SQL("b.event_start_ts > now() AND b.event_start_ts <= now() + make_interval(days => %(days)s)"))
            params["days"] = int(layer.get("upcoming_days", 30))
        elif tf == "recent_days":
            where.append(sql.SQL("b.event_date >= (now() AT TIME ZONE 'America/Halifax')::date - %(days)s::int"))
            params["days"] = int(layer.get("recent_days", 365))
    if bbox:
        where.append(sql.SQL("{} && ST_MakeEnvelope(%(w)s, %(s)s, %(e)s, %(n)s, 4326)").format(geom))
        params.update(w=bbox[0], s=bbox[1], e=bbox[2], n=bbox[3])
    parts.append(sql.SQL(" WHERE ") + sql.SQL(" AND ").join(where))
    if kind == "event" and layer.get("time_filter") == "upcoming_days":
        order = sql.SQL("b.event_start_ts, b.event_id")
    elif kind == "event":
        order = sql.SQL("b.event_start_ts DESC, b.event_id")
    else:
        order = sql.SQL("b.{}").format(t(b["key"]))
    parts.append(sql.SQL(" ORDER BY ") + order + sql.SQL(" LIMIT %(limit)s"))
    return sql.Composed(parts), params, b["extra"], sub_cols


def routes_near(db, kind: str, ids: list[int], metres: float) -> dict[int, list[str]]:
    """Bus routes within N metres of each feature: a spatial join in the API (silver is not changed).
    Distances in UTM zone 20N (EPSG:32620), which covers Halifax, so the test is planar and fast."""
    b = BASE[kind]
    t = sql.Identifier
    loc_join = sql.SQL("") if kind == "location" else sql.SQL(
        " JOIN silver.location l ON l.location_id = b.location_id")
    geom = sql.SQL("b.location_geometry") if kind == "location" else sql.SQL("l.location_geometry")
    q = sql.SQL("""
WITH r AS MATERIALIZED (
    SELECT rt.route_short_name, ST_Transform(rl.location_geometry, 32620) AS g
      FROM silver.asset ra
      JOIN silver.route rt    ON rt.asset_id = ra.asset_id
      JOIN silver.location rl ON rl.location_id = ra.location_id
     WHERE ra.asset_type_code = 'Route' AND ra.asset_status_code = 'Active' AND rl.location_geometry IS NOT NULL),
f AS MATERIALIZED (
    SELECT b.{key} AS id, ST_Transform({geom}, 32620) AS g
      FROM silver.{table} b{loc_join}
     WHERE b.{key} = ANY(%(ids)s) AND {geom} IS NOT NULL)
SELECT f.id, array_agg(DISTINCT r.route_short_name ORDER BY r.route_short_name)
  FROM f JOIN r ON ST_DWithin(r.g, f.g, %(near)s)
 GROUP BY f.id""").format(key=t(b["key"]), table=t(b["table"]), geom=geom, loc_join=loc_join)
    return {fid: list(names) for fid, names in db.fetch(q, {"ids": ids, "near": metres})}


def generic_layer(db, name: str, layer: dict, bbox, limit: int) -> tuple[dict, object, list[str]]:
    query, params, extra, sub_cols = layer_query(layer, bbox, limit)
    rows = db.fetch(query, params)
    limit_reached = len(rows) > limit
    features, as_of, sources = [], None, set()
    for row in rows[:limit]:
        fid, source_id, skey, subsector, sector, loaded, geo, loc_name = row[:8]
        as_of = newest(as_of, loaded)
        sources.add(source_id)
        props = {"kind": layer["kind"], "sector_id": sector or layer.get("sector_id"),
                 "subsector_id": subsector or layer.get("subsector_id"), "id": fid, "source_key": skey,
                 "source_id": source_id, "location_name": loc_name}
        values = row[8:]
        raw = dict(zip(extra + sub_cols, values))
        for col, val in raw.items():
            props[col] = json_value(val)
        if raw.get("event_start_ts") and raw.get("event_end_ts"):
            props["duration_days"] = round((raw["event_end_ts"] - raw["event_start_ts"]).total_seconds() / 86400, 1)
        if "asset_name" in props:
            props["name"] = props.pop("asset_name")
        features.append({"type": "Feature", "id": fid, "geometry": json.loads(geo) if geo else None,
                         "properties": props})
    if layer.get("near_routes_metres") and features:
        near = routes_near(db, layer["kind"], [f["id"] for f in features], float(layer["near_routes_metres"]))
        for f in features:
            f["properties"]["near_route_short_names"] = near.get(f["id"], [])
    fc = {"type": "FeatureCollection", "layer": name, "features": features}
    if limit_reached:
        fc["limit_reached"] = True
    return fc, as_of, sorted(sources)


# ---------------------------------------------------------------- layers from gold (workstream B's functions)

GOLD_STOP_LAYERS = {
    # TRN-Q03: stops where buses bunch over the window.
    "bunching": ("gold.bus_bunching(date,numeric,numeric)", """
        SELECT g.stop_asset_id, count(*) AS bunched_count,
               count(*) FILTER (WHERE g.followed_by_long_gap) AS bunched_then_gap_count,
               count(DISTINCT g.service_date) AS days_observed,
               string_agg(DISTINCT g.route_short_name, ', ') AS route_short_names
          FROM generate_series(%(from)s::date, %(to)s::date, interval '1 day') d(day)
          CROSS JOIN LATERAL gold.bus_bunching(d.day::date, %(bunched)s::numeric, %(gap)s::numeric) g
         GROUP BY g.stop_asset_id"""),
    # TRN-Q04: stops where the recorded wait is longest compared with the schedule.
    "stop_wait": ("gold.stop_wait_comparison(date,date)", """
        SELECT g.stop_asset_id,
               round(sum(g.excess_wait_seconds * g.headways_observed) / nullif(sum(g.headways_observed), 0)) AS excess_wait_seconds,
               round(sum(g.expected_actual_wait_seconds * g.headways_observed) / nullif(sum(g.headways_observed), 0)) AS expected_actual_wait_seconds,
               round(sum(g.expected_scheduled_wait_seconds * g.headways_observed) / nullif(sum(g.headways_observed), 0)) AS expected_scheduled_wait_seconds,
               sum(g.headways_observed) AS headways_observed,
               max(g.days_observed) AS days_observed,
               string_agg(DISTINCT g.route_short_name, ', ') AS route_short_names
          FROM gold.stop_wait_comparison(%(from)s::date, %(to)s::date) g
         GROUP BY g.stop_asset_id"""),
}

GOLD_STOP_WRAP = """
WITH m AS ({measure})
SELECT a.asset_id, a.source_id, a.source_asset_key, a.subsector_id, ss.sector_id, s.stop_name, s.stop_code,
       ST_AsGeoJSON(l.location_geometry, 6), m.*
  FROM m
  JOIN silver.asset a           ON a.asset_id = m.stop_asset_id
  JOIN silver.stop s            ON s.asset_id = a.asset_id
  LEFT JOIN silver.location l   ON l.location_id = a.location_id
  LEFT JOIN silver.subsector ss ON ss.subsector_id = a.subsector_id
 ORDER BY 10 DESC NULLS LAST
 LIMIT %(limit)s
"""


def gold_installed(db, signature: str) -> bool:
    return bool(db.fetch_one("SELECT to_regprocedure(%s) IS NOT NULL", (signature,))[0])


def gold_stop_layer(db, name: str, layer: dict, limit: int, today, thresholds: dict) -> tuple[dict, object, list[str]]:
    """Stops with a measure from a gold function. Empty, not an error, while the function is not installed."""
    import datetime as dt
    signature, measure = GOLD_STOP_LAYERS[layer["gold_measure"]]
    fc = {"type": "FeatureCollection", "layer": name, "features": []}
    if not gold_installed(db, signature):
        return fc, None, []
    days = int(layer.get("window_days", 7))
    params = {"from": today - dt.timedelta(days=days - 1), "to": today, "limit": limit,
              "bunched": thresholds.get("bunched_ratio", 0.25), "gap": thresholds.get("long_gap_ratio", 1.5)}
    cols, rows = db.columns(sql.SQL(GOLD_STOP_WRAP.format(measure=measure)), params)
    for row in rows:
        aid, source_id, skey, subsector, sector, stop_name, stop_code, geo = row[:8]
        props = {"kind": "asset", "sector_id": sector, "subsector_id": subsector, "id": aid, "source_key": skey,
                 "source_id": source_id, "stop_name": stop_name, "stop_code": stop_code, "window_days": days}
        for c, v in zip(cols[8:], row[8:]):
            if c != "stop_asset_id":
                props[c] = json_value(v)
        fc["features"].append({"type": "Feature", "id": aid, "geometry": json.loads(geo) if geo else None,
                               "properties": props})
    as_of = None
    if fc["features"]:
        as_of = db.fetch_one("SELECT max(fetched_ts) FROM bronze.feed_fetch WHERE source_id = 'SRC-002' "
                             "AND http_status BETWEEN 200 AND 299")[0]
    return fc, as_of, ["SRC-002", "SRC-004"]
