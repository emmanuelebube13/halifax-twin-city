"""D02: parsing Halifax Transit GTFS Realtime into rows, using small hand-built feeds."""
import datetime as dt

from google.transit import gtfs_realtime_pb2 as rt

from loaders.transit_realtime import parse

UTC = dt.timezone.utc
FETCHED = dt.datetime(2026, 11, 20, 23, 0, 0, tzinfo=UTC)          # 19:00 Halifax time
T = int(FETCHED.timestamp())


def feed():
    m = rt.FeedMessage()
    m.header.gtfs_realtime_version = "2.0"
    m.header.timestamp = T
    return m


def test_trip_updates_keep_only_passed_stops():
    m = feed()
    tu = m.entity.add(id="1").trip_update
    tu.trip.trip_id, tu.trip.route_id, tu.trip.start_date = "4653807", "320", "20261120"
    tu.vehicle.id, tu.vehicle.label = "2533", "533"
    for seq, stop, offset, delay in [(9, "7610", -60, 0), (10, "1040", 186, 186)]:
        s = tu.stop_time_update.add(stop_sequence=seq, stop_id=stop)
        s.arrival.time = T + offset
        s.arrival.delay = delay
        s.departure.time = T + offset
    trips, arrivals = parse.parse_trip_updates(m, FETCHED)

    assert len(trips) == 1
    t = trips[0]
    assert t.key == "4653807|2026-11-20" and t.route_id == "320" and t.status_code == "Scheduled"
    assert t.vehicle_key == "2533" and t.start_ts == FETCHED - dt.timedelta(seconds=60)
    assert [a.key for a in arrivals] == ["4653807|2026-11-20|9"]          # stop 10 is still in the future
    assert arrivals[0].stop_id == "7610" and arrivals[0].delay_seconds == 0


def test_delay_falls_back_to_time_minus_scheduled_time():
    m = feed()
    tu = m.entity.add(id="1").trip_update
    tu.trip.trip_id, tu.trip.route_id = "99", "1"
    s = tu.stop_time_update.add(stop_sequence=3, stop_id="1001")
    s.arrival.time, s.arrival.scheduled_time = T - 10, T - 100
    _, arrivals = parse.parse_trip_updates(m, FETCHED)
    assert arrivals[0].delay_seconds == 90


def test_cancelled_trip_and_missing_start_date():
    m = feed()
    tu = m.entity.add(id="1").trip_update
    tu.trip.trip_id, tu.trip.route_id = "77", "1"
    tu.trip.schedule_relationship = rt.TripDescriptor.CANCELED
    trips, arrivals = parse.parse_trip_updates(m, FETCHED)
    assert trips[0].status_code == "Cancelled" and arrivals == []
    assert trips[0].key == "77|2026-11-20"        # Halifax service day of the fetch


def test_service_day_rolls_over_at_three_in_the_morning():
    after_midnight = dt.datetime(2026, 11, 21, 5, 30, tzinfo=UTC)   # 01:30 Halifax on the 21st
    assert parse.service_date(rt.TripDescriptor(), after_midnight) == dt.date(2026, 11, 20)


def test_vehicle_positions():
    m = feed()
    v = m.entity.add(id="533").vehicle
    v.trip.trip_id, v.trip.start_date = "4653807", "20261120"
    v.position.latitude, v.position.longitude, v.position.speed = 44.6775398, -63.57967, 6.7056
    v.current_stop_sequence, v.timestamp = 10, T - 9
    v.vehicle.id, v.vehicle.label = "2533", "533"
    rows = parse.parse_vehicle_positions(m, FETCHED)
    assert len(rows) == 1
    p = rows[0]
    assert (p.vehicle_key, p.vehicle_label, p.trip_key) == ("2533", "533", "4653807|2026-11-20")
    assert (p.latitude, p.longitude, p.stop_sequence) == (44.67754, -63.57967, 10)
    assert p.position_ts == FETCHED - dt.timedelta(seconds=9) and p.occupancy_code is None


def test_alerts_treat_year_3000_as_open_ended():
    m = feed()
    a = m.entity.add(id="179136").alert
    a.active_period.add(start=1764560460, end=32503694400)
    a.informed_entity.add(route_id="29", stop_id="8823")
    a.informed_entity.add(route_id="90", stop_id="8823")
    a.cause, a.effect = rt.Alert.CONSTRUCTION, rt.Alert.OTHER_EFFECT
    a.header_text.translation.add(text="Stop Closure @ 8823", language="en")
    rows = parse.parse_alerts(m, FETCHED)
    r = rows[0]
    assert r.key == "179136" and r.end_ts is None
    assert (r.cause_code, r.effect_code, r.header_text) == ("CONSTRUCTION", "OTHER_EFFECT", "Stop Closure @ 8823")
    assert r.route_ids == {"29", "90"} and r.stop_ids == {"8823"} and r.url is None
