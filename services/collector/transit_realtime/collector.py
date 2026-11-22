"""The realtime collector loop: every interval, fetch the three feeds, keep the raw files, log each fetch,
then write positions, trips, arrivals and alerts into silver in one transaction.

Run from the services folder:

    python -m collector.transit_realtime            runs until stopped
    python -m collector.transit_realtime --once     one cycle, for testing

Only one collector may write to a database at a time: it holds a PostgreSQL advisory lock for as long as it
runs, and a second copy exits at once. Once a day it deletes raw files older than raw_retention_days.
"""
from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

from ..common import Log, connect, download, log_fetch, save_raw, settings
from ..retention import purge_raw
from ..settings import describe_database
from . import parse, store

FEEDS = {
    "SRC-001": ("vehicle_positions", "http://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb"),
    "SRC-002": ("trip_updates", "http://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb"),
    "SRC-003": ("alerts", "http://gtfs.halifax.ca/realtime/Alert/Alerts.pb"),
}

# One collector per database. hashtext() gives a stable number for the lock name.
LOCK_SQL = "SELECT pg_try_advisory_lock(hashtext('halifax-twin transit_realtime collector'))"
RETENTION_EVERY_SECONDS = 24 * 3600
PID_FILE_NAME = "transit_realtime.pid"


class AlreadyRunning(SystemExit):
    pass


def confirm_trip_updates_source(conn):
    """SRC-002's endpoint was 'not checked' in Source Inventory V1. It was confirmed on 20 Nov 2026 and again
    on 21 Nov 2026, so record the real URL. silver.source keeps history (SCD2), so the old value is not lost."""
    conn.execute(
        """UPDATE silver.source
              SET source_url = %s, source_status_code = 'Verified', last_checked_date = CURRENT_DATE, dw_loaded_ts = now()
            WHERE source_id = 'SRC-002' AND source_url <> %s""",
        (FEEDS["SRC-002"][1], FEEDS["SRC-002"][1]))


class Collector:
    def __init__(self, log: Log | None = None, fetch=download):
        self.conn = None
        self.lookups = store.Lookups()
        self.last_sha: dict[str, str] = {}
        self.last_path: dict[str, Path | None] = {}
        self.log = log or Log("transit_realtime")
        self.fetch = fetch                      # replaced in tests with recorded feeds
        self.last_purge: float | None = None
        self.on_locked = None                   # called once the lock is held (main writes the pid file then)

    def _connection(self):
        if self.conn is None or self.conn.closed:
            conn = connect(autocommit=True, application_name="halifax-twin-transit-realtime")
            if not conn.execute(LOCK_SQL).fetchone()[0]:
                conn.close()
                raise AlreadyRunning("Another transit realtime collector is already writing to this database. Stopping.")
            confirm_trip_updates_source(conn)
            self.conn = conn
            if self.on_locked is not None:
                self.on_locked()
                self.on_locked = None
            self.lookups.loaded_at = None
        return self.conn

    def close(self):
        if self.conn is not None and not self.conn.closed:
            self.conn.close()          # also releases the advisory lock
        self.conn = None

    def _fetch(self, conn, source_id):
        """Download, keep the raw file (only when it changed), parse, and log the fetch."""
        name, url = FEEDS[source_id]
        d = self.fetch(source_id, url)
        msg = None
        if d.ok:
            try:
                msg = parse.parse_feed(d.content)
            except Exception as e:
                d.error = f"Could not parse GTFS-RT: {e}"[:1000]
        path = None
        if d.content:
            kept = self.last_path.get(source_id)
            if d.sha256 != self.last_sha.get(source_id) or kept is None or not kept.exists():
                path = save_raw(d, name, "pb")
                self.last_sha[source_id], self.last_path[source_id] = d.sha256, path
            else:
                path = kept            # identical download: point at the file already kept
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
                note = f" ({no_route} waiting for routes from the schedule)" if no_route else ""
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

    def purge_if_due(self, now: float | None = None):
        """Delete old raw files at start-up and then once a day. Never touches bronze.feed_fetch."""
        now = now if now is not None else time.time()
        if self.last_purge is not None and now - self.last_purge < RETENTION_EVERY_SECONDS:
            return None
        self.last_purge = now
        s = settings()
        try:
            result = purge_raw(s.bronze_dir, s.raw_retention_days, now=now)
            self.log(f"retention ({s.raw_retention_days} days): {result}")
            return result
        except Exception as e:
            self.log(f"retention failed: {type(e).__name__}: {e}")
            return None

    def run(self, interval: int, once: bool):
        s = settings()
        self.log(f"Transit realtime collector: every {interval} s into {describe_database(s.database_url)}, "
                 f"raw files in {s.bronze_dir}, process {os.getpid()}.")
        try:
            while True:
                started = time.monotonic()
                if not once:
                    self.purge_if_due()
                try:
                    self.log(self.cycle())
                except AlreadyRunning:
                    raise
                except Exception as e:
                    self.log(f"cycle failed: {type(e).__name__}: {e}")
                    if self.conn is not None and (self.conn.closed or self.conn.broken):
                        self.conn = None
                    if once:
                        raise
                if once:
                    return
                time.sleep(max(1.0, interval - (time.monotonic() - started)))
        finally:
            self.close()


def write_pid_file() -> Path:
    folder = settings().logs_dir
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / PID_FILE_NAME
    path.write_text(str(os.getpid()), encoding="ascii")
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description="Halifax Transit realtime collector (SRC-001 to SRC-003)")
    ap.add_argument("--interval", type=int, default=30, help="seconds between cycles (default 30)")
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    ap.add_argument("--no-log-file", action="store_true", help="print only; do not append to the daily log file")
    args = ap.parse_args(argv)
    log = Log("transit_realtime", to_file=not args.no_log_file)
    collector = Collector(log)
    if not args.once:
        collector.on_locked = write_pid_file       # only the copy holding the lock owns the pid file
    try:
        collector.run(args.interval, args.once)
    except KeyboardInterrupt:
        log("Stopped.")
    except AlreadyRunning as e:
        log(str(e))
        raise SystemExit(3)
    finally:
        pid_file = settings().logs_dir / PID_FILE_NAME
        try:
            if pid_file.exists() and pid_file.read_text(encoding="ascii").strip() == str(os.getpid()):
                pid_file.unlink()
        except OSError:
            pass
