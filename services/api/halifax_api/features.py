"""Detail and recent history for one location, asset or event."""
from __future__ import annotations

import json

from psycopg import sql

from .envelope import iso, json_value, newest

AUDIT = {"dw_loaded_ts", "dw_batch_id", "valid_from_ts"}

# Type code -> subtype table, as the loaders write them (entity name in the type code).
ASSET_SUBTYPES = {"Vehicle": "vehicle", "Route": "route", "Stop": "stop"}
EVENT_SUBTYPES = {"Trip": "trip", "Stop Arrival": "stop_arrival", "Service Alert": "service_alert",
                  "Road Closure": "road_closure", "Building Permit": "building_permit"}

ASSET_SQL = """
SELECT a.asset_id, a.asset_type_code, a.asset_name, a.asset_status_code, a.subsector_id, ss.sector_id, a.source_id,
       a.source_asset_key, a.in_service_date, a.out_of_service_date, a.valid_from_ts, a.dw_loaded_ts,
       l.location_name, ST_AsGeoJSON(l.location_geometry, 6)
  FROM silver.asset a
  LEFT JOIN silver.location l   ON l.location_id = a.location_id
  LEFT JOIN silver.subsector ss ON ss.subsector_id = a.subsector_id
 WHERE a.asset_id = %s
"""

EVENT_SQL = """
SELECT e.event_id, e.event_type_code, e.event_status_code, e.subsector_id, ss.sector_id, e.source_id,
       e.source_event_key, e.event_start_ts, e.event_end_ts, e.event_date, e.dw_loaded_ts,
       l.location_name, ST_AsGeoJSON(l.location_geometry, 6), e.location_id
  FROM silver.event e
  LEFT JOIN silver.location l   ON l.location_id = e.location_id
  LEFT JOIN silver.subsector ss ON ss.subsector_id = e.subsector_id
 WHERE e.event_id = %s
"""

LOCATION_SQL = """
SELECT location_id, location_type_code, location_name, geometry_type_code, source_id, source_location_key,
       start_date, end_date, valid_from_ts, dw_loaded_ts, ST_AsGeoJSON(location_geometry, 6)
  FROM silver.location WHERE location_id = %s
"""

# Recent arrivals, used as history for vehicles, stops, routes and trips.
ARRIVALS_SQL = """
SELECT e.event_start_ts, s.stop_name, sa.reported_delay_seconds, sa.stop_sequence_number, sa.trip_event_id,
       r.route_short_name
  FROM silver.stop_arrival sa
  JOIN silver.event e ON e.event_id = sa.event_id
  JOIN silver.stop s  ON s.asset_id = sa.stop_asset_id
  JOIN silver.trip t  ON t.event_id = sa.trip_event_id
  LEFT JOIN silver.route r ON r.asset_id = t.route_asset_id
 WHERE {where} AND e.event_start_ts > now() - interval '3 hours'
 ORDER BY e.event_start_ts DESC
 LIMIT 50
"""
ARRIVAL_FILTERS = {
    "Vehicle": "t.vehicle_asset_id = %s",
    "Stop": "sa.stop_asset_id = %s",
    "Route": "t.route_asset_id = %s",
    "Trip": "sa.trip_event_id = %s",
}


def _subtype(db, table: str, key_col: str, key: int) -> dict:
    cols, rows = db.columns(sql.SQL("SELECT * FROM silver.{} WHERE {} = %s").format(
        sql.Identifier(table), sql.Identifier(key_col)), (key,))
    if not rows:
        return {}
    return {c: json_value(v) for c, v in zip(cols, rows[0]) if c not in AUDIT and c != key_col}


def _arrivals(db, type_code: str, key: int) -> list[dict]:
    where = ARRIVAL_FILTERS.get(type_code)
    if not where:
        return []
    rows = db.fetch(ARRIVALS_SQL.format(where=where), (key,))
    return [{"t": iso(ts), "type": "Stop Arrival", "label": stop,
             "properties": {"delay_seconds": delay, "stop_sequence_number": seq, "trip_id": trip,
                            "route_short_name": route}}
            for ts, stop, delay, seq, trip, route in rows]


def _versions(db, table: str, key_col: str, key: int, label_col: str) -> list[dict]:
    """Earlier versions from the SCD2 history table: one item per replaced version."""
    rows = db.fetch(sql.SQL("SELECT valid_from_ts, valid_to_ts, {} FROM silver.{} WHERE {} = %s "
                            "ORDER BY valid_from_ts DESC LIMIT 20").format(
        sql.Identifier(label_col), sql.Identifier(f"{table}_hist"), sql.Identifier(key_col)), (key,))
    return [{"t": iso(f), "type": "Version", "label": lbl or "Earlier version",
             "properties": {"valid_to_ts": iso(to)}} for f, to, lbl in rows]


