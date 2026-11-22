-- Gold layer, read-only. Silver is not changed.
-- TRN-Q04 "What is the actual wait between buses at each stop compared with the schedule?"
--
-- gold.stop_wait_comparison(from, to): for each stop, route and direction, the average gap between buses as
-- recorded and as planned, and the average wait of a rider who turns up at a random moment:
--     expected wait = sum(headway squared) / (2 x sum(headway))
-- This is the standard "excess wait time" measure: uneven gaps make riders wait longer even when the
-- average gap matches the plan. Only complete headways (see stop_headway.sql) with a scheduled headway count.

CREATE OR REPLACE FUNCTION gold.stop_wait_comparison(p_from date, p_to date)
RETURNS TABLE (
    stop_asset_id                       bigint,
    stop_code                           varchar,
    stop_name                           varchar,
    route_asset_id                      bigint,
    route_short_name                    varchar,
    direction_code                      varchar,
    days_observed                       bigint,
    headways_observed                   bigint,
    average_actual_headway_seconds      numeric,
    average_scheduled_headway_seconds   numeric,
    expected_actual_wait_seconds        numeric,
    expected_scheduled_wait_seconds     numeric,
    excess_wait_seconds                 numeric
)
LANGUAGE sql STABLE AS
$$
WITH h AS (
    SELECT s.*
      FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
     CROSS JOIN LATERAL gold.stop_headway(d.day::date) AS s
     WHERE s.headway_complete AND s.scheduled_headway_seconds > 0 AND s.actual_headway_seconds > 0
)
SELECT stop_asset_id, stop_code, stop_name, route_asset_id, route_short_name, direction_code,
       count(DISTINCT service_date),
       count(*),
       round(avg(actual_headway_seconds), 1),
       round(avg(scheduled_headway_seconds), 1),
       round(sum(actual_headway_seconds ^ 2) / (2 * sum(actual_headway_seconds)), 1),
       round(sum(scheduled_headway_seconds ^ 2) / (2 * sum(scheduled_headway_seconds)), 1),
       round(sum(actual_headway_seconds ^ 2) / (2 * sum(actual_headway_seconds))
             - sum(scheduled_headway_seconds ^ 2) / (2 * sum(scheduled_headway_seconds)), 1)
  FROM h
 GROUP BY 1, 2, 3, 4, 5, 6
$$;

COMMENT ON FUNCTION gold.stop_wait_comparison(date, date) IS
  'TRN-Q04: average and expected rider wait at each stop, route and direction, recorded against planned; excess = recorded minus planned. Read-only.';
