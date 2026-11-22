"""Database access: one small connection pool, read-only sessions, short timeouts."""
from __future__ import annotations

import logging
import time

import psycopg
from psycopg.rows import tuple_row
from psycopg_pool import ConnectionPool, PoolTimeout

log = logging.getLogger("halifax_api.db")

# Every session is read-only and gives up on slow statements, so one bad query cannot hold the pool.
SESSION_OPTIONS = "-c default_transaction_read_only=on -c statement_timeout=10000 -c TimeZone=UTC"


class SourceUnavailable(Exception):
    """The database (or one source behind it) cannot be read right now."""


class Database:
    # After the server cannot be reached, answer "unavailable" at once for this many seconds instead of
    # making every request wait for the pool timeout.
    BACKOFF_SECONDS = 10

    def __init__(self, url: str, max_size: int = 8):
        self.url = url
        self._down_until = 0.0
        self.pool = ConnectionPool(
            url, min_size=0, max_size=max_size, open=False, timeout=4,
            kwargs={"connect_timeout": 3, "options": SESSION_OPTIONS, "autocommit": True, "row_factory": tuple_row},
            name="halifax_api")

    def open(self) -> None:
        self.pool.open(wait=False)

    def close(self) -> None:
        self.pool.close()

    def _run(self, fn):
        if time.monotonic() < self._down_until:
            raise SourceUnavailable()
        try:
            with self.pool.connection() as conn:
                return fn(conn)
        except (psycopg.OperationalError, PoolTimeout, OSError) as e:
            # Cannot reach the server: back off. Log the class only, as messages can carry connection details.
            self._down_until = time.monotonic() + self.BACKOFF_SECONDS
            log.warning("database unreachable: %s", type(e).__name__)
            raise SourceUnavailable() from e
        except psycopg.Error as e:
            # One query failed (for example a missing table): only this answer is affected.
            log.warning("database read failed: %s", type(e).__name__)
            raise SourceUnavailable() from e

    def fetch(self, sql, params=None) -> list[tuple]:
        return self._run(lambda conn: conn.execute(sql, params).fetchall())

    def fetch_one(self, sql, params=None) -> tuple | None:
        rows = self.fetch(sql, params)
        return rows[0] if rows else None

    def columns(self, sql, params=None) -> tuple[list[str], list[tuple]]:
        """Rows plus column names, for SELECT * on subtype tables."""
        def run(conn):
            cur = conn.execute(sql, params)
            return [d.name for d in cur.description or []], cur.fetchall()
        return self._run(run)
