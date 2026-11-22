"""The realtime collector and store.py against a scratch database, with recorded-style feeds instead of the network."""
import datetime as dt

import pytest

from collector.common import Log
from collector.transit_realtime import collector as rt_collector
from collector.transit_realtime.collector import AlreadyRunning, Collector
from feeds import FETCHED, FakeFetch, alerts, gtfs_zip, trip_updates, vehicle_positions
from collector.gtfs_schedule import loader


@pytest.fixture
def schedule(db, tmp_path):
    f = tmp_path / "google_transit.zip"
    f.write_bytes(gtfs_zip())
    loader.run(f)


def make(fetch):
    return Collector(Log("test_transit_realtime"), fetch=fetch)


def test_one_cycle_writes_every_feed_into_silver(schedule, sql, tmp_path):
    c = make(FakeFetch())
    try:
        summary = c.cycle()
    finally:
        c.close()
    assert summary == "1 buses (1 new positions) | 1 trips, 1 arrivals | 1 alerts"

    # Trip: event + trip subtype, keyed <trip_id>|<service date>, linked to the route and the bus.
    assert sql("""SELECT e.source_event_key, e.event_date, e.source_id, e.subsector_id, e.event_status_code,
                         ra.source_asset_key, va.source_asset_key, t.trip_schedule_status_code, t.scheduled_trip_id
                    FROM silver.trip t JOIN silver.event e USING (event_id)
                    JOIN silver.asset ra ON ra.asset_id = t.route_asset_id
                    JOIN silver.asset va ON va.asset_id = t.vehicle_asset_id""") == [
        ("t1|2026-11-20", dt.date(2026, 11, 20), "SRC-002", "TRN-01", "Scheduled", "1", "2533", "Scheduled", None)]

    # Only the passed stop is an arrival; the stop still ahead is a prediction and is not stored.
    assert sql("""SELECT e.source_event_key, e.event_start_ts, sa.stop_sequence_number, a.source_asset_key,
                         sa.reported_delay_seconds, sa.arrival_observation_method_code, e.event_status_code
                    FROM silver.stop_arrival sa JOIN silver.event e USING (event_id)
                    JOIN silver.asset a ON a.asset_id = sa.stop_asset_id""") == [
        ("t1|2026-11-20|1", FETCHED - dt.timedelta(seconds=60), 1, "1001", 30, "Reported", "Arrived")]

    # Position: one row, linked to the trip, the geometry computed by the database. GTFS-RT sends 32-bit floats,
    # so -63.5752 arrives as -63.5751991 and is stored as -63.575199: compare at 4 decimals (about 10 m).
    assert sql("""SELECT position_ts, ST_AsText(ST_SnapToGrid(position_geom, 0.0001)), bearing_degrees::int,
                         vehicle_stop_status_code, trip_event_id IS NOT NULL, source_id FROM silver.vehicle_position""") == [
        (FETCHED - dt.timedelta(seconds=9), "POINT(-63.5752 44.6488)", 90, "IN_TRANSIT_TO", True, "SRC-001")]
    assert sql("""SELECT a.asset_name, v.vehicle_label, v.vehicle_mode_code FROM silver.vehicle v
                    JOIN silver.asset a USING (asset_id)""") == [("Bus 533", "533", "Bus")]

    # Alert: event + service_alert, open-ended, with the route and stop it affects.
    assert sql("""SELECT e.event_status_code, e.event_end_ts, s.alert_cause_code, s.alert_effect_code, s.alert_header_text
                    FROM silver.service_alert s JOIN silver.event e USING (event_id)""") == [
        ("Active", None, "CONSTRUCTION", "DETOUR", "Stop closure at 1001")]
    assert sql("SELECT involvement_role_code FROM silver.event_asset_involvement ORDER BY 1") == [
        ("Affected route",), ("Affected stop",)]

    # Bronze: one fetch row per feed, the fetch id is the batch id, raw files kept with forward-slash paths.
    fetches = sql("SELECT fetch_id, source_id, http_status, entity_count, file_path, feed_header_ts "
                  "FROM bronze.feed_fetch WHERE source_id <> 'SRC-004' ORDER BY source_id")
    assert [(r[1], r[2], r[3]) for r in fetches] == [("SRC-001", 200, 1), ("SRC-002", 200, 1), ("SRC-003", 200, 1)]
    for _, source, _, _, path, header in fetches:
        assert path.startswith(f"bronze/{source}/2026-11-20/") and path.endswith(".pb.gz") and "\\" not in path
        assert (tmp_path / "data" / path).exists() and header == FETCHED
    batch = {r[1]: r[0] for r in fetches}
    assert sql("SELECT DISTINCT dw_batch_id FROM silver.trip") == [(batch["SRC-002"],)]


