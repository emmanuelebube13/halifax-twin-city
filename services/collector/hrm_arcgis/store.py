"""Write transformed rows into silver: location, event and one subtype, in one transaction.

The rows are copied into a temporary staging table, then three set-based statements write
silver.location, silver.event and the subtype table, each idempotent on its alternate key (AK1:
source_id + source key). An update fires only when a value really changed, so re-running the same
download changes nothing (no new SCD2 versions in location_hist, no new dw_loaded_ts).
Rows no longer in the source are kept: events are facts that happened.
"""
from __future__ import annotations

from dataclasses import dataclass

from psycopg import sql

from .transform import Row

STAGE_COLUMNS = [
    ("k", "text"), ("event_type_code", "text"), ("start_ts", "timestamptz"), ("end_ts", "timestamptz"),
    ("event_date", "date"), ("subsector_id", "text"), ("status_code", "text"),
    ("location_type_code", "text"), ("location_name", "text"), ("geometry_type_code", "text"),
    ("geometry", "text"),
]

# Subtype tables this package writes, with the stage type of each column it fills.
SUBTYPES = {
    "road_closure": [("closure_type_code", "text"), ("closure_reason_code", "text"),
                     ("detour_description", "text")],
    "building_permit": [("permit_type_code", "text"), ("work_description", "text"),
                        ("construction_value_amount", "numeric"), ("units_created_count", "integer"),
                        ("units_removed_count", "integer")],
}


@dataclass
class Result:
    rows_in: int = 0
    out_of_calendar: int = 0
    locations_inserted: int = 0
    locations_updated: int = 0
    events_inserted: int = 0
    events_updated: int = 0
    subtypes_inserted: int = 0
    subtypes_updated: int = 0

    def changed(self) -> int:
        return (self.locations_inserted + self.locations_updated + self.events_inserted + self.events_updated
                + self.subtypes_inserted + self.subtypes_updated)


def _split(cur_rows) -> tuple[int, int]:
    ins = sum(1 for (inserted,) in cur_rows if inserted)
    return ins, len(cur_rows) - ins