def asset_detail(db, asset_id: int):
    r = db.fetch_one(ASSET_SQL, (asset_id,))
    if not r:
        return None
    (aid, type_code, name, status, subsector, sector, source_id, skey, in_service, out_service, valid_from,
     loaded, loc_name, geo) = r
    props = {"kind": "asset", "sector_id": sector, "subsector_id": subsector, "id": aid, "source_key": skey,
             "source_id": source_id, "asset_type_code": type_code, "asset_status_code": status, "name": name,
             "location_name": loc_name, "in_service_date": json_value(in_service),
             "out_of_service_date": json_value(out_service), "valid_from_ts": iso(valid_from)}
    table = ASSET_SUBTYPES.get(type_code)
    if table:
        props.update(_subtype(db, table, "asset_id", aid))
    geometry = json.loads(geo) if geo else None
    as_of = loaded
    sources = [source_id]
    if type_code == "Vehicle":
        pos = db.fetch_one("""SELECT p.position_ts, p.position_longitude, p.position_latitude, p.trip_event_id,
                                     r.route_short_name, p.bearing_degrees
                                FROM silver.vehicle_position p
                                LEFT JOIN silver.trip t ON t.event_id = p.trip_event_id
                                LEFT JOIN silver.route r ON r.asset_id = t.route_asset_id
                               WHERE p.vehicle_asset_id = %s AND p.position_ts > now() - interval '7 days'
                               ORDER BY p.position_ts DESC LIMIT 1""", (aid,))
        if pos:
            geometry = {"type": "Point", "coordinates": [float(pos[1]), float(pos[2])]}
            props.update(position_ts=iso(pos[0]), trip_id=pos[3], route_short_name=pos[4],
                         bearing=json_value(pos[5]))
            as_of = newest(as_of, pos[0])
    history = _arrivals(db, type_code, aid)
    if history:
        sources.append("SRC-002")
    history += _versions(db, "asset", "asset_id", aid, "asset_name")
    return {"type": "Feature", "id": aid, "geometry": geometry, "properties": props, "history": history}, as_of, sources


def event_detail(db, event_id: int):
    r = db.fetch_one(EVENT_SQL, (event_id,))
    if not r:
        return None
    (eid, type_code, status, subsector, sector, source_id, skey, start, end, day, loaded, loc_name, geo,
     location_id) = r
    props = {"kind": "event", "sector_id": sector, "subsector_id": subsector, "id": eid, "source_key": skey,
             "source_id": source_id, "event_type_code": type_code, "event_status_code": status,
             "event_start_ts": iso(start), "event_end_ts": iso(end), "event_date": json_value(day),
             "location_id": location_id, "location_name": loc_name}
    table = EVENT_SUBTYPES.get(type_code)
    if table:
        props.update(_subtype(db, table, "event_id", eid))
    if type_code == "Trip" and props.get("route_asset_id"):
        route = db.fetch_one("SELECT route_short_name, route_long_name FROM silver.route WHERE asset_id = %s",
                             (props["route_asset_id"],))
        if route:
            props.update(route_short_name=route[0], route_long_name=route[1])
    history = _arrivals(db, type_code, eid)
    return ({"type": "Feature", "id": eid, "geometry": json.loads(geo) if geo else None, "properties": props,
             "history": history}, loaded, [source_id])


def location_detail(db, location_id: int):
    r = db.fetch_one(LOCATION_SQL, (location_id,))
    if not r:
        return None
    lid, type_code, name, gtype, source_id, skey, start, end, valid_from, loaded, geo = r
    props = {"kind": "location", "sector_id": None, "subsector_id": None, "id": lid, "source_key": skey,
             "source_id": source_id, "location_type_code": type_code, "geometry_type_code": gtype,
             "name": name, "start_date": json_value(start), "end_date": json_value(end),
             "valid_from_ts": iso(valid_from)}
    history = _versions(db, "location", "location_id", lid, "location_name")
    return ({"type": "Feature", "id": lid, "geometry": json.loads(geo) if geo else None, "properties": props,
             "history": history}, loaded, [source_id])


DETAIL = {"asset": asset_detail, "event": event_detail, "location": location_detail}
