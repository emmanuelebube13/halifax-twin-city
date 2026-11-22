"""The gold transit measures (TRN-Q02, Q03, Q04, Q05, Q11) on a hand-built service day in the scratch database.

Route 1, direction 0, Friday 20 Nov 2026, two stops 130 m apart, planned every 10 minutes (Halifax time):

    trip  stop 1001  stop 1002   recorded at 1001 (delay)   recorded at 1002 (delay)
    g1    18:00      18:02       18:01 (60)                 18:04 (120)
    g2    18:10      18:12       18:19 (540)                18:21 (540)
    g3    18:20      18:22       18:20 (0)                  18:22 (0)      one minute behind g2: bunched
    g4    18:30      18:32       never in the feed, collector fetching all along: Not seen
    g5    23:50      23:52       after the as-of time: Not yet due
    g6    15:00      15:02       never in the feed, collector not running then: Not covered
"""
import datetime as dt
from decimal import Decimal

import psycopg
import pytest
from google.transit import gtfs_realtime_pb2 as rt

from collector.common import Log
from collector.gtfs_schedule import loader
from collector.transit_realtime.collector import Collector
from feeds import FakeFetch, alerts, gtfs_zip, vehicle_positions

HALIFAX = dt.timezone(dt.timedelta(hours=-4))          # 20 Nov 2026 is standard time (AST, UTC-4)
DAY = dt.date(2026, 11, 20)


def at(hhmm: str) -> dt.datetime:
    h, m = map(int, hhmm.split(":"))
    return dt.datetime(2026, 11, 20, h, m, tzinfo=HALIFAX)


PLAN = {"g1": "18:00", "g2": "18:10", "g3": "18:20", "g4": "18:30", "g5": "23:50", "g6": "15:00"}
RECORDED = {"g1": [("18:01", 60), ("18:04", 120)], "g2": [("18:19", 540), ("18:21", 540)],
            "g3": [("18:20", 0), ("18:22", 0)]}


def plus2(hhmm):
    h, m = map(int, hhmm.split(":"))
    return f"{h:02d}:{m + 2:02d}:00"


GOLD_GTFS = {
    "feed_info.txt": "feed_publisher_name,feed_start_date,feed_end_date,feed_version\n"
                     "Halifax Transit,20260824,20261129,2026_08_August_20260806\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\n1,1,Spring Garden,3\n",
    "stops.txt": "stop_id,stop_code,stop_name,stop_lat,stop_lon\n"
                 "1001,1001,Scotia Square,44.6488,-63.5752\n1002,1002,Barrington at Duke,44.6497,-63.5741\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id\n"
                 + "".join(f"1,WKDY,{t},To Bridge,0\n" for t in PLAN),
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                      + "".join(f"{t},{p}:00,{p}:00,1001,1\n{t},{plus2(p)},{plus2(p)},1002,2\n" for t, p in PLAN.items()),
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                    "WKDY,1,1,1,1,1,0,0,20260824,20261129\n",
    "calendar_dates.txt": "service_id,date,exception_type\n",
}


def recorded_trip_updates() -> bytes:
    m = rt.FeedMessage()
    m.header.gtfs_realtime_version = "2.0"
    m.header.timestamp = int(at("18:30").timestamp())
    for n, (trip, stops) in enumerate(RECORDED.items()):
        tu = m.entity.add(id=str(n)).trip_update
        tu.trip.trip_id, tu.trip.route_id, tu.trip.start_date = trip, "1", "20261120"
        tu.vehicle.id, tu.vehicle.label = f"25{n}", f"5{n}"
        for seq, (hhmm, delay) in enumerate(stops, start=1):
            s = tu.stop_time_update.add(stop_sequence=seq, stop_id=str(1000 + seq))
            s.arrival.time, s.arrival.delay = int(at(hhmm).timestamp()), delay
            s.departure.time = int(at(hhmm).timestamp())
    return m.SerializeToString()


@pytest.fixture
def service_day(db, sql, tmp_path):
    f = tmp_path / "gold.zip"
    f.write_bytes(gtfs_zip(GOLD_GTFS))
    loader.run(f)
    c = Collector(Log("test_gold"), fetch=FakeFetch(
        fetched=at("18:30").astimezone(dt.timezone.utc),
        content={"SRC-002": recorded_trip_updates(), "SRC-001": vehicle_positions(), "SRC-003": alerts(False)}))
    try:
        c.cycle()
    finally:
        c.close()
    # The collector fetching trip updates every minute from 17:55 to 18:40 (and not at 15:00).
    with psycopg.connect(db, autocommit=True) as conn:
        conn.execute("""INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status)
                        SELECT 'SRC-002', t, 200 FROM generate_series(%s::timestamptz, %s::timestamptz, interval '1 minute') t""",
                     (at("17:55"), at("18:40")))
    return sql