def store(conn, source_id: str, subtype_table: str, rows: list[Row], batch_id: int) -> Result:
    """Write rows for one source. The caller commits (or rolls back) the transaction."""
    res = Result(rows_in=len(rows))
    sub_cols = SUBTYPES[subtype_table]
    # One row per key: the last one wins if a source ever repeats a key in one download.
    rows = list({r.key: r for r in rows}.values())

    lo, hi = conn.execute("SELECT min(calendar_date), max(calendar_date) FROM silver.calendar_date").fetchone()
    kept = [r for r in rows if lo <= r.event_date <= hi]
    res.out_of_calendar = len(rows) - len(kept)

    cols = STAGE_COLUMNS + sub_cols
    conn.execute("DROP TABLE IF EXISTS pg_temp.hrm_stage")
    conn.execute(sql.SQL("CREATE TEMP TABLE hrm_stage ({}) ON COMMIT DROP").format(
        sql.SQL(", ").join(sql.SQL("{} {}").format(sql.Identifier(n), sql.SQL(t)) for n, t in cols)))
    with conn.cursor().copy(sql.SQL("COPY hrm_stage ({}) FROM STDIN").format(
            sql.SQL(", ").join(sql.Identifier(n) for n, _ in cols))) as cp:
        for r in kept:
            cp.write_row([r.key, r.event_type_code, r.start_ts, r.end_ts, r.event_date, r.subsector_id,
                          r.status_code, r.location_type_code, r.location_name, r.geometry_type_code,
                          r.geometry] + [r.subtype.get(n) for n, _ in sub_cols])

    # 1. Locations.
    cur = conn.execute(
        """WITH s AS (
               SELECT k, location_type_code, location_name, geometry_type_code,
                      ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326) AS g FROM hrm_stage)
           INSERT INTO silver.location (location_type_code, location_name, geometry_type_code, location_geometry,
                                        centroid_latitude, centroid_longitude, source_id, source_location_key,
                                        dw_batch_id)
           SELECT location_type_code, location_name, geometry_type_code, g,
                  round(ST_Y(ST_PointOnSurface(g))::numeric, 6), round(ST_X(ST_PointOnSurface(g))::numeric, 6),
                  %(src)s, k, %(batch)s
             FROM s
           ON CONFLICT ON CONSTRAINT ak1_location DO UPDATE
              SET location_type_code = EXCLUDED.location_type_code,
                  location_name = EXCLUDED.location_name,
                  geometry_type_code = EXCLUDED.geometry_type_code,
                  location_geometry = EXCLUDED.location_geometry,
                  centroid_latitude = EXCLUDED.centroid_latitude,
                  centroid_longitude = EXCLUDED.centroid_longitude,
                  dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id
            WHERE (silver.location.location_type_code, silver.location.location_name,
                   silver.location.geometry_type_code, ST_AsEWKB(silver.location.location_geometry),
                   silver.location.centroid_latitude, silver.location.centroid_longitude)
                  IS DISTINCT FROM
                  (EXCLUDED.location_type_code, EXCLUDED.location_name, EXCLUDED.geometry_type_code,
                   ST_AsEWKB(EXCLUDED.location_geometry), EXCLUDED.centroid_latitude, EXCLUDED.centroid_longitude)
           RETURNING (xmax = 0)""", {"src": source_id, "batch": batch_id})
    res.locations_inserted, res.locations_updated = _split(cur.fetchall())

    # 2. Events, linked to their location.
    cur = conn.execute(
        """INSERT INTO silver.event (event_type_code, event_start_ts, event_end_ts, event_date, location_id,
                                     subsector_id, source_id, source_event_key, event_status_code, dw_batch_id)
           SELECT s.event_type_code, s.start_ts, s.end_ts, s.event_date, l.location_id, s.subsector_id,
                  %(src)s, s.k, s.status_code, %(batch)s
             FROM hrm_stage s
             LEFT JOIN silver.location l ON l.source_id = %(src)s AND l.source_location_key = s.k
           ON CONFLICT ON CONSTRAINT ak1_event DO UPDATE
              SET event_type_code = EXCLUDED.event_type_code,
                  event_start_ts = EXCLUDED.event_start_ts,
                  event_end_ts = EXCLUDED.event_end_ts,
                  event_date = EXCLUDED.event_date,
                  location_id = EXCLUDED.location_id,
                  subsector_id = EXCLUDED.subsector_id,
                  event_status_code = EXCLUDED.event_status_code,
                  dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id
            WHERE (silver.event.event_type_code, silver.event.event_start_ts, silver.event.event_end_ts,
                   silver.event.event_date, silver.event.location_id, silver.event.subsector_id,
                   silver.event.event_status_code)
                  IS DISTINCT FROM
                  (EXCLUDED.event_type_code, EXCLUDED.event_start_ts, EXCLUDED.event_end_ts, EXCLUDED.event_date,
                   EXCLUDED.location_id, EXCLUDED.subsector_id, EXCLUDED.event_status_code)
           RETURNING (xmax = 0)""", {"src": source_id, "batch": batch_id})
    res.events_inserted, res.events_updated = _split(cur.fetchall())

    # 3. Subtype rows, sharing the event's key.
    names = [n for n, _ in sub_cols]
    tbl = sql.Identifier("silver", subtype_table)
    q = sql.SQL(
        """INSERT INTO {tbl} (event_id, {cols}, dw_batch_id)
           SELECT e.event_id, {scols}, %(batch)s
             FROM hrm_stage s
             JOIN silver.event e ON e.source_id = %(src)s AND e.source_event_key = s.k
           ON CONFLICT (event_id) DO UPDATE
              SET {sets}, dw_loaded_ts = now(), dw_batch_id = EXCLUDED.dw_batch_id
            WHERE ({old}) IS DISTINCT FROM ({new})
           RETURNING (xmax = 0)""").format(
        tbl=tbl,
        cols=sql.SQL(", ").join(map(sql.Identifier, names)),
        scols=sql.SQL(", ").join(sql.SQL("s.{}").format(sql.Identifier(n)) for n in names),
        sets=sql.SQL(", ").join(sql.SQL("{0} = EXCLUDED.{0}").format(sql.Identifier(n)) for n in names),
        old=sql.SQL(", ").join(sql.SQL("{}.{}").format(tbl, sql.Identifier(n)) for n in names),
        new=sql.SQL(", ").join(sql.SQL("EXCLUDED.{}").format(sql.Identifier(n)) for n in names))
    cur = conn.execute(q, {"src": source_id, "batch": batch_id})
    res.subtypes_inserted, res.subtypes_updated = _split(cur.fetchall())
    return res
