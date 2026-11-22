-- Gold layer, read-only. Silver is not changed.
-- TRN-Q05 "Which scheduled trips never run?"
--
-- gold.scheduled_trip_status(day, as of): every trip the schedule plans for one service day, with what the
-- realtime feed showed for it. trip_status is one of:
--   Seen         the trip appeared in the trip updates feed (SRC-002) or a bus reported it (SRC-001)
--   Cancelled    the feed marked it cancelled
--   Not seen     never in the feed, and the collector was fetching trip updates the whole time it was planned
--   Not covered  never in the feed, but the collector was not fetching the whole time (cannot tell)
--   Not yet due  its last planned stop is after p_as_of
-- Coverage: successful SRC-002 fetches with no gap over p_max_gap_seconds (default 300) from the trip's first
-- planned departure to its last planned arrival. Only "Not seen" and "Cancelled" answer the question.

CREATE OR REPLACE FUNCTION gold.scheduled_trip_status(
    p_day date,
    p_as_of timestamptz DEFAULT now(),
    p_max_gap_seconds integer DEFAULT 300)
RETURNS TABLE (
    service_date            date,
    scheduled_trip_id       bigint,
    source_trip_key         varchar,
    route_asset_id          bigint,
    route_short_name        varchar,
    direction_code          varchar,
    trip_headsign           varchar,
    first_departure_ts      timestamptz,
    last_arrival_ts         timestamptz,
    trip_event_id           bigint,
    trip_status             varchar
)
LANGUAGE sql STABLE AS
$$
WITH planned AS (
    SELECT p.scheduled_trip_id, p.source_trip_key, p.route_asset_id, p.route_short_name, p.direction_code,
           p.trip_headsign, min(p.scheduled_departure_ts) AS first_departure_ts, max(p.scheduled_arrival_ts) AS last_arrival_ts
      FROM gold.planned_stop_time(p_day) p
     GROUP BY 1, 2, 3, 4, 5, 6
),
fetches AS (
    -- Successful trip update fetches around the service day, grouped into unbroken runs.
    SELECT f.fetched_ts,
           CASE WHEN f.fetched_ts - lag(f.fetched_ts) OVER (ORDER BY f.fetched_ts) <= make_interval(secs => p_max_gap_seconds)
                THEN 0 ELSE 1 END AS starts_run
      FROM bronze.feed_fetch f
     WHERE f.source_id = 'SRC-002' AND f.http_status = 200
       AND f.fetched_ts BETWEEN (p_day - 1)::timestamptz AND (p_day + 3)::timestamptz
),
runs AS (
    SELECT min(fetched_ts) AS run_start, max(fetched_ts) AS run_end
      FROM (SELECT fetched_ts, sum(starts_run) OVER (ORDER BY fetched_ts) AS run_id FROM fetches) x
     GROUP BY run_id
),
seen AS (
    SELECT e.event_id, split_part(e.source_event_key, '|', 1) AS source_trip_key, e.event_status_code,
           EXISTS (SELECT 1 FROM silver.vehicle_position vp WHERE vp.trip_event_id = e.event_id) AS has_position
      FROM silver.event e
     WHERE e.event_type_code = 'Trip' AND e.source_id = 'SRC-002' AND e.event_date = p_day
)
SELECT p_day, p.scheduled_trip_id, p.source_trip_key, p.route_asset_id, p.route_short_name, p.direction_code,
       p.trip_headsign, p.first_departure_ts, p.last_arrival_ts, s.event_id,
       (CASE
          WHEN s.event_status_code = 'Cancelled' AND NOT coalesce(s.has_position, false) THEN 'Cancelled'
          WHEN s.event_id IS NOT NULL THEN 'Seen'
          WHEN p.last_arrival_ts > p_as_of THEN 'Not yet due'
          WHEN EXISTS (SELECT 1 FROM runs r WHERE r.run_start <= p.first_departure_ts AND r.run_end >= p.last_arrival_ts)
               THEN 'Not seen'
          ELSE 'Not covered'
        END)::varchar
  FROM planned p
  LEFT JOIN seen s ON s.source_trip_key = p.source_trip_key
$$;

COMMENT ON FUNCTION gold.scheduled_trip_status(date, timestamptz, integer) IS
  'TRN-Q05: each planned trip of a service day with its status in the realtime feed (Seen, Cancelled, Not seen, Not covered, Not yet due). Read-only.';
