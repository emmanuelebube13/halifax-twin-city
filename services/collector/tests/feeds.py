"""Small recorded-style feeds for the database tests: a tiny GTFS zip and matching GTFS Realtime messages."""
import datetime as dt
import io
import zipfile

from google.transit import gtfs_realtime_pb2 as rt

from collector.common import Download

UTC = dt.timezone.utc
FETCHED = dt.datetime(2026, 11, 20, 23, 0, 0, tzinfo=UTC)          # 19:00 Halifax time, Friday 20 Nov 2026
T = int(FETCHED.timestamp())

GTFS_FILES = {
    "feed_info.txt": "feed_publisher_name,feed_start_date,feed_end_date,feed_version\n"
                     "Halifax Transit,20260824,20261129,2026_08_August_20260806\n",
    "routes.txt": "route_id,route_short_name,route_long_name,route_type\n1,1,Spring Garden,3\nF1,F1,Ferry,4\n",
    "stops.txt": "stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station,wheelchair_boarding\n"
                 "T1,,Terminal,44.6,-63.5,1,,\n1001,1001,Scotia Square,44.6488,-63.5752,0,T1,1\n"
                 "1002,1002,Barrington at Duke,44.6497,-63.5741,0,,2\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\n"
                 "1,WKDY,t1,To Bridge,0,b1,s1\n1,HOL,t2,Holiday,1,b2,s1\n",
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint\n"
                      "t1, 5:49:00, 5:49:30,1001,1,0,0,1\nt1,25:10:00,25:10:00,1002,2,,,\n"
                      "t2,10:00:00,10:00:00,1001,1,,,\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                    "WKDY,1,1,1,1,1,0,0,20260824,20261129\n",
    "calendar_dates.txt": "service_id,date,exception_type\nWKDY,20261111,2\nHOL,20261111,1\nHOL,20261225,1\n",
    "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
                  "s1,44.65,-63.58,2\ns1,44.64,-63.57,1\n",
}


def gtfs_zip(files: dict | None = None, **changes) -> bytes:
    """The tiny GTFS feed as zip bytes; keyword arguments replace whole files (for example stops_txt=...)."""
    files = dict(files or GTFS_FILES)
    for name, text in changes.items():
        files[name.replace("_txt", ".txt")] = text
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    return buf.getvalue()


def _feed() -> rt.FeedMessage:
    m = rt.FeedMessage()
    m.header.gtfs_realtime_version = "2.0"
    m.header.timestamp = T
    return m


def trip_updates(route_id: str = "1") -> bytes:
    """Trip t1 on route 1, bus 2533: stop 1001 passed 60 s ago (30 s late), stop 1002 still ahead."""
    m = _feed()
    tu = m.entity.add(id="1").trip_update
    tu.trip.trip_id, tu.trip.route_id, tu.trip.start_date = "t1", route_id, "20261120"
    tu.vehicle.id, tu.vehicle.label = "2533", "533"
    for seq, stop, offset, delay in [(1, "1001", -60, 30), (2, "1002", 300, 45)]:
        s = tu.stop_time_update.add(stop_sequence=seq, stop_id=stop)
        s.arrival.time, s.arrival.delay = T + offset, delay
        s.departure.time = T + offset + 20
    return m.SerializeToString()


def vehicle_positions(seconds_ago: int = 9) -> bytes:
    m = _feed()
    v = m.entity.add(id="533").vehicle
    v.trip.trip_id, v.trip.start_date = "t1", "20261120"
    v.position.latitude, v.position.longitude, v.position.speed = 44.6488, -63.5752, 6.7
    v.position.bearing = 90
    v.current_stop_sequence, v.timestamp = 2, T - seconds_ago
    v.current_status = rt.VehiclePosition.IN_TRANSIT_TO
    v.vehicle.id, v.vehicle.label = "2533", "533"
    return m.SerializeToString()


def alerts(with_alert: bool = True) -> bytes:
    m = _feed()
    if with_alert:
        a = m.entity.add(id="179136").alert
        a.active_period.add(start=T - 3600, end=32503694400)
        a.informed_entity.add(route_id="1", stop_id="1001")
        a.cause, a.effect = rt.Alert.CONSTRUCTION, rt.Alert.DETOUR
        a.header_text.translation.add(text="Stop closure at 1001", language="en")
    return m.SerializeToString()


class FakeFetch:
    """Stands in for common.download: returns the bytes set for each source, fetched at FETCHED."""

    def __init__(self, fetched: dt.datetime = FETCHED, content: dict | None = None):
        self.fetched = fetched
        self.content = {"SRC-001": vehicle_positions(), "SRC-002": trip_updates(), "SRC-003": alerts(), **(content or {})}
        self.calls = 0

    def __call__(self, source_id: str, url: str) -> Download:
        self.calls += 1
        body = self.content[source_id]
        if body is None:
            return Download(source_id, url, self.fetched, 503, None, "HTTP 503")
        return Download(source_id, url, self.fetched, 200, body)
