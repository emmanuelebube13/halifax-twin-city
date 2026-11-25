-- Gold layer, read-only. Silver is not changed.
-- TRN-Q11 "Which route segments are consistently slow and could be optimized?"
--
-- A segment is two consecutive stops of a route (stop sequence n to n + 1) in one direction. Its recorded
-- travel time is the arrival at the second stop minus the departure from the first (the arrival when no
-- departure was reported); its planned time comes from the schedule. Speed uses the route-path distance
-- along the route shape when available as a single LineString with both stops within 80 m in the forward
-- direction, falling back to the straight-line distance between the two stops otherwise.
--
-- gold.segment_speed(from, to, slow ratio): per segment over service days from..to. A day counts as slow
-- when that day's median recorded time is above p_slow_ratio x the median planned time (default 1.2, an
-- interim value, not yet decided). "Consistently slow" = a high slow_day_share over many days_observed.
-- Recorded times of zero or over one hour are left out as reporting errors.

CREATE OR REPLACE FUNCTION gold.segment_speed(
    p_from date,
    p_to date,
    p_slow_ratio numeric DEFAULT 1.2)
RETURNS TABLE (
    route_asset_id              bigint,
    route_short_name            varchar,
    direction_code              varchar,
    from_stop_asset_id          bigint,
    from_stop_name              varchar,
    to_stop_asset_id            bigint,
    to_stop_name                varchar,
    straight_line_metres        numeric,
    days_observed               bigint,
    observation_count           bigint,
    median_actual_seconds       numeric,
    median_scheduled_seconds    numeric,
    median_speed_km_per_hour    numeric,
    slow_day_count              bigint,
    slow_day_share              numeric
)
LANGUAGE sql STABLE AS
$$
WITH observed AS MATERIALIZED (
    SELECT o.*
      FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
     CROSS JOIN LATERAL gold.observed_stop_arrival(d.day::date) AS o
),
pairs AS (
    SELECT a.service_date, a.route_asset_id, a.route_short_name, a.direction_code,
           a.stop_asset_id AS from_stop_asset_id, a.stop_name AS from_stop_name,
           b.stop_asset_id AS to_stop_asset_id, b.stop_name AS to_stop_name,
           extract(epoch FROM b.actual_arrival_ts - coalesce(a.actual_departure_ts, a.actual_arrival_ts)) AS actual_seconds,
           extract(epoch FROM b.scheduled_arrival_ts - a.scheduled_departure_ts) AS scheduled_seconds
      FROM observed a
      JOIN observed b ON b.trip_event_id = a.trip_event_id AND b.stop_sequence_number = a.stop_sequence_number + 1
     WHERE a.scheduled_departure_ts IS NOT NULL AND b.scheduled_arrival_ts IS NOT NULL
),
valid AS (
    SELECT * FROM pairs WHERE actual_seconds > 0 AND actual_seconds <= 3600
),
daily AS (
    SELECT route_asset_id, route_short_name, direction_code, from_stop_asset_id, from_stop_name,
           to_stop_asset_id, to_stop_name, service_date,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY actual_seconds)    AS day_actual,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY scheduled_seconds) AS day_scheduled
      FROM valid
     GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
),
overall AS (
    SELECT route_asset_id, route_short_name, direction_code, from_stop_asset_id, from_stop_name,
           to_stop_asset_id, to_stop_name,
           count(*) AS observation_count,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY actual_seconds)    AS median_actual,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY scheduled_seconds) AS median_scheduled
      FROM valid
     GROUP BY 1, 2, 3, 4, 5, 6, 7
),
days AS (
    SELECT route_asset_id, direction_code, from_stop_asset_id, to_stop_asset_id,
           count(*) AS days_observed,
           count(*) FILTER (WHERE day_actual > p_slow_ratio * day_scheduled) AS slow_days
      FROM daily
     GROUP BY 1, 2, 3, 4
)
SELECT o.route_asset_id, o.route_short_name, o.direction_code,
       o.from_stop_asset_id, o.from_stop_name, o.to_stop_asset_id, o.to_stop_name,
       round(dist.straight_m::numeric, 1),
       d.days_observed,
       o.observation_count,
       round(o.median_actual::numeric, 1),
       round(o.median_scheduled::numeric, 1),
       round((dist.route_m / o.median_actual * 3.6)::numeric, 1),
       d.slow_days,
       round(d.slow_days::numeric / d.days_observed, 4)
  FROM overall o
  JOIN days d USING (route_asset_id, direction_code, from_stop_asset_id, to_stop_asset_id)
  JOIN silver.asset af       ON af.asset_id = o.from_stop_asset_id
  JOIN silver.location lf    ON lf.location_id = af.location_id
  JOIN silver.asset at       ON at.asset_id = o.to_stop_asset_id
  JOIN silver.location lt    ON lt.location_id = at.location_id
  LEFT JOIN silver.route rt  ON rt.asset_id = o.route_asset_id
  LEFT JOIN silver.asset ar  ON ar.asset_id = rt.asset_id
  LEFT JOIN silver.location rl ON rl.location_id = ar.location_id
 CROSS JOIN LATERAL (
       SELECT ST_Distance(lf.location_geometry::geography, lt.location_geometry::geography) AS straight_m,
              CASE
                WHEN rl.location_geometry IS NOT NULL
                 AND ST_GeometryType(rl.location_geometry) = 'ST_LineString'
                THEN CASE
                  WHEN ST_Distance(rl.location_geometry::geography, lf.location_geometry::geography) <= 80
                   AND ST_Distance(rl.location_geometry::geography, lt.location_geometry::geography) <= 80
                   AND ST_LineLocatePoint(rl.location_geometry, lf.location_geometry)
                       < ST_LineLocatePoint(rl.location_geometry, lt.location_geometry)
                  THEN coalesce(
                         nullif(
                           ST_Length(
                             ST_LineSubstring(
                               rl.location_geometry,
                               ST_LineLocatePoint(rl.location_geometry, lf.location_geometry),
                               ST_LineLocatePoint(rl.location_geometry, lt.location_geometry)
                             )::geography
                           ),
                           0
                         ),
                         ST_Distance(lf.location_geometry::geography, lt.location_geometry::geography)
                       )
                  ELSE ST_Distance(lf.location_geometry::geography, lt.location_geometry::geography)
                END
                ELSE ST_Distance(lf.location_geometry::geography, lt.location_geometry::geography)
              END AS route_m
 ) dist
$$;

COMMENT ON FUNCTION gold.segment_speed(date, date, numeric) IS
  'TRN-Q11: recorded and planned travel time, route-path speed (with straight-line fallback) and share of slow days for each stop-to-stop segment of a route. Read-only.';
