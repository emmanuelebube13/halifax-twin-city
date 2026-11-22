-- Gold layer, read-only. Silver is not changed.
-- TRN-Q03 "Where and when do buses bunch together, arriving close together followed by a long gap?"
--
-- A bus is bunched when its actual headway is below p_bunched_ratio of the scheduled headway (default 0.25:
-- it came less than a quarter of the planned gap after the bus ahead). It is followed by a long gap when
-- the next headway is above p_long_gap_ratio of the scheduled headway (default 1.5). Both thresholds are
-- interim defaults, not yet decided by the architect; the API should pass them from business rules.
-- Only complete headways (see stop_headway.sql) with a scheduled headway are judged.

CREATE OR REPLACE FUNCTION gold.bus_bunching(
    p_day date,
    p_bunched_ratio numeric DEFAULT 0.25,
    p_long_gap_ratio numeric DEFAULT 1.5)
RETURNS TABLE (
    service_date                date,
    hour_of_day                 integer,
    stop_asset_id               bigint,
    stop_code                   varchar,
    stop_name                   varchar,
    route_asset_id              bigint,
    route_short_name            varchar,
    direction_code              varchar,
    source_trip_key             varchar,
    actual_arrival_ts           timestamptz,
    actual_headway_seconds      numeric,
    scheduled_headway_seconds   numeric,
    next_actual_headway_seconds numeric,
    followed_by_long_gap        boolean
)
LANGUAGE sql STABLE AS
$$
SELECT h.service_date,
       extract(hour FROM h.actual_arrival_ts AT TIME ZONE 'America/Halifax')::integer,
       h.stop_asset_id, h.stop_code, h.stop_name, h.route_asset_id, h.route_short_name, h.direction_code,
       h.source_trip_key, h.actual_arrival_ts, h.actual_headway_seconds, h.scheduled_headway_seconds,
       h.next_actual_headway_seconds,
       coalesce(h.next_actual_headway_seconds > p_long_gap_ratio * h.scheduled_headway_seconds, false)
  FROM gold.stop_headway(p_day) h
 WHERE h.headway_complete
   AND h.scheduled_headway_seconds > 0
   AND h.actual_headway_seconds < p_bunched_ratio * h.scheduled_headway_seconds
$$;

COMMENT ON FUNCTION gold.bus_bunching(date, numeric, numeric) IS
  'TRN-Q03: each bunched arrival (actual headway below the ratio of the scheduled one) and whether a long gap followed. Read-only.';

-- Summary for the story: how often buses bunch, by route and Halifax hour, over service days from..to.
CREATE OR REPLACE FUNCTION gold.bunching_by_route_hour(
    p_from date,
    p_to date,
    p_bunched_ratio numeric DEFAULT 0.25,
    p_long_gap_ratio numeric DEFAULT 1.5)
RETURNS TABLE (
    route_asset_id          bigint,
    route_short_name        varchar,
    hour_of_day             integer,
    days_observed           bigint,
    headways_judged         bigint,
    bunched_count           bigint,
    bunched_then_gap_count  bigint,
    bunched_share           numeric
)
LANGUAGE sql STABLE AS
$$
WITH h AS (
    SELECT s.*,
           extract(hour FROM s.actual_arrival_ts AT TIME ZONE 'America/Halifax')::integer AS hour_of_day,
           s.actual_headway_seconds < p_bunched_ratio * s.scheduled_headway_seconds AS bunched,
           coalesce(s.next_actual_headway_seconds > p_long_gap_ratio * s.scheduled_headway_seconds, false) AS long_gap
      FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
     CROSS JOIN LATERAL gold.stop_headway(d.day::date) AS s
     WHERE s.headway_complete AND s.scheduled_headway_seconds > 0
)
SELECT route_asset_id, route_short_name, hour_of_day,
       count(DISTINCT service_date),
       count(*),
       count(*) FILTER (WHERE bunched),
       count(*) FILTER (WHERE bunched AND long_gap),
       round(count(*) FILTER (WHERE bunched)::numeric / count(*), 4)
  FROM h
 GROUP BY 1, 2, 3
$$;

COMMENT ON FUNCTION gold.bunching_by_route_hour(date, date, numeric, numeric) IS
  'TRN-Q03 summary: judged headways and bunched arrivals by route and Halifax hour. Read-only.';
