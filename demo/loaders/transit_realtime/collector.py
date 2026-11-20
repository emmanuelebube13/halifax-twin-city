"""The realtime collector loop: every interval, fetch the three feeds, keep the raw files, log each fetch,
then write positions, trips, arrivals and alerts into silver in one transaction.

    python -m loaders.transit_realtime            (from the demo folder; runs until Ctrl+C)
    python -m loaders.transit_realtime --once     (one cycle, for testing)
"""
from __future__ import annotations

import argparse
import datetime as dt
import time

from ..common import connect, download, halifax_time, log_fetch, save_raw
from . import parse, store

FEEDS = {
    "SRC-001": ("vehicle_positions", "http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb"),
    "SRC-002": ("trip_updates", "http://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb"),
    "SRC-003": ("alerts", "http://gtfs.halifax.ca/realtime/Alert/Alerts.pb"),
}


def confirm_trip_updates_source(conn):
    """SRC-002's endpoint was 'not checked' in Source Inventory V1. It was confirmed on 20 Nov 2026,
    so record the real URL. silver.source keeps history (SCD2), so the old value is not lost."""
    conn.execute(
        """UPDATE silver.source
              SET source_url = %s, source_status_code = 'Verified', last_checked_date = CURRENT_DATE, dw_loaded_ts = now()
            WHERE source_id = 'SRC-002' AND source_url <> %s""",
        (FEEDS["SRC-002"][1], FEEDS["SRC-002"][1]))


class Collector:
    def __init__(self):
        self.conn = None
        self.lookups = store.Lookups()
        self.last_sha: dict[str, str] = {}
        self.last_path: dict[str, object] = {}

    def _connection(self):
        if self.conn is None or self.conn.closed:
            self.conn = connect(autocommit=True)
            confirm_trip_updates_source(self.conn)
            self.lookups.loaded_at = None
        return self.conn

    def _fetch(self, conn, source_id):
        """Download, keep the raw file (only when it changed), parse, and log the fetch."""
        name, url = FEEDS[source_id]
        d = download(source_id, url)
        msg = None
        if d.ok:
            try:
                msg = parse.parse_feed(d.content)
            except Exception as e:
                d.error = f"Could not parse GTFS-RT: {e}"[:1000]
        path = None
        if d.content:
            if d.sha256 != self.last_sha.get(source_id):
                path = save_raw(d, name, "pb")
                self.last_sha[source_id], self.last_path[source_id] = d.sha256, path
            else:
                path = self.last_path.get(source_id)   # identical download: point at the file already kept
        fetch_id = log_fetch(conn, d, path, parse.header_ts(msg) if msg else None,
                             len(msg.entity) if msg is not None else None)
        return d, (msg if d.error is None else None), fetch_id

    def cycle(self) -> str:
        conn = self._connection()
        results = {s: self._fetch(conn, s) for s in FEEDS}
        if self.lookups.stale():
            self.lookups.refresh(conn)

        parts = []
        with conn.transaction():
            trip_ids = {}
            d, msg, batch = results["SRC-002"]
            if msg is not None:
                trips, arrivals = parse.parse_trip_updates(msg, d.fetched_ts)
                trip_ids, no_route = store.store_trips(conn, self.lookups, trips, batch)
                stored, no_stop = store.store_arrivals(conn, self.lookups, arrivals, trip_ids, batch)
                note = f" ({no_route} waiting for routes from D03)" if no_route else ""
                note += f" ({no_stop} arrivals waiting for stops)" if no_stop else ""
                parts.append(f"{len(trip_ids)} trips, {stored} arrivals{note}")
            else:
                parts.append(f"trip updates failed: {d.error}")

            d, msg, batch = results["SRC-001"]
            if msg is not None:
                positions = parse.parse_vehicle_positions(msg, d.fetched_ts)
                new = store.store_positions(conn, self.lookups, positions, trip_ids, batch)
                parts.insert(0, f"{len(positions)} buses ({new} new positions)")
            else:
                parts.insert(0, f"positions failed: {d.error}")

            d, msg, batch = results["SRC-003"]
            if msg is not None:
                active, closed = store.store_alerts(conn, self.lookups, parse.parse_alerts(msg, d.fetched_ts),
                                                    d.fetched_ts, batch)
                parts.append(f"{active} alerts" + (f", {closed} ended" if closed else ""))
            else:
                parts.append(f"alerts failed: {d.error}")
        return " | ".join(parts)

    def run(self, interval: int, once: bool):
        print(f"Transit realtime collector: every {interval} s. Stop with Ctrl+C.", flush=True)
        while True:
            started = time.monotonic()
            try:
                print(f"{halifax_time()}  {self.cycle()}", flush=True)
            except Exception as e:
                print(f"{halifax_time()}  cycle failed: {type(e).__name__}: {e}", flush=True)
                if self.conn is not None and not self.conn.closed and self.conn.broken:
                    self.conn = None
                if once:
                    raise
            if once:
                return
            time.sleep(max(1.0, interval - (time.monotonic() - started)))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Halifax Transit realtime collector (D02)")
    ap.add_argument("--interval", type=int, default=30, help="seconds between cycles (default 30)")
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    args = ap.parse_args(argv)
    try:
        Collector().run(args.interval, args.once)
    except KeyboardInterrupt:
        print("Stopped.")
