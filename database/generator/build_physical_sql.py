"""Generate the Halifax Digital Twin PostgreSQL physical model (step 9) from spec.py.
Writes database/sql/01-07 from logical_model_spec.py.
"""
import hashlib, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'logical_model_spec.py'), encoding='utf-8').read())

OUT = os.path.dirname(HERE)
os.makedirs(f'{OUT}/sql', exist_ok=True)

# ---------- naming ----------
def pname(s):
    s = s.replace("'", "")
    s = re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_').lower()
    s = re.sub(r'(^|_)timestamp($|_)', r'\1ts\2', s)
    return s

def cname(prefix, table, cols, n=None):
    base = f"{prefix}_{table}_{'_'.join(cols)}" if cols else f"{prefix}_{table}"
    if n: base += f"_{n}"
    if len(base) <= 63:
        return base
    h = hashlib.md5(base.encode()).hexdigest()[:6]
    return base[:56] + '_' + h

# ---------- types ----------
TYPE = {
    "Identifier": "bigint", "Reference Code": "varchar(30)", "Source Key": "varchar(100)",
    "Code": "varchar(30)", "Name": "varchar(200)", "Description": "varchar(2000)",
    "Text": "varchar(500)", "Long Text": "text", "URL": "varchar(500)", "Flag": "boolean",
    "Date": "date", "Timestamp": "timestamptz", "Service Day Time": "interval", "Year": "smallint",
    "Count": "integer", "Amount": "numeric(15,2)", "Percent": "numeric(5,2)",
    "Measure Value": "numeric(18,6)", "Latitude": "numeric(9,6)", "Longitude": "numeric(9,6)",
    "Length Metres": "numeric(12,2)", "Area Square Metres": "numeric(12,2)",
    "Area Square Km": "numeric(12,2)", "Geometry": "geometry(Geometry, 4326)",
}
CHECK = {
    "Percent": "{c} BETWEEN 0 AND 100",
    "Latitude": "{c} BETWEEN -90 AND 90",
    "Longitude": "{c} BETWEEN -180 AND 180",
    "Count": "{c} >= 0",
    "Year": "{c} BETWEEN 1700 AND 2100",
    "Length Metres": "{c} >= 0", "Area Square Metres": "{c} >= 0", "Area Square Km": "{c} >= 0",
    "URL": "{c} ~ '^https?://'",
}
SIGNED_COUNTS = {"Reported Delay Seconds"}

IDENTITY = {"Location", "Party", "Asset", "Event", "Schedule Version", "Scheduled Trip"}
SCD2 = ["Sector", "Subsector", "Source", "Measure",
        "Location", "Street", "Street Segment", "Intersection", "Area", "Civic Address", "Parcel",
        "Party", "Organization",
        "Asset", "Route", "Stop", "Vehicle", "Route Segment", "Infrastructure Asset", "Facility",
        "Building", "Dwelling Unit"]
ROLLED_DOWN = "Vehicle Position"
AREA_ORDER = ["Core", "Transportation", "Public Works", "Housing & Real Estate"]

def attrs(n):
    out = []
    for a in E[n]["attrs"]:
        if a[0] in ("Monday Flag to Sunday Flag", "Monday Flag"):
            for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
                out.append((f"{d} Flag", "", "Flag", "No", ""))
        else:
            out.append(a)
    return out

def pk(n):
    return [a[0] for a in attrs(n) if a[1].startswith("PK")]

# ---------- physical column lists ----------
TABLES = {}   # table -> dict(cols=[(col, type, notnull, comment, domain, logical)], pk=[...], aks=[...], ...)

