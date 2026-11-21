"""Write parsed realtime rows into the silver schema.

Routes and stops come from the GTFS schedule (task D03): assets with source_id SRC-004 and the GTFS
route_id / stop_id as source_asset_key. A trip whose route is not loaded yet, or an arrival whose stop
is not loaded yet, is skipped and counted, never invented.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from .parse import AlertRow, ArrivalRow, PositionRow, TripRow, halifax_date

SUBSECTOR = "TRN-01"
SCHEDULE_SOURCE = "SRC-004"


@dataclass
class Lookups:
    routes: dict = field(default_factory=dict)     # GTFS route_id -> asset_id
    stops: dict = field(default_factory=dict)      # GTFS stop_id  -> asset_id
    vehicles: dict = field(default_factory=dict)   # feed vehicle id -> asset_id
    loaded_at: dt.datetime | None = None

    def refresh(self, conn):
        def by_key(asset_type, source_id):
            return dict(conn.execute(
                "SELECT source_asset_key, asset_id FROM silver.asset WHERE asset_type_code = %s AND source_id = %s",
                (asset_type, source_id)).fetchall())
        self.routes = by_key("Route", SCHEDULE_SOURCE)
        self.stops = by_key("Stop", SCHEDULE_SOURCE)
        self.vehicles = by_key("Vehicle", "SRC-001")
        self.loaded_at = dt.datetime.now(dt.timezone.utc)

    def stale(self, minutes: int = 10) -> bool:
        """Re-read every 10 minutes, and every cycle while the schedule (D03) is not loaded yet."""
        if self.loaded_at is None or not self.routes or not self.stops:
            return True
        return dt.datetime.now(dt.timezone.utc) - self.loaded_at > dt.timedelta(minutes=minutes)


def upsert_events(conn, rows: list[dict], batch_id: int, keep_earliest_start: bool) -> dict[str, int]:
    """Insert or update silver.event rows in one statement. Returns source_event_key -> event_id."""
    if not rows:
        return {}
    start_rule = ("LEAST(silver.event.event_start_ts, EXCLUDED.event_start_ts)" if keep_earliest_start
                  else "EXCLUDED.event_start_ts")
    cols = list(zip(*[(r["type"], r["start"], r["end"], r["date"], r["source_id"], r["key"], r["status"]) for r in rows]))
    result = conn.execute(
        f"""INSERT INTO silver.event (event_type_code, event_start_ts, event_end_ts, event_date, subsector_id,
                                      source_id, source_event_key, event_status_code, dw_batch_id)
            SELECT t, s, e, d, %s, src, k, st, %s
              FROM unnest(%s::text[], %s::timestamptz[], %s::timestamptz[], %s::date[], %s::text[], %s::text[], %s::text[])
                   AS u(t, s, e, d, src, k, st)
            ON CONFLICT ON CONSTRAINT ak1_event DO UPDATE
               SET event_start_ts = {start_rule},
                   event_end_ts = EXCLUDED.event_end_ts,
                   event_status_code = EXCLUDED.event_status_code,
                   dw_loaded_ts = now(),
                   dw_batch_id = EXCLUDED.dw_batch_id
            RETURNING source_event_key, event_id""",
        (SUBSECTOR, batch_id, *[list(c) for c in cols])).fetchall()
    return dict(result)


def ensure_vehicles(conn, lookups: Lookups, vehicles: dict[str, str], batch_id: int):
    """Register buses not seen before: one asset row plus one vehicle row each."""
    for key, label in vehicles.items():
        if key in lookups.vehicles:
            continue
        asset_id = conn.execute(
            """INSERT INTO silver.asset (asset_type_code, asset_name, subsector_id, source_id, source_asset_key,
                                         asset_status_code, dw_batch_id)
               VALUES ('Vehicle', %s, %s, 'SRC-001', %s, 'Active', %s)
               ON CONFLICT ON CONSTRAINT ak1_asset DO UPDATE SET dw_loaded_ts = silver.asset.dw_loaded_ts
               RETURNING asset_id""",
            (f"Bus {label}", SUBSECTOR, key, batch_id)).fetchone()[0]
        conn.execute(
            """INSERT INTO silver.vehicle (asset_id, vehicle_label, vehicle_mode_code, dw_batch_id)
               VALUES (%s, %s, 'Bus', %s) ON CONFLICT (asset_id) DO NOTHING""",
            (asset_id, label, batch_id))
        lookups.vehicles[key] = asset_id


def store_trips(conn, lookups: Lookups, trips: list[TripRow], batch_id: int) -> tuple[dict[str, int], int]:
    """Trips with a known route. Returns (trip key -> event_id, number skipped for a missing route)."""
    known = [t for t in trips if t.route_id in lookups.routes]
    skipped = len(trips) - len(known)
    ensure_vehicles(conn, lookups, {t.vehicle_key: t.vehicle_label for t in known if t.vehicle_key}, batch_id)
    ids = upsert_events(conn, [
        {"type": "Trip", "start": t.start_ts, "end": t.end_ts, "date": t.day, "source_id": "SRC-002",
         "key": t.key, "status": t.status_code} for t in known], batch_id, keep_earliest_start=True)
    if known:
        cols = list(zip(*[(ids[t.key], lookups.routes[t.route_id], lookups.vehicles.get(t.vehicle_key), t.status_code)
                          for t in known]))
        conn.execute(
            """INSERT INTO silver.trip (event_id, route_asset_id, vehicle_asset_id, trip_schedule_status_code, dw_batch_id)
               SELECT e, r, v, s, %s FROM unnest(%s::bigint[], %s::bigint[], %s::bigint[], %s::text[]) AS u(e, r, v, s)
               ON CONFLICT (event_id) DO UPDATE
                  SET vehicle_asset_id = COALESCE(EXCLUDED.vehicle_asset_id, silver.trip.vehicle_asset_id),
                      trip_schedule_status_code = EXCLUDED.trip_schedule_status_code,
                      dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id""",
            (batch_id, *[list(c) for c in cols]))
    return ids, skipped


def store_arrivals(conn, lookups: Lookups, arrivals: list[ArrivalRow], trip_ids: dict[str, int],
                   batch_id: int) -> tuple[int, int]:
    """Arrivals at passed stops. Returns (stored, skipped for a missing trip or stop)."""
    known = [a for a in arrivals if a.trip_key in trip_ids and a.stop_id in lookups.stops]
    ids = upsert_events(conn, [
        {"type": "Stop Arrival", "start": a.arrival_ts, "end": a.departure_ts, "date": halifax_date(a.arrival_ts),
         "source_id": "SRC-002", "key": a.key, "status": "Arrived"} for a in known], batch_id, keep_earliest_start=False)
    if known:
        cols = list(zip(*[(ids[a.key], trip_ids[a.trip_key], a.stop_sequence, lookups.stops[a.stop_id],
                           a.departure_ts, a.delay_seconds) for a in known]))
        conn.execute(
            """INSERT INTO silver.stop_arrival (event_id, trip_event_id, stop_sequence_number, stop_asset_id,
                                                actual_departure_ts, reported_delay_seconds,
                                                arrival_observation_method_code, dw_batch_id)
               SELECT e, t, q, s, d, l, 'Reported', %s
                 FROM unnest(%s::bigint[], %s::bigint[], %s::int[], %s::bigint[], %s::timestamptz[], %s::int[])
                      AS u(e, t, q, s, d, l)
               ON CONFLICT (event_id) DO UPDATE
                  SET actual_departure_ts = EXCLUDED.actual_departure_ts,
                      reported_delay_seconds = EXCLUDED.reported_delay_seconds,
                      dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id""",
            (batch_id, *[list(c) for c in cols]))
    return len(known), len(arrivals) - len(known)


def trip_event_ids(conn, keys: set[str]) -> dict[str, int]:
    if not keys:
        return {}
    return dict(conn.execute(
        """SELECT source_event_key, event_id FROM silver.event
            WHERE source_id = 'SRC-002' AND event_type_code = 'Trip' AND source_event_key = ANY(%s)""",
        (list(keys),)).fetchall())


def store_positions(conn, lookups: Lookups, positions: list[PositionRow], trip_ids: dict[str, int],
                    batch_id: int) -> int:
    """GPS pings. A ping already stored (same bus, same time) is ignored. Returns rows inserted."""
    if not positions:
        return 0
    ensure_vehicles(conn, lookups, {p.vehicle_key: p.vehicle_label for p in positions}, batch_id)
    missing = {p.trip_key for p in positions if p.trip_key and p.trip_key not in trip_ids}
    trip_ids = {**trip_ids, **trip_event_ids(conn, missing)}
    cols = list(zip(*[(lookups.vehicles[p.vehicle_key], p.position_ts, trip_ids.get(p.trip_key), p.latitude,
                       p.longitude, p.bearing, p.speed, p.stop_sequence, p.stop_status_code, p.occupancy_code)
                      for p in positions]))
    cur = conn.execute(
        """INSERT INTO silver.vehicle_position (vehicle_asset_id, position_ts, trip_event_id, source_id,
                                                position_latitude, position_longitude, bearing_degrees,
                                                speed_metres_per_second, current_stop_sequence_number,
                                                vehicle_stop_status_code, occupancy_status_code)
           SELECT v, t, tr, 'SRC-001', la, lo, b, sp, q, st, oc
             FROM unnest(%s::bigint[], %s::timestamptz[], %s::bigint[], %s::numeric[], %s::numeric[], %s::numeric[],
                         %s::numeric[], %s::int[], %s::text[], %s::text[]) AS u(v, t, tr, la, lo, b, sp, q, st, oc)
           ON CONFLICT DO NOTHING""",
        [list(c) for c in cols])
    return cur.rowcount


def store_alerts(conn, lookups: Lookups, alerts: list[AlertRow], fetched: dt.datetime, batch_id: int) -> tuple[int, int]:
    """Current alerts, the routes and stops they affect, and close alerts that left the feed.
    Returns (alerts in feed, alerts closed)."""
    ids = upsert_events(conn, [
        {"type": "Service Alert", "start": a.start_ts, "end": a.end_ts, "date": halifax_date(a.start_ts),
         "source_id": "SRC-003", "key": a.key, "status": "Active"} for a in alerts], batch_id, keep_earliest_start=False)
    for a in alerts:
        conn.execute(
            """INSERT INTO silver.service_alert (event_id, alert_cause_code, alert_effect_code, alert_header_text,
                                                 alert_description_text, alert_url, dw_batch_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (event_id) DO UPDATE
                  SET alert_cause_code = EXCLUDED.alert_cause_code, alert_effect_code = EXCLUDED.alert_effect_code,
                      alert_header_text = EXCLUDED.alert_header_text,
                      alert_description_text = EXCLUDED.alert_description_text,
                      alert_url = EXCLUDED.alert_url, dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id""",
            (ids[a.key], a.cause_code, a.effect_code, a.header_text, a.description_text, a.url, batch_id))
        affected = ([(lookups.routes[r], "Affected route") for r in a.route_ids if r in lookups.routes]
                    + [(lookups.stops[s], "Affected stop") for s in a.stop_ids if s in lookups.stops])
        for asset_id, role in affected:
            conn.execute(
                """INSERT INTO silver.event_asset_involvement (event_id, asset_id, involvement_role_code, dw_batch_id)
                   VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING""", (ids[a.key], asset_id, role, batch_id))
    closed = conn.execute(
        """UPDATE silver.event
              SET event_status_code = 'Ended',
                  event_end_ts = LEAST(COALESCE(event_end_ts, %s), %s),
                  dw_loaded_ts = now(), dw_batch_id = %s
            WHERE source_id = 'SRC-003' AND event_type_code = 'Service Alert' AND event_status_code = 'Active'
              AND NOT (source_event_key = ANY(%s))""",
        (fetched, fetched, batch_id, [a.key for a in alerts])).rowcount
    return len(alerts), closed
