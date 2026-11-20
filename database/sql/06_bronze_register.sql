-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 06  Bronze register
-- Raw feed files stay as files on disk. This table records every fetch, which is how Gate 0 (48 hours with no gaps) is checked.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

CREATE TABLE bronze.feed_fetch (
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