for n, v in E.items():
    t = pname(n)
    cols = []
    if n == ROLLED_DOWN:
        # Physical roll-down: Vehicle Position does not create Event rows.
        cols = [
            ("vehicle_asset_id", "bigint", True, "Vehicle that reported the position (logical: Vehicle Asset ID).", "Identifier", "Vehicle Asset ID"),
            ("position_ts", "timestamptz", True, "When the position was recorded, UTC (logical: Event Start Timestamp).", "Timestamp", "Event Start Timestamp"),
            ("trip_event_id", "bigint", False, "Trip being run, empty when not in service (logical: Trip Event ID).", "Identifier", "Trip Event ID"),
            ("source_id", "varchar(30)", True, "Feed the position came from (logical: Event.Source ID).", "Reference Code", "Source ID"),
        ]
        for a in attrs(n):
            if a[0] in ("Event ID", "Vehicle Asset ID", "Trip Event ID"):
                continue
            cols.append((pname(a[0]), TYPE[a[2]], a[3] == "No", f"{a[0]}. Domain: {a[2]}. {a[4]}".strip(), a[2], a[0]))
        TABLES[t] = dict(logical=n, cols=cols, pk=["vehicle_asset_id", "position_ts"], aks=[], area=v["area"], kind="Rolled-down event")
        continue
    for a in attrs(n):
        c = pname(a[0])
        typ = TYPE[a[2]]
        cols.append((c, typ, a[3] == "No", f"{a[0]}. Domain: {a[2]}." + (f" {a[4]}" if a[4] else ""), a[2], a[0]))
    if n in SCD2:
        cols.append(("valid_from_ts", "timestamptz", True, "SCD2: when this version of the row became current.", "Timestamp", None))
    cols.append(("dw_loaded_ts", "timestamptz", True, "Audit: when the row was last loaded or changed.", "Timestamp", None))
    cols.append(("dw_batch_id", "bigint", False, "Audit: load batch that wrote the row.", "Identifier", None))
    aks = []
    for ak in ["AK1", "AK2"]:
        ac = [pname(a[0]) for a in attrs(n) if ak in a[1]]
        if ac:
            aks.append(ac)
    TABLES[t] = dict(logical=n, cols=cols, pk=[pname(x) for x in pk(n)], aks=aks, area=v["area"], kind=v["kind"])

# ---------- foreign keys ----------
FKS = []  # (child_table, child_cols, parent_table, parent_cols, label)
for n, v in E.items():
    if v["kind"] == "Subtype" and n != ROLLED_DOWN:
        FKS.append((pname(n), [pname(x) for x in pk(n)], pname(v["sup"]), [pname(x) for x in pk(v["sup"])], f"{n} is a {v['sup']}"))
for p, verb, c, t_, card, fk, note in R:
    if t_ == "Subtype":
        continue
    cc = [pname(x.strip()) for x in fk.split(",")]
    FKS.append((pname(c), cc, pname(p), [pname(x) for x in pk(p)], f"{p} {verb} {c}"))
# extra FK for the rolled-down table (it no longer inherits Source via Event)
FKS.append(("vehicle_position", ["source_id"], "source", ["source_id"], "Source reports Vehicle Position (rolled down from Event)"))

# ---------- write helpers ----------
def header(title, purpose):
    return (f"-- =====================================================================\n"
            f"-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)\n"
            f"-- {title}\n"
            f"-- {purpose}\n"
            f"-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.\n"
            f"-- =====================================================================\n\n")

def table_sql(t, info):
    lines = []
    for (c, typ, nn, com, dom, lg) in info["cols"]:
        extra = ""
        if c == info["pk"][0] and len(info["pk"]) == 1 and info["logical"] in IDENTITY:
            extra = " GENERATED BY DEFAULT AS IDENTITY"
        default = ""
        if c in ("valid_from_ts", "dw_loaded_ts"):
            default = " DEFAULT now()"
        lines.append(f"    {c} {typ}{extra}{' NOT NULL' if nn else ''}{default}")
    if t == "vehicle_position":
        lines.append("    position_geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(position_longitude::float8, position_latitude::float8), 4326)) STORED")
        lines.append("    dw_loaded_ts timestamptz NOT NULL DEFAULT now()")
    lines.append(f"    CONSTRAINT {cname('pk', t, [])} PRIMARY KEY ({', '.join(info['pk'])})")
    for i, ak in enumerate(info["aks"], 1):
        lines.append(f"    CONSTRAINT {cname('ak' + str(i), t, [])} UNIQUE ({', '.join(ak)})")
    for (c, typ, nn, com, dom, lg) in info["cols"]:
        if dom in CHECK and lg not in SIGNED_COUNTS and lg is not None:
            lines.append(f"    CONSTRAINT {cname('ck', t, [c])} CHECK ({CHECK[dom].format(c=c)})")
    body = ",\n".join(lines)
    part = " PARTITION BY RANGE (position_ts)" if t == "vehicle_position" else ""
    return f"CREATE TABLE silver.{t} (\n{body}\n){part};\n"

