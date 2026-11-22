"""The GTFS schedule loader against a scratch database: what lands in silver, and that a reload changes nothing."""
import datetime as dt

from collector.gtfs_schedule import loader
from feeds import GTFS_FILES, gtfs_zip

HIST = ["location_hist", "asset_hist", "route_hist", "stop_hist"]


def load(tmp_path, data: bytes, name="google_transit.zip"):
    f = tmp_path / name
    f.write_bytes(data)
    return loader.run(f)


def counts(sql, tables):
    return {t: sql(f"SELECT count(*) FROM silver.{t}")[0][0] for t in tables}


def test_first_load_fills_the_schedule_tables(db, sql, tmp_path):
    version = load(tmp_path, gtfs_zip())
    assert sql("SELECT feed_version_label, feed_published_date, service_period_start_date, service_period_end_date "
               "FROM silver.schedule_version WHERE schedule_version_id = %s", (version,)) == [
        ("2026_08_August_20260806", dt.date(2026, 8, 6), dt.date(2026, 8, 24), dt.date(2026, 11, 29))]
    assert counts(sql, ["stop", "route", "service_calendar", "service_calendar_exception", "scheduled_trip",
                        "scheduled_stop_time"]) == {
        "stop": 3, "route": 2, "service_calendar": 2, "service_calendar_exception": 3, "scheduled_trip": 2,
        "scheduled_stop_time": 3}

    # Stops: point locations, parent station set in the same statement, codes from the model's domains.
    rows = sql("""SELECT a.source_asset_key, s.stop_code, s.stop_kind_code, p.source_asset_key, s.wheelchair_boarding_code,
                         ST_AsText(l.location_geometry), l.location_type_code, a.subsector_id
                    FROM silver.stop s JOIN silver.asset a USING (asset_id) JOIN silver.location l USING (location_id)
                    LEFT JOIN silver.asset p ON p.asset_id = s.parent_stop_asset_id
                   ORDER BY 1""")
    assert rows[0] == ("1001", "1001", "Stop", "T1", "Accessible", "POINT(-63.5752 44.6488)", "Point", "TRN-01")
    assert rows[2] == ("T1", None, "Station", None, None, "POINT(-63.5 44.6)", "Point", "TRN-01")

    # Routes: a route line from shapes where there is one; the ferry has no shape, so no location.
    assert sql("""SELECT a.source_asset_key, r.route_mode_code, a.asset_name, ST_GeometryType(l.location_geometry)
                    FROM silver.route r JOIN silver.asset a USING (asset_id)
                    LEFT JOIN silver.location l USING (location_id) ORDER BY 1""") == [
        ("1", "Bus", "Route 1 Spring Garden", "ST_MultiLineString"), ("F1", "Ferry", "Route F1 Ferry", None)]

    # One fetch row, its raw file kept and recorded with a forward-slash path relative to the data dir.
    (path, size), = sql("SELECT file_path, file_bytes FROM bronze.feed_fetch WHERE source_id = 'SRC-004'")
    assert path.startswith("bronze/SRC-004/") and path.endswith(".zip") and "\\" not in path
    assert (tmp_path / "data" / path).stat().st_size == size


def test_planned_stop_times_follow_calendar_and_exceptions(db, sql, tmp_path):
    load(tmp_path, gtfs_zip())
    # Thursday 12 Nov: the weekday trip, including its 25:10 stop on the next calendar day (Halifax time).
    rows = sql("""SELECT source_trip_key, stop_sequence_number,
                         to_char(scheduled_arrival_ts AT TIME ZONE 'America/Halifax', 'YYYY-MM-DD HH24:MI')
                    FROM gold.planned_stop_time('2026-11-12') ORDER BY 1, 2""")
    assert rows == [("t1", 1, "2026-11-12 05:49"), ("t1", 2, "2026-11-13 01:10")]
    # Remembrance Day: the weekday service is removed and the holiday service added.
    assert sql("SELECT source_trip_key FROM gold.planned_stop_time('2026-11-11')") == [("t2",)]
    assert sql("SELECT count(*) FROM gold.planned_stop_time('2026-12-05')") == [(0,)]


def test_reload_of_the_same_file_adds_no_history_and_no_schedule(db, sql, tmp_path):
    first = load(tmp_path, gtfs_zip())
    before = counts(sql, ["schedule_version", "scheduled_trip", "scheduled_stop_time", "location", "asset"] + HIST)
    second = load(tmp_path, gtfs_zip(), name="again.zip")
    after = counts(sql, ["schedule_version", "scheduled_trip", "scheduled_stop_time", "location", "asset"] + HIST)
    assert second == first
    assert after == before and all(after[t] == 0 for t in HIST)
    # Two fetch rows, one raw file: the identical download reuses the file already kept.
    assert sql("SELECT count(*), count(DISTINCT file_path) FROM bronze.feed_fetch WHERE source_id = 'SRC-004'") == [(2, 1)]


def test_new_version_keeps_the_old_one_and_retires_missing_stops(db, sql, tmp_path):
    load(tmp_path, gtfs_zip())
    files = dict(GTFS_FILES)
    files["feed_info.txt"] = files["feed_info.txt"].replace("2026_08_August_20260806", "2026_11_November_20261120")
    files["feed_info.txt"] = files["feed_info.txt"].replace("20260824,20261129", "20261130,20270301")
    files["calendar.txt"] = files["calendar.txt"].replace("20260824,20261129", "20261130,20270301")
    files["stops.txt"] = "\n".join(l for l in files["stops.txt"].splitlines() if not l.startswith("1002")) + "\n"
    files["stop_times.txt"] = "\n".join(l for l in files["stop_times.txt"].splitlines() if ",1002," not in l) + "\n"
    load(tmp_path, gtfs_zip(files), name="next.zip")

    assert sql("SELECT feed_version_label FROM silver.schedule_version ORDER BY 1") == [
        ("2026_08_August_20260806",), ("2026_11_November_20261120",)]
    assert sql("""SELECT asset_status_code, out_of_service_date IS NOT NULL FROM silver.asset
                   WHERE asset_type_code = 'Stop' AND source_asset_key = '1002'""") == [("Retired", True)]
    assert sql("SELECT count(*) FROM silver.asset_hist WHERE source_asset_key = '1002'") == [(1,)]
    # Each day is planned from the newest version covering it.
    assert sql("SELECT DISTINCT schedule_version_id FROM gold.planned_stop_time('2026-12-03')") == [(2,)]
    assert sql("SELECT DISTINCT schedule_version_id FROM gold.planned_stop_time('2026-11-12')") == [(1,)]
