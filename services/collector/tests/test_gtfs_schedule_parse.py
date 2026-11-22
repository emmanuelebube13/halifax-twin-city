"""Reading a GTFS zip, using a tiny feed built in memory."""
import datetime as dt
import io
import zipfile

from collector.gtfs_schedule import gtfs
from collector.gtfs_schedule.loader import published_date

FILES = {
    "feed_info.txt": "feed_publisher_name,feed_start_date,feed_end_date,feed_version\n"
                     "Halifax Transit,20260824,20261129,2026_08_August_20260806\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\n1,1,Spring Garden,3\nF1,F1,Ferry,4\n",
    "stops.txt": "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station,wheelchair_boarding\n"
                 "T1,,Terminal,44.6,-63.5,1,,\n1001,1001,Scotia Square,44.6488,-63.5752,0,T1,1\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\n"
                 "1,WKDY,t1,To Bridge,0,b1,s1\n1,HOL,t2,Holiday,1,b2,s1\n",
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint\n"
                      "t1, 5:49:00, 5:49:30,1001,1,0,0,1\nt1,25:10:00,25:10:00,1001,2,,,\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                    "WKDY,1,1,1,1,1,0,0,20260824,20261129\n",
    "calendar_dates.txt": "service_id,date,exception_type\nWKDY,20261111,2\nHOL,20261111,1\nHOL,20261225,1\n",
    "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
                  "s1,44.65,-63.58,2\ns1,44.64,-63.57,1\n",
}


def make_feed() -> gtfs.Feed:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, text in FILES.items():
            z.writestr(name, text)
    return gtfs.Feed(buf.getvalue())


def test_version_and_period():
    f = make_feed()
    assert f.version_label() == "2026_08_August_20260806"
    assert f.service_period() == (dt.date(2026, 8, 24), dt.date(2026, 11, 29))
    assert published_date(f.version_label(), dt.date(2026, 1, 1)) == dt.date(2026, 8, 6)
    assert published_date("no-date-here", dt.date(2026, 1, 1)) == dt.date(2026, 1, 1)


def test_date_only_service_gets_a_calendar_row_with_no_weekdays():
    hol = [c for c in make_feed().calendar if c["service_id"] == "HOL"]
    assert len(hol) == 1
    assert hol[0]["start_date"] == "20261111" and hol[0]["end_date"] == "20261225"
    assert not any(gtfs.flag(hol[0][d]) for d in ("monday", "tuesday", "wednesday", "thursday", "friday",
                                                   "saturday", "sunday"))


def test_stop_times_keep_times_after_midnight():
    rows = list(make_feed().stop_times())
    assert rows[0] == ("t1", 1, "1001", "05:49:00", "05:49:30", True, "0", "0")
    assert rows[1] == ("t1", 2, "1001", "25:10:00", "25:10:00", None, None, None)


def test_route_lines_follow_shape_order():
    lines = make_feed().route_lines()
    assert lines == {"1": [[(-63.57, 44.64), (-63.58, 44.65)]]}
    assert gtfs.multiline_wkt(lines["1"]) == "MULTILINESTRING((-63.570000 44.640000,-63.580000 44.650000))"


def test_codes():
    assert gtfs.ROUTE_MODE["3"] == "Bus" and gtfs.ROUTE_MODE["4"] == "Ferry"
    assert gtfs.STOP_KIND["1"] == "Station" and gtfs.EXCEPTION_TYPE == {"1": "Added", "2": "Removed"}
