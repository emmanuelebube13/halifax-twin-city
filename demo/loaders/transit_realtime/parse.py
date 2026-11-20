"""Turn Halifax Transit GTFS Realtime messages into plain rows. No database here, so it is easy to test.

Keys follow the convention in database/sql/99_smoke_test.sql:
    trip          <trip_id>|<service date>            e.g. 4653807|2026-11-20
    stop arrival  <trip_id>|<service date>|<stop sequence>
    alert         the alert entity id
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from google.transit import gtfs_realtime_pb2 as rt

from ..common import HALIFAX

UTC = dt.timezone.utc
FAR_FUTURE = dt.datetime(2100, 1, 1, tzinfo=UTC)   # alerts use year 3000 to mean "until further notice"
SERVICE_DAY_ROLLOVER = dt.timedelta(hours=3)     # a trip seen at 01:30 belongs to yesterday's service day

STATUS_BY_RELATIONSHIP = {
    "SCHEDULED": "Scheduled",
    "ADDED": "Added",
    "NEW": "Added",
    "REPLACEMENT": "Added",
    "DUPLICATED": "Added",
    "CANCELED": "Cancelled",
    "DELETED": "Cancelled",
    "UNSCHEDULED": "Added",
}


def ts(seconds: int | None) -> dt.datetime | None:
    return dt.datetime.fromtimestamp(seconds, UTC) if seconds else None


def parse_feed(raw: bytes) -> rt.FeedMessage:
    msg = rt.FeedMessage()
    msg.ParseFromString(raw)
    return msg


def header_ts(msg: rt.FeedMessage) -> dt.datetime | None:
    return ts(msg.header.timestamp) if msg.header.timestamp else None


def service_date(trip: rt.TripDescriptor, fetched: dt.datetime) -> dt.date:
    """GTFS start_date when the feed gives it; otherwise the Halifax service day of the fetch."""
    if trip.start_date:
        return dt.datetime.strptime(trip.start_date, "%Y%m%d").date()
    return (fetched.astimezone(HALIFAX) - SERVICE_DAY_ROLLOVER).date()


def trip_key(trip_id: str, day: dt.date) -> str:
    return f"{trip_id}|{day.isoformat()}"


def halifax_date(t: dt.datetime) -> dt.date:
    return t.astimezone(HALIFAX).date()


# ---------------------------------------------------------------- trip updates (SRC-002)

@dataclass
class TripRow:
    key: str
    trip_id: str
    route_id: str
    day: dt.date
    status_code: str
    start_ts: dt.datetime
    end_ts: dt.datetime | None
    vehicle_key: str | None
    vehicle_label: str | None


@dataclass
class ArrivalRow:
    key: str
    trip_key: str
    stop_sequence: int
    stop_id: str
    arrival_ts: dt.datetime
    departure_ts: dt.datetime | None
    delay_seconds: int | None


def _event_time(ev) -> dt.datetime | None:
    return ts(ev.time) if ev.HasField("time") and ev.time else None


def _delay(stu) -> int | None:
    for ev in (stu.arrival, stu.departure):
        if ev.HasField("delay"):
            return ev.delay
        if ev.HasField("time") and ev.HasField("scheduled_time") and ev.scheduled_time:
            return ev.time - ev.scheduled_time
    return None


def parse_trip_updates(msg: rt.FeedMessage, fetched: dt.datetime) -> tuple[list[TripRow], list[ArrivalRow]]:
    """Trips, plus arrivals at stops the bus has already reached (time at or before the fetch).

    Future stops are predictions and change every fetch, so they are not stored. A stop is written
    once its time has passed and updated while it stays in the feed; the last value is the arrival.
    """
    trips: dict[str, TripRow] = {}
    arrivals: dict[str, ArrivalRow] = {}
    for ent in msg.entity:
        if not ent.HasField("trip_update"):
            continue
        tu = ent.trip_update
        trip_id = tu.trip.trip_id
        if not trip_id or not tu.trip.route_id:
            continue
        day = service_date(tu.trip, fetched)
        key = trip_key(trip_id, day)
        relationship = rt.TripDescriptor.ScheduleRelationship.Name(tu.trip.schedule_relationship)
        times = [t for stu in tu.stop_time_update for t in (_event_time(stu.arrival), _event_time(stu.departure)) if t]
        trips[key] = TripRow(
            key=key, trip_id=trip_id, route_id=tu.trip.route_id, day=day,
            status_code=STATUS_BY_RELATIONSHIP.get(relationship, "Scheduled"),
            start_ts=min(times) if times else fetched,
            end_ts=max(times) if times else None,
            vehicle_key=tu.vehicle.id or None, vehicle_label=tu.vehicle.label or tu.vehicle.id or None)

        for stu in tu.stop_time_update:
            if not stu.HasField("stop_sequence") or not stu.stop_id:
                continue
            if stu.schedule_relationship == rt.TripUpdate.StopTimeUpdate.SKIPPED:
                continue
            arrived = _event_time(stu.arrival) or _event_time(stu.departure)
            if arrived is None or arrived > fetched:
                continue
            akey = f"{key}|{stu.stop_sequence}"
            arrivals[akey] = ArrivalRow(akey, key, stu.stop_sequence, stu.stop_id, arrived,
                                        _event_time(stu.departure), _delay(stu))
    return list(trips.values()), list(arrivals.values())


# ---------------------------------------------------------------- vehicle positions (SRC-001)

@dataclass
class PositionRow:
    vehicle_key: str
    vehicle_label: str
    position_ts: dt.datetime
    trip_key: str | None
    latitude: float
    longitude: float
    bearing: float | None
    speed: float | None
    stop_sequence: int | None
    stop_status_code: str | None
    occupancy_code: str | None


def parse_vehicle_positions(msg: rt.FeedMessage, fetched: dt.datetime) -> list[PositionRow]:
    rows = {}
    for ent in msg.entity:
        if not ent.HasField("vehicle") or not ent.vehicle.HasField("position"):
            continue
        v = ent.vehicle
        vehicle_key = v.vehicle.id or ent.id
        position_ts = ts(v.timestamp) or fetched
        rows[(vehicle_key, position_ts)] = PositionRow(
            vehicle_key=vehicle_key,
            vehicle_label=v.vehicle.label or vehicle_key,
            position_ts=position_ts,
            trip_key=trip_key(v.trip.trip_id, service_date(v.trip, fetched)) if v.trip.trip_id else None,
            latitude=round(v.position.latitude, 6),
            longitude=round(v.position.longitude, 6),
            bearing=v.position.bearing if v.position.HasField("bearing") else None,
            speed=round(v.position.speed, 3) if v.position.HasField("speed") else None,
            stop_sequence=v.current_stop_sequence if v.HasField("current_stop_sequence") else None,
            stop_status_code=rt.VehiclePosition.VehicleStopStatus.Name(v.current_status) if v.HasField("current_status") else None,
            occupancy_code=rt.VehiclePosition.OccupancyStatus.Name(v.occupancy_status) if v.HasField("occupancy_status") else None,
        )
    return list(rows.values())


# ---------------------------------------------------------------- service alerts (SRC-003)

@dataclass
class AlertRow:
    key: str
    start_ts: dt.datetime
    end_ts: dt.datetime | None
    cause_code: str | None
    effect_code: str | None
    header_text: str
    description_text: str | None
    url: str | None
    route_ids: set = field(default_factory=set)
    stop_ids: set = field(default_factory=set)


def _text(translated: rt.TranslatedString) -> str | None:
    if not translated.translation:
        return None
    for t in translated.translation:
        if t.language in ("en", "en-CA", ""):
            return t.text
    return translated.translation[0].text


def parse_alerts(msg: rt.FeedMessage, fetched: dt.datetime) -> list[AlertRow]:
    rows = {}
    for ent in msg.entity:
        if not ent.HasField("alert"):
            continue
        a = ent.alert
        starts = [ts(p.start) for p in a.active_period if p.start]
        ends = [ts(p.end) for p in a.active_period if p.end]
        end = max(ends) if ends else None
        url = _text(a.url)
        rows[ent.id] = AlertRow(
            key=ent.id,
            start_ts=min(starts) if starts else fetched,
            end_ts=None if end is None or end >= FAR_FUTURE else end,
            cause_code=rt.Alert.Cause.Name(a.cause) if a.HasField("cause") else None,
            effect_code=rt.Alert.Effect.Name(a.effect) if a.HasField("effect") else None,
            header_text=(_text(a.header_text) or "Service alert")[:500],
            description_text=_text(a.description_text),
            url=url if url and url.startswith(("http://", "https://")) else None,
            route_ids={e.route_id for e in a.informed_entity if e.route_id},
            stop_ids={e.stop_id for e in a.informed_entity if e.stop_id},
        )
    return list(rows.values())
