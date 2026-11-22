"""Read a GTFS zip into plain rows. No database here, so it is easy to test."""
from __future__ import annotations

import csv
import datetime as dt
import io
import zipfile
from collections import defaultdict

ROUTE_MODE = {"3": "Bus", "4": "Ferry", "715": "Bus"}       # GTFS route_type -> Route Mode Code (Bus, Ferry)
STOP_KIND = {"": "Stop", "0": "Stop", "1": "Station", "2": "Entrance", "3": "Node", "4": "Boarding area"}
EXCEPTION_TYPE = {"1": "Added", "2": "Removed"}            # Exception Type Code (Added, Removed)


def read_table(z: zipfile.ZipFile, name: str) -> list[dict]:
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(text)]


def gtfs_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y%m%d").date()


def gtfs_time(s: str) -> str | None:
    """'25:30:00' stays '25:30:00': stored as an interval, so trips after midnight keep their order."""
    s = s.strip()
    if not s:
        return None
    h, m, sec = s.split(":")
    return f"{int(h):02d}:{int(m):02d}:{int(sec):02d}"


def flag(s: str) -> bool:
    return s.strip() == "1"


class Feed:
    def __init__(self, data: bytes):
        self.z = zipfile.ZipFile(io.BytesIO(data))
        self.feed_info = (read_table(self.z, "feed_info.txt") or [{}])[0]
        self.routes = read_table(self.z, "routes.txt")
        self.stops = read_table(self.z, "stops.txt")
        self.trips = read_table(self.z, "trips.txt")
        self.calendar = read_table(self.z, "calendar.txt")
        self.calendar_dates = read_table(self.z, "calendar_dates.txt")
        self.calendar += self._date_only_services()

    def _date_only_services(self) -> list[dict]:
        """GTFS lets a service exist only in calendar_dates.txt. The model needs a service_calendar row for it,
        so it gets one with no weekdays, spanning its listed dates: only its 'Added' dates make it run."""
        weekly = {c["service_id"] for c in self.calendar}
        dates: dict[str, list[str]] = defaultdict(list)
        for c in self.calendar_dates:
            if c["service_id"] not in weekly:
                dates[c["service_id"]].append(c["date"])
        days = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        return [{"service_id": sid, **{d: "0" for d in days}, "start_date": min(ds), "end_date": max(ds)}
                for sid, ds in sorted(dates.items())]

    # ---- the version this file represents
    def version_label(self) -> str:
        return self.feed_info.get("feed_version") or ""

    def service_period(self) -> tuple[dt.date, dt.date]:
        if self.feed_info.get("feed_start_date") and self.feed_info.get("feed_end_date"):
            return gtfs_date(self.feed_info["feed_start_date"]), gtfs_date(self.feed_info["feed_end_date"])
        days = [gtfs_date(c[k]) for c in self.calendar for k in ("start_date", "end_date")]
        days += [gtfs_date(c["date"]) for c in self.calendar_dates]
        return min(days), max(days)

    # ---- geometry
    def route_lines(self) -> dict[str, list[list[tuple[float, float]]]]:
        """route_id -> list of lines (each a list of lon, lat), one per distinct shape the route uses."""
        shapes: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        for row in read_table(self.z, "shapes.txt"):
            shapes[row["shape_id"]].append((int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]),
                                            float(row["shape_pt_lat"])))
        by_route: dict[str, set] = defaultdict(set)
        for t in self.trips:
            if t.get("shape_id"):
                by_route[t["route_id"]].add(t["shape_id"])
        out = {}
        for route_id, shape_ids in by_route.items():
            lines = []
            for sid in sorted(shape_ids):
                pts = [(lon, lat) for _, lon, lat in sorted(shapes.get(sid, []))]
                if len(pts) >= 2:
                    lines.append(pts)
            if lines:
                out[route_id] = lines
        return out

    # ---- the biggest table, streamed
    def stop_times(self):
        """Yields (trip_id, stop_sequence, stop_id, arrival, departure, timepoint, pickup, drop_off)."""
        with self.z.open("stop_times.txt") as f:
            text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
            reader = csv.reader(text)
            header = [h.strip() for h in next(reader)]
            i = {h: n for n, h in enumerate(header)}
            tp = i.get("timepoint")
            pu = i.get("pickup_type")
            do = i.get("drop_off_type")
            for row in reader:
                if not row:
                    continue
                yield (row[i["trip_id"]].strip(), int(row[i["stop_sequence"]]), row[i["stop_id"]].strip(),
                       gtfs_time(row[i["arrival_time"]]), gtfs_time(row[i["departure_time"]]),
                       (row[tp].strip() == "1") if tp is not None and row[tp].strip() else None,
                       (row[pu].strip() or None) if pu is not None else None,
                       (row[do].strip() or None) if do is not None else None)


def multiline_wkt(lines: list[list[tuple[float, float]]]) -> str:
    parts = ",".join("(" + ",".join(f"{lon:.6f} {lat:.6f}" for lon, lat in line) + ")" for line in lines)
    return f"MULTILINESTRING({parts})"
