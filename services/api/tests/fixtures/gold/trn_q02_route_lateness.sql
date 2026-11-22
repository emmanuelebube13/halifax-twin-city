-- Gold layer, read-only. Silver is not changed.
-- TRN-Q02 "Which routes are most often late, and at what times of day?"
-- gold.route_lateness_by_hour(from, to, early limit, late limit): recorded arrivals of the service days
-- from..to, by route and Halifax hour of the actual arrival, classed with the on-time rule.
-- The limits default to the interim rule (60 s early to 300 s late, not yet decided); the API passes the
-- values from config/business-rules.yaml. Arrivals with no reported delay are left out.

CREATE OR REPLACE FUNCTION gold.route_lateness_by_hour(
    p_from date,
    p_to date,
    p_early_limit_seconds integer DEFAULT -60,
    p_late_limit_seconds integer DEFAULT 300)
RETURNS TABLE (
    route_asset_id          bigint,
    route_short_name        varchar,
    hour_of_day             integer,
    days_observed           bigint,
    arrival_count           bigint,
    on_time_count           bigint,
    late_count              bigint,
    early_count             bigint,
    late_share              numeric,
    on_time_share           numeric,
    average_delay_seconds   numeric,
    median_delay_seconds    numeric
)
LANGUAGE sql STABLE AS
$$
SELECT o.route_asset_id,
       o.route_short_name,
       extract(hour FROM o.actual_arrival_ts AT TIME ZONE 'America/Halifax')::integer,
       count(DISTINCT o.service_date),
       count(*),
       count(*) FILTER (WHERE o.reported_delay_seconds BETWEEN p_early_limit_seconds AND p_late_limit_seconds),
       count(*) FILTER (WHERE o.reported_delay_seconds > p_late_limit_seconds),
       count(*) FILTER (WHERE o.reported_delay_seconds < p_early_limit_seconds),
       round(count(*) FILTER (WHERE o.reported_delay_seconds > p_late_limit_seconds)::numeric / count(*), 4),
       round(count(*) FILTER (WHERE o.reported_delay_seconds BETWEEN p_early_limit_seconds AND p_late_limit_seconds)::numeric
             / count(*), 4),
       round(avg(o.reported_delay_seconds), 1),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY o.reported_delay_seconds)::numeric
  FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
 CROSS JOIN LATERAL gold.observed_stop_arrival(d.day::date) AS o
 WHERE o.reported_delay_seconds IS NOT NULL
 GROUP BY 1, 2, 3
$$;

COMMENT ON FUNCTION gold.route_lateness_by_hour(date, date, integer, integer) IS
  'TRN-Q02: recorded arrivals by route and Halifax hour, classed on time, late or early with the given limits. Read-only.';