# ---------- 01 schemas ----------
s01 = header("01  Extensions and schemas", "Run once, connected to the halifax_twin database.")
s01 += """-- PostGIS adds the geometry type and spatial functions (ST_Distance, ST_Within ...).
CREATE EXTENSION IF NOT EXISTS postgis;

-- One schema per layer of the medallion architecture.
CREATE SCHEMA IF NOT EXISTS bronze;  -- raw data exactly as received (files + a register of every fetch)
CREATE SCHEMA IF NOT EXISTS silver;  -- the 3NF model from erwin: cleaned, conformed, with history
CREATE SCHEMA IF NOT EXISTS gold;    -- star schemas and serving tables, one per group of business questions (later)

COMMENT ON SCHEMA bronze IS 'Raw landing: data as received from each source, never edited.';
COMMENT ON SCHEMA silver IS 'Conformed 3NF model (Logical Model V1) with SCD Type 2 history.';
COMMENT ON SCHEMA gold   IS 'Analytics and serving: Kimball star schemas per question group (not built yet).';
"""

# ---------- 02 tables ----------
s02 = header("02  Silver tables", "63 tables in the silver schema, one per logical entity. Keys, alternate keys and domain checks are inline; foreign keys come in script 03.")
s02 += "SET search_path = silver, public;\n\n"
for area in AREA_ORDER:
    s02 += f"-- ---------------------------------------------------------------------\n-- {area.upper()}\n-- ---------------------------------------------------------------------\n\n"
    for t, info in TABLES.items():
        if info["area"] != area:
            continue
        d = E[info["logical"]]
        note = ""
        if info["logical"] in SCD2:
            note = "  History: SCD Type 2 (see script 04)."
        if t == "vehicle_position":
            note = "  Physical roll-down: no Event row per GPS ping; partitioned by month (see script 05)."
        s02 += f"-- {info['logical']} ({d['kind']}{' of ' + d['sup'] if d['sup'] else ''}).{note}\n"
        s02 += table_sql(t, info) + "\n"

# ---------- 03 keys and indexes ----------
s03 = header("03  Foreign keys and indexes", "Relationships from the logical model become foreign keys. PostgreSQL does not index foreign keys automatically, so each gets an index.")
s03 += "SET search_path = silver, public;\n\n-- Foreign keys -----------------------------------------------------------\n\n"
seen = {}
for c, cc, p, pc, label in FKS:
    base = (c, p)
    seen[base] = seen.get(base, 0) + 1
    nm = cname("fk", c, [p], seen[base] if seen[base] > 1 else None)
    s03 += f"-- {label}\nALTER TABLE silver.{c} ADD CONSTRAINT {nm}\n    FOREIGN KEY ({', '.join(cc)}) REFERENCES silver.{p} ({', '.join(pc)});\n"
s03 += "\n-- Indexes on foreign-key columns ----------------------------------------\n-- Skipped where the primary key or an alternate key already starts with the same columns.\n\n"
done = set()
nidx = 0
for c, cc, p, pc, label in FKS:
    tpk = TABLES[c]["pk"]
    if tpk[:len(cc)] == cc or any(ak[:len(cc)] == cc for ak in TABLES[c]["aks"]):
        continue
    key = (c, tuple(cc))
    if key in done:
        continue
    done.add(key)
    nidx += 1
    s03 += f"CREATE INDEX {cname('ix', c, cc)} ON silver.{c} ({', '.join(cc)});\n"