def test_repeated_identical_feed_adds_nothing_new(schedule, sql):
    c = make(FakeFetch())
    try:
        c.cycle()
        second = c.cycle()
    finally:
        c.close()
    assert second.startswith("1 buses (0 new positions)")
    assert sql("SELECT count(*) FROM silver.vehicle_position") == [(1,)]
    assert sql("SELECT count(*) FROM silver.event") == [(3,)]
    assert sql("SELECT count(*) FROM silver.vehicle_hist") == [(0,)]
    assert sql("SELECT count(*) FROM silver.asset_hist") == [(0,)]
    # Six fetch rows but three raw files: an identical download points at the file already kept.
    assert sql("SELECT count(*), count(DISTINCT file_path) FROM bronze.feed_fetch WHERE source_id <> 'SRC-004'") == [(6, 3)]


def test_raw_file_deleted_by_retention_is_saved_again(schedule, sql, tmp_path):
    c = make(FakeFetch())
    try:
        c.cycle()
        kept = c.last_path["SRC-001"]
        kept.unlink()
        c.cycle()
    finally:
        c.close()
    assert kept.exists()
    assert sql("SELECT count(DISTINCT file_path) FROM bronze.feed_fetch WHERE source_id = 'SRC-001'") == [(1,)]


def test_alert_that_leaves_the_feed_is_ended(schedule, sql):
    fetch = FakeFetch()
    c = make(fetch)
    try:
        c.cycle()
        fetch.content["SRC-003"] = alerts(with_alert=False)
        fetch.fetched = FETCHED + dt.timedelta(seconds=30)
        fetch.content["SRC-001"] = vehicle_positions(seconds_ago=0)
        assert c.cycle().endswith("0 alerts, 1 ended")
    finally:
        c.close()
    assert sql("""SELECT event_status_code, event_end_ts FROM silver.event
                   WHERE event_type_code = 'Service Alert'""") == [("Ended", FETCHED + dt.timedelta(seconds=30))]
    assert sql("SELECT count(*) FROM silver.vehicle_position") == [(2,)]


def test_unknown_route_is_counted_not_invented(schedule, sql):
    c = make(FakeFetch(content={"SRC-002": trip_updates(route_id="999")}))
    try:
        summary = c.cycle()
    finally:
        c.close()
    assert "0 trips, 0 arrivals (1 waiting for routes from the schedule)" in summary
    assert sql("SELECT count(*) FROM silver.asset WHERE asset_type_code = 'Route'") == [(2,)]
    assert sql("SELECT count(*) FROM silver.trip") == [(0,)]


def test_failed_download_is_logged_and_other_feeds_still_load(schedule, sql):
    c = make(FakeFetch(content={"SRC-003": None}))
    try:
        summary = c.cycle()
    finally:
        c.close()
    assert summary.endswith("alerts failed: HTTP 503")
    assert sql("SELECT http_status, file_path, error_text FROM bronze.feed_fetch WHERE source_id = 'SRC-003'") == [
        (503, None, "HTTP 503")]
    assert sql("SELECT count(*) FROM silver.vehicle_position") == [(1,)]
    # bronze.feed_gap reads successful fetches only.
    assert sql("SELECT count(*) FROM bronze.feed_gap WHERE source_id = 'SRC-003'") == [(0,)]


def test_only_one_collector_per_database(schedule):
    first, second = make(FakeFetch()), make(FakeFetch())
    try:
        first.cycle()
        with pytest.raises(AlreadyRunning):
            second.cycle()
    finally:
        first.close()
        second.close()
    third = make(FakeFetch())      # the lock is released when the first one stops
    try:
        third.cycle()
    finally:
        third.close()


def test_retention_runs_once_a_day(db, tmp_path):
    c = make(FakeFetch())
    assert c.purge_if_due(now=1_000_000.0) is not None
    assert c.purge_if_due(now=1_000_000.0 + 3600) is None
    assert c.purge_if_due(now=1_000_000.0 + rt_collector.RETENTION_EVERY_SECONDS) is not None