def test_observed_arrivals_match_the_plan(service_day):
    rows = service_day("""SELECT source_trip_key, stop_code, reported_delay_seconds,
                                 extract(epoch FROM actual_arrival_ts - scheduled_arrival_ts)::int, direction_code
                            FROM gold.observed_stop_arrival(%s) ORDER BY 1, 2""", (DAY,))
    assert rows == [("g1", "1001", 60, 60, "0"), ("g1", "1002", 120, 120, "0"), ("g2", "1001", 540, 540, "0"),
                    ("g2", "1002", 540, 540, "0"), ("g3", "1001", 0, 0, "0"), ("g3", "1002", 0, 0, "0")]


def test_trn_q02_lateness_by_route_and_hour(service_day):
    assert service_day("""SELECT route_short_name, hour_of_day, days_observed, arrival_count, on_time_count, late_count,
                                 early_count, late_share, median_delay_seconds
                            FROM gold.route_lateness_by_hour(%s, %s)""", (DAY, DAY)) == [
        ("1", 18, 1, 6, 4, 2, 0, Decimal("0.3333"), Decimal("90"))]
    # Stricter limits come from the business rules, not the code.
    assert service_day("SELECT late_count FROM gold.route_lateness_by_hour(%s, %s, -60, 100)", (DAY, DAY)) == [(3,)]


def test_headways_and_completeness(service_day):
    rows = service_day("""SELECT source_trip_key, actual_headway_seconds::int, scheduled_headway_seconds::int,
                                 next_actual_headway_seconds::int, headway_complete
                            FROM gold.stop_headway(%s) WHERE stop_code = '1001' ORDER BY actual_arrival_ts""", (DAY,))
    # g1: no recorded bus before it; its planned predecessor is g6 at 15:00, three hours earlier.
    assert rows == [("g1", None, 10800, 1080, False), ("g2", 1080, 600, 60, True), ("g3", 60, 600, None, True)]


def test_trn_q03_bunching(service_day):
    rows = service_day("""SELECT stop_code, source_trip_key, hour_of_day, actual_headway_seconds::int, followed_by_long_gap
                            FROM gold.bus_bunching(%s) ORDER BY 1""", (DAY,))
    assert rows == [("1001", "g3", 18, 60, False), ("1002", "g3", 18, 60, False)]
    assert service_day("""SELECT route_short_name, hour_of_day, headways_judged, bunched_count, bunched_share
                            FROM gold.bunching_by_route_hour(%s, %s)""", (DAY, DAY)) == [
        ("1", 18, 4, 2, Decimal("0.5000"))]


def test_trn_q04_actual_versus_scheduled_wait(service_day):
    rows = service_day("""SELECT stop_code, headways_observed, average_actual_headway_seconds,
                                 average_scheduled_headway_seconds, expected_actual_wait_seconds,
                                 expected_scheduled_wait_seconds, excess_wait_seconds
                            FROM gold.stop_wait_comparison(%s, %s) ORDER BY 1""", (DAY, DAY))
    # Stop 1001: gaps of 1080 s and 60 s against a plan of 600 s: (1080^2 + 60^2) / (2 x 1140) = 513.2 s.
    assert rows[0] == ("1001", 2, Decimal("570.0"), Decimal("600.0"), Decimal("513.2"), Decimal("300.0"), Decimal("213.2"))


def test_trn_q05_scheduled_trip_status(service_day):
    as_of = at("20:00")
    rows = service_day("""SELECT source_trip_key, trip_status FROM gold.scheduled_trip_status(%s, %s) ORDER BY 1""",
                       (DAY, as_of))
    assert rows == [("g1", "Seen"), ("g2", "Seen"), ("g3", "Seen"), ("g4", "Not seen"), ("g5", "Not yet due"),
                    ("g6", "Not covered")]


def test_trn_q11_segment_speed(service_day):
    (row,) = service_day("""SELECT from_stop_name, to_stop_name, straight_line_metres, days_observed, observation_count,
                                   median_actual_seconds, median_scheduled_seconds, median_speed_km_per_hour,
                                   slow_day_count, slow_day_share
                              FROM gold.segment_speed(%s, %s)""", (DAY, DAY))
    assert row[:2] == ("Scotia Square", "Barrington at Duke")
    assert 120 < row[2] < 140
    assert row[3:7] == (1, 3, Decimal("120.0"), Decimal("120.0"))
    assert row[7] == round(row[2] / 120 * Decimal("3.6"), 1)
    assert row[8:] == (0, Decimal("0.0000"))
    # With a ratio below 1 the same day counts as slow: the threshold is a parameter, not code.
    assert service_day("SELECT slow_day_count FROM gold.segment_speed(%s, %s, 0.9)", (DAY, DAY)) == [(1,)]


def test_measures_return_nothing_for_a_day_with_no_history(service_day):
    other = dt.date(2026, 11, 19)
    for fn in ("route_lateness_by_hour", "bunching_by_route_hour", "stop_wait_comparison", "segment_speed"):
        assert service_day(f"SELECT count(*) FROM gold.{fn}(%s, %s)", (other, other)) == [(0,)]
    assert service_day("SELECT DISTINCT trip_status FROM gold.scheduled_trip_status(%s, %s)", (other, at("20:00"))) == [
        ("Not covered",)]
