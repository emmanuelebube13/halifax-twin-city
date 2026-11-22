"""Load the Halifax Transit GTFS schedule (SRC-004).

Run from the services folder:

    python -m collector.gtfs_schedule               download the current file and load it
    python -m collector.gtfs_schedule --file X.zip  load a file already on disk (for an old version)

Routes and stops are assets (they change slowly, and history is kept by SCD2). The schedule itself is
versioned: each new GTFS file becomes one schedule_version with its calendar, trips and stop times.
Loading the same version twice refreshes the routes and stops and leaves the schedule as it is.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

from ..common import Download, Log, connect, download, log_fetch, save_raw_once, settings
from ..settings import REPO_ROOT, describe_database
from . import gtfs

SOURCE_ID = "SRC-004"
URL = "http://gtfs.halifax.ca/static/google_transit.zip"
SUBSECTOR = "TRN-01"
WHEELCHAIR = {"": None, "0": "No information", "1": "Accessible", "2": "Not accessible"}
GOLD_DIR = REPO_ROOT / "database" / "gold"
# Installed in this order after every load: each file builds on the ones before it.
GOLD_SQL_FILES = ["planned_stop_time.sql", "observed_stop_arrival.sql", "stop_headway.sql",
                  "trn_q02_route_lateness.sql", "trn_q03_bunching.sql", "trn_q04_stop_wait.sql",
                  "trn_q05_trip_status.sql", "trn_q11_segment_speed.sql"]

say = Log("gtfs_schedule")


def published_date(label: str, fallback: dt.date) -> dt.date:
    """Halifax labels look like 2026_08_August_20260806: the trailing date is when it was published."""
    m = re.search(r"(20\d{6})$", label or "")
    return dt.datetime.strptime(m.group(1), "%Y%m%d").date() if m else fallback


def upsert_locations(conn, rows, batch_id) -> dict[str, int]:
    """rows: (key, type, name, geometry_type, wkt). Returns key -> location_id."""
    if not rows:
        return {}
    keys, types, names, gtypes, wkts = map(list, zip(*rows))
    return dict(conn.execute(
        """INSERT INTO silver.location (location_type_code, location_name, geometry_type_code, location_geometry,
                                         centroid_latitude, centroid_longitude, source_id, source_location_key, dw_batch_id)
           SELECT t, n, gt, g, round(ST_Y(ST_Centroid(g))::numeric, 6), round(ST_X(ST_Centroid(g))::numeric, 6), %s, k, %s
             FROM (SELECT k, t, n, gt, ST_SetSRID(ST_GeomFromText(w), 4326) AS g
                     FROM unnest(%s::text[], %s::text[], %s::text[], %s::text[], %s::text[]) AS u(k, t, n, gt, w)) s
           ON CONFLICT ON CONSTRAINT ak1_location DO UPDATE
              SET location_name = EXCLUDED.location_name, location_geometry = EXCLUDED.location_geometry,
                  centroid_latitude = EXCLUDED.centroid_latitude, centroid_longitude = EXCLUDED.centroid_longitude,
                  dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id
           RETURNING source_location_key, location_id""",
        (SOURCE_ID, batch_id, keys, types, names, gtypes, wkts)).fetchall())


def upsert_assets(conn, asset_type, rows, batch_id) -> dict[str, int]:
    """rows: (source_asset_key, name, location_id). Returns key -> asset_id."""
    if not rows:
        return {}
    keys, names, locs = map(list, zip(*rows))
    return dict(conn.execute(
        """INSERT INTO silver.asset (asset_type_code, asset_name, location_id, subsector_id, source_id,
                                      source_asset_key, asset_status_code, dw_batch_id)
           SELECT %s, n, l, %s, %s, k, 'Active', %s FROM unnest(%s::text[], %s::text[], %s::bigint[]) AS u(k, n, l)
           ON CONFLICT ON CONSTRAINT ak1_asset DO UPDATE
              SET asset_name = EXCLUDED.asset_name, location_id = EXCLUDED.location_id,
                  asset_status_code = 'Active', out_of_service_date = NULL,
                  dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id
           RETURNING source_asset_key, asset_id""",
        (asset_type, SUBSECTOR, SOURCE_ID, batch_id, keys, names, locs)).fetchall())


def retire_missing(conn, asset_type, keep_keys, batch_id) -> int:
    """Routes or stops no longer in the schedule become Inactive (their history stays)."""
    return conn.execute(
        """UPDATE silver.asset SET asset_status_code = 'Inactive', out_of_service_date = CURRENT_DATE,
                                   dw_loaded_ts = now(), dw_batch_id = %s
            WHERE source_id = %s AND asset_type_code = %s AND asset_status_code = 'Active'
              AND NOT (source_asset_key = ANY(%s))""",
        (batch_id, SOURCE_ID, asset_type, list(keep_keys))).rowcount


def load_stops(conn, feed: gtfs.Feed, batch_id) -> dict[str, int]:
    stops = [s for s in feed.stops if s.get("stop_lat") and s.get("stop_lon")]
    locs = upsert_locations(conn, [
        (f"stop-{s['stop_id']}", "Point", s["stop_name"][:200], "Point",
         f"POINT({float(s['stop_lon']):.6f} {float(s['stop_lat']):.6f})") for s in stops], batch_id)
    ids = upsert_assets(conn, "Stop", [(s["stop_id"], s["stop_name"][:200], locs[f"stop-{s['stop_id']}"]) for s in stops],
                        batch_id)
    seen_codes = set()
    rows = []
    for s in stops:
        code = s.get("stop_code") or None
        if code in seen_codes:
            code = None                       # stop_code must be unique (ak1_stop)
        seen_codes.add(code)
        rows.append((ids[s["stop_id"]], code, s["stop_name"][:200], gtfs.STOP_KIND.get(s.get("location_type", ""), "Stop"),
                     ids.get(s.get("parent_station") or ""), WHEELCHAIR.get(s.get("wheelchair_boarding", ""))))
    # Parent stations go in the same statement: foreign keys are checked at the end of it, and a second
    # UPDATE would leave a false "no parent" version in stop_hist.
    a, c, n, k, p, w = map(list, zip(*rows))
    conn.execute(
        """INSERT INTO silver.stop (asset_id, stop_code, stop_name, stop_kind_code, parent_stop_asset_id,
                                    wheelchair_boarding_code, dw_batch_id)
           SELECT a, c, n, k, p, w, %s
             FROM unnest(%s::bigint[], %s::text[], %s::text[], %s::text[], %s::bigint[], %s::text[]) AS u(a, c, n, k, p, w)
           ON CONFLICT (asset_id) DO UPDATE
              SET stop_code = EXCLUDED.stop_code, stop_name = EXCLUDED.stop_name, stop_kind_code = EXCLUDED.stop_kind_code,
                  parent_stop_asset_id = EXCLUDED.parent_stop_asset_id,
                  wheelchair_boarding_code = EXCLUDED.wheelchair_boarding_code,
                  dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id""",
        (batch_id, a, c, n, k, p, w))
    retired = retire_missing(conn, "Stop", ids.keys(), batch_id)
    say(f"stops: {len(ids)} loaded, {retired} retired")
    return ids


def load_routes(conn, feed: gtfs.Feed, batch_id) -> dict[str, int]:
    lines = feed.route_lines()
    locs = upsert_locations(conn, [
        (f"route-{r['route_id']}", "Line", f"Route {r['route_short_name']} {r['route_long_name']}".strip()[:200], "Line",
         gtfs.multiline_wkt(lines[r["route_id"]])) for r in feed.routes if r["route_id"] in lines], batch_id)
    ids = upsert_assets(conn, "Route", [
        (r["route_id"], f"Route {r['route_short_name']} {r['route_long_name']}".strip()[:200],
         locs.get(f"route-{r['route_id']}")) for r in feed.routes], batch_id)
    rows = [(ids[r["route_id"]], (r["route_short_name"] or r["route_id"])[:200], (r["route_long_name"] or None),
             gtfs.ROUTE_MODE.get(r["route_type"], "Bus")) for r in feed.routes]
    a, s, l, m = map(list, zip(*rows))
    conn.execute(
        """INSERT INTO silver.route (asset_id, route_short_name, route_long_name, route_mode_code, dw_batch_id)
           SELECT a, s, l, m, %s FROM unnest(%s::bigint[], %s::text[], %s::text[], %s::text[]) AS u(a, s, l, m)
           ON CONFLICT (asset_id) DO UPDATE
              SET route_short_name = EXCLUDED.route_short_name, route_long_name = EXCLUDED.route_long_name,
                  route_mode_code = EXCLUDED.route_mode_code, dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id""",
        (batch_id, a, s, l, m))
    retired = retire_missing(conn, "Route", ids.keys(), batch_id)
    say(f"routes: {len(ids)} loaded ({len(locs)} with a route line), {retired} retired")
    return ids


def load_schedule(conn, feed: gtfs.Feed, routes, stops, fetched: dt.date, batch_id) -> int:
    start, end = feed.service_period()
    label = feed.version_label()
    version_id = conn.execute(
        """INSERT INTO silver.schedule_version (source_id, feed_version_label, feed_published_date,
                                                service_period_start_date, service_period_end_date, dw_batch_id)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING schedule_version_id""",
        (SOURCE_ID, label or None, published_date(label, fetched), start, end, batch_id)).fetchone()[0]

    cur = conn.cursor()
    cur.executemany(
        """INSERT INTO silver.service_calendar (schedule_version_id, service_code, monday_flag, tuesday_flag,
               wednesday_flag, thursday_flag, friday_flag, saturday_flag, sunday_flag, start_date, end_date, dw_batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        [(version_id, c["service_id"], *(gtfs.flag(c[d]) for d in
          ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")),
          gtfs.gtfs_date(c["start_date"]), gtfs.gtfs_date(c["end_date"]), batch_id) for c in feed.calendar])
    cur.executemany(
        """INSERT INTO silver.service_calendar_exception (schedule_version_id, service_code, exception_date,
                                                          exception_type_code, dw_batch_id)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
        [(version_id, c["service_id"], gtfs.gtfs_date(c["date"]), gtfs.EXCEPTION_TYPE.get(c["exception_type"], "Added"),
          batch_id) for c in feed.calendar_dates])

    trips = [t for t in feed.trips if t["route_id"] in routes]
    k, s, r, d, h, b, sh, w = map(list, zip(*[
        (t["trip_id"], t["service_id"], routes[t["route_id"]], t.get("direction_id") or "0",
         (t.get("trip_headsign") or None), (t.get("block_id") or None), (t.get("shape_id") or None),
         (t.get("wheelchair_accessible") or None)) for t in trips]))
    trip_ids = dict(conn.execute(
        """INSERT INTO silver.scheduled_trip (schedule_version_id, service_code, source_trip_key, route_asset_id,
                                              direction_code, trip_headsign, block_code, shape_key,
                                              wheelchair_accessible_code, dw_batch_id)
           SELECT %s, s, k, r, d, h, b, sh, w, %s
             FROM unnest(%s::text[], %s::text[], %s::bigint[], %s::text[], %s::text[], %s::text[], %s::text[], %s::text[])
                  AS u(k, s, r, d, h, b, sh, w)
           RETURNING source_trip_key, scheduled_trip_id""",
        (version_id, batch_id, k, s, r, d, h, b, sh, w)).fetchall())

    count = skipped = 0
    with cur.copy("""COPY silver.scheduled_stop_time (scheduled_trip_id, stop_sequence_number, stop_asset_id,
                     scheduled_arrival_time, scheduled_departure_time, timepoint_flag, pickup_type_code,
                     drop_off_type_code, dw_batch_id) FROM STDIN""") as copy:
        for trip_id, seq, stop_id, arr, dep, tp, pu, do in feed.stop_times():
            if trip_id not in trip_ids or stop_id not in stops:
                skipped += 1
                continue
            copy.write_row((trip_ids[trip_id], seq, stops[stop_id], arr, dep, tp, pu, do, batch_id))
            count += 1
    say(f"schedule {label}: {start} to {end}, {len(feed.calendar)} service patterns, "
        f"{len(feed.calendar_dates)} exceptions, {len(trip_ids)} trips, {count} stop times"
        + (f" ({skipped} skipped: unknown trip or stop)" if skipped else ""))
    return version_id


def install_gold(conn):
    """The gold transit functions (database/gold/README.md). CREATE OR REPLACE, so safe to run after every load."""
    for name in GOLD_SQL_FILES:
        conn.execute((GOLD_DIR / name).read_text(encoding="utf-8"))


def run(file: Path | None = None) -> int | None:
    """Load one GTFS file. Returns the schedule_version_id, new or already loaded."""
    say(f"GTFS schedule loader into {describe_database(settings().database_url)}")
    if file:
        content = file.read_bytes()
        d = Download(SOURCE_ID, file.resolve().as_uri(), dt.datetime.now(dt.timezone.utc), 200, content)
    else:
        say(f"downloading {URL}")
        d = download(SOURCE_ID, URL, timeout=120)

    with connect(application_name="halifax-twin-gtfs-schedule") as conn:
        path = save_raw_once(conn, d, "google_transit", "zip", compress=False) if d.ok else None
        batch_id = log_fetch(conn, d, path)
        conn.commit()
        if not d.ok:
            raise SystemExit(f"Download failed: {d.error}")

        feed = gtfs.Feed(d.content)
        label = feed.version_label()
        with conn.transaction():
            stops = load_stops(conn, feed, batch_id)
            routes = load_routes(conn, feed, batch_id)
            existing = conn.execute(
                "SELECT schedule_version_id FROM silver.schedule_version WHERE source_id = %s AND feed_version_label = %s",
                (SOURCE_ID, label)).fetchone()
            if existing:
                version_id = existing[0]
                say(f"schedule {label} is already loaded (version {version_id}); routes and stops refreshed")
            else:
                version_id = load_schedule(conn, feed, routes, stops, d.fetched_ts.date(), batch_id)
            install_gold(conn)
        today = conn.execute(
            "SELECT count(*) FROM gold.planned_stop_time((now() AT TIME ZONE 'America/Halifax')::date)").fetchone()[0]
        say(f"planned stop times for today (Halifax): {today}")
        return version_id


def main(argv=None):
    ap = argparse.ArgumentParser(description="Halifax Transit GTFS schedule loader (SRC-004)")
    ap.add_argument("--file", type=Path, help="load this GTFS zip instead of downloading")
    ap.add_argument("--no-log-file", action="store_true", help="print only; do not append to the daily log file")
    ap.add_argument("--gold-only", action="store_true", help="only (re)install the gold functions, load nothing")
    args = ap.parse_args(argv)
    say.to_file = not args.no_log_file
    if args.gold_only:
        with connect(application_name="halifax-twin-gtfs-schedule") as conn:
            install_gold(conn)
        say(f"gold functions installed: {', '.join(GOLD_SQL_FILES)}")
        return
    run(args.file)