s03 += """
-- Spatial indexes (GiST) make "what is near / inside" queries fast.
CREATE INDEX ix_location_location_geometry_gist ON silver.location USING gist (location_geometry);

-- Time-based lookups on events and incremental watermark queries.
CREATE INDEX ix_event_event_start_ts ON silver.event (event_start_ts);
CREATE INDEX ix_event_event_type_code_event_date ON silver.event (event_type_code, event_date);
CREATE INDEX ix_event_event_type_code_event_start_ts ON silver.event (event_type_code, event_start_ts);
CREATE INDEX ix_event_event_type_code_dw_loaded_ts ON silver.event (event_type_code, dw_loaded_ts DESC);
CREATE INDEX ix_event_source_id_dw_loaded_ts ON silver.event (source_id, dw_loaded_ts DESC);
CREATE INDEX ix_asset_source_id_dw_loaded_ts ON silver.asset (source_id, dw_loaded_ts DESC);
CREATE INDEX ix_location_source_id_dw_loaded_ts ON silver.location (source_id, dw_loaded_ts DESC);
CREATE INDEX ix_scheduled_trip_source_trip_key_route_asset_id ON silver.scheduled_trip (source_trip_key, route_asset_id);
"""

# ---------- 04 history ----------
s04 = header("04  SCD Type 2 history", "Each changing table keeps its current rows; every older version is copied to a matching _hist table by a trigger. The _timeline views show both as classic SCD2 rows.")
s04 += """SET search_path = silver, public;

-- One generic trigger function serves every history table.
-- On UPDATE: the old version is copied to <table>_hist with valid_to_ts = now(),
--            and the new version gets a fresh valid_from_ts.
-- On DELETE: the deleted version is copied to <table>_hist.
-- An UPDATE that changes nothing is ignored, so reloading identical data adds no history.
CREATE OR REPLACE FUNCTION silver.fn_scd2_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (to_jsonb(NEW) - 'dw_loaded_ts' - 'dw_batch_id' - 'valid_from_ts')
           = (to_jsonb(OLD) - 'dw_loaded_ts' - 'dw_batch_id' - 'valid_from_ts') THEN
            RETURN NEW;                       -- nothing real changed: no new version
        END IF;
        EXECUTE format('INSERT INTO %I.%I SELECT ($1).*, now()', TG_TABLE_SCHEMA, TG_TABLE_NAME || '_hist')
            USING OLD;
        NEW.valid_from_ts := now();
        NEW.dw_loaded_ts  := now();
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        EXECUTE format('INSERT INTO %I.%I SELECT ($1).*, now()', TG_TABLE_SCHEMA, TG_TABLE_NAME || '_hist')
            USING OLD;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION silver.fn_scd2_capture() IS
    'SCD Type 2: copies the previous version of a row into <table>_hist on update or delete.';

"""
for n in SCD2:
    t = pname(n)
    info = TABLES[t]
    colnames = [c[0] for c in info["cols"]]
    s04 += f"-- {n} -------------------------------------------------------------\n"
    s04 += f"CREATE TABLE silver.{t}_hist (LIKE silver.{t} INCLUDING DEFAULTS);\n"
    s04 += f"ALTER TABLE silver.{t}_hist\n    ADD COLUMN valid_to_ts timestamptz NOT NULL,\n    ADD COLUMN hist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;\n"
    s04 += f"CREATE INDEX {cname('ix', t + '_hist', info['pk'])} ON silver.{t}_hist ({', '.join(info['pk'])}, valid_from_ts);\n"
    s04 += f"COMMENT ON TABLE silver.{t}_hist IS 'SCD2 history of silver.{t}: one row per replaced or deleted version.';\n"
    s04 += f"CREATE TRIGGER trg_{t}_scd2 BEFORE UPDATE OR DELETE ON silver.{t}\n    FOR EACH ROW EXECUTE FUNCTION silver.fn_scd2_capture();\n"
    cl = ", ".join(colnames)
    s04 += (f"CREATE VIEW silver.{t}_timeline AS\n"
            f"    SELECT {cl},\n           NULL::timestamptz AS valid_to_ts, true AS is_current\n      FROM silver.{t}\n"
            f"    UNION ALL\n"
            f"    SELECT {cl},\n           valid_to_ts, false AS is_current\n      FROM silver.{t}_hist;\n")
    s04 += f"COMMENT ON VIEW silver.{t}_timeline IS 'Every version of {n} with valid_from_ts / valid_to_ts (classic SCD Type 2 shape).';\n\n"

# ---------- 05 partitions ----------
s05 = header("05  Partitions for vehicle positions", "Vehicle positions arrive every few seconds for every bus, so the table is split by month. Old months can be dropped in one statement once they are condensed into stop arrivals.")
s05 += """-- A default partition catches anything outside the monthly ranges.
CREATE TABLE silver.vehicle_position_default PARTITION OF silver.vehicle_position DEFAULT;

-- Monthly partitions from November 2026 to December 2027.
-- To add a month later, copy one line and change the dates.
"""
import datetime
d = datetime.date(2026, 11, 1)
for i in range(14):
    nd = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    s05 += f"CREATE TABLE silver.vehicle_position_{d:%Y_%m} PARTITION OF silver.vehicle_position FOR VALUES FROM ('{d}') TO ('{nd}');\n"
    d = nd
s05 += """
-- Indexes declared on the parent are created on every partition automatically.
-- (The trip_event_id foreign-key index is already made in script 03.)
CREATE INDEX ix_vehicle_position_position_geom_gist ON silver.vehicle_position USING gist (position_geom);
CREATE INDEX ix_vehicle_position_position_ts ON silver.vehicle_position (position_ts DESC);
"""

# ---------- 06 bronze ----------
s06 = header("06  Bronze register", "Raw feed files stay as files on disk. This table records every fetch, which is how Gate 0 (48 hours with no gaps) is checked.")
s06 += """CREATE TABLE bronze.feed_fetch (
    fetch_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id       varchar(30)  NOT NULL REFERENCES silver.source (source_id),
    fetched_ts      timestamptz  NOT NULL,
    http_status     smallint     NOT NULL,
    feed_header_ts  timestamptz,
    entity_count    integer      CHECK (entity_count >= 0),
    file_path       text,
    file_bytes      integer      CHECK (file_bytes >= 0),
    file_sha256     char(64),
    error_text      text,
    dw_loaded_ts    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_feed_fetch_source_id_fetched_ts ON bronze.feed_fetch (source_id, fetched_ts);

COMMENT ON TABLE  bronze.feed_fetch IS 'One row per attempt to download a feed: when, what came back, where the raw file is saved.';
COMMENT ON COLUMN bronze.feed_fetch.feed_header_ts IS 'Timestamp inside the GTFS-RT header; equal values in a row mean the feed did not refresh.';
COMMENT ON COLUMN bronze.feed_fetch.file_sha256 IS 'Fingerprint of the raw file; repeats show identical downloads.';

-- Gate 0 check: gaps longer than 90 seconds between fetches of one source.
CREATE VIEW bronze.feed_gap AS
SELECT source_id,
       fetched_ts,
       fetched_ts - lag(fetched_ts) OVER (PARTITION BY source_id ORDER BY fetched_ts) AS gap
  FROM bronze.feed_fetch
 WHERE http_status = 200;
COMMENT ON VIEW bronze.feed_gap IS 'Time since the previous successful fetch of the same source. Filter gap > interval ''90 seconds'' to find holes.';
"""

# ---------- 07 comments ----------
s07 = header("07  Comments (the data dictionary inside the database)", "Every table and column gets a description, so tools like pgAdmin and DBeaver show the dictionary next to the data.")
for t, info in TABLES.items():
    n = info["logical"]
    defn = E[n]["defn"].replace("'", "''")
    s07 += f"COMMENT ON TABLE silver.{t} IS '{n}: {defn}';\n"
    for (c, typ, nn, com, dom, lg) in info["cols"]:
        s07 += f"COMMENT ON COLUMN silver.{t}.{c} IS '{com.replace(chr(39), chr(39)*2)}';\n"
    s07 += "\n"

# ---------- write ----------
files = {
    "01_extensions_and_schemas.sql": s01,
    "02_silver_tables.sql": s02,
    "03_foreign_keys_and_indexes.sql": s03,
    "04_scd2_history.sql": s04,
    "05_vehicle_position_partitions.sql": s05,
    "06_bronze_register.sql": s06,
    "07_comments.sql": s07,
}
for f, s in files.items():
    open(f"{OUT}/sql/{f}", "w", encoding="utf-8", newline="\n").write(s)

print("tables", len(TABLES), "fks", len(FKS), "fk indexes", nidx, "scd2", len(SCD2))
print("cols", sum(len(i['cols']) for i in TABLES.values()))
longest = max((c for i in TABLES.values() for c in [x[0] for x in i['cols']]), key=len)
print("longest col", longest, len(longest))
