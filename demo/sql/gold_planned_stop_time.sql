-- Demo build, task D03. Gold layer, read-only helper. Silver is not changed.
-- gold.planned_stop_time(day): every stop time the schedule plans for one service day, in Halifax time.
-- The D03 loader runs this file after each load (CREATE OR REPLACE, so it is safe to run again).

CREATE OR REPLACE FUNCTION gold.planned_stop_time(p_day date)
RETURNS TABLE (
    service_date            date,
    schedule_version_id     bigint,
    scheduled_trip_id       bigint,
    source_trip_key         varchar,
    route_asset_id          bigint,
    route_short_name        varchar,
    direction_code          varchar,
    trip_headsign           varchar,
    stop_sequence_number    integer,
    stop_asset_id           bigint,
    stop_code               varchar,
    stop_name               varchar,
    scheduled_arrival_ts    timestamptz,
    scheduled_departure_ts  timestamptz
)
LANGUAGE sql STABLE AS
$$
WITH version AS (
    -- The newest loaded schedule whose service period covers the day.
    SELECT schedule_version_id
      FROM silver.schedule_version
     WHERE p_day BETWEEN service_period_start_date AND service_period_end_date
     ORDER BY feed_published_date DESC, schedule_version_id DESC
     LIMIT 1
),
running AS (
    -- Service patterns that run on the day: weekly calendar, minus removed dates, plus added dates.
    SELECT c.schedule_version_id, c.service_code
      FROM silver.service_calendar c
      JOIN version v USING (schedule_version_id)
     WHERE p_day BETWEEN c.start_date AND c.end_date
       AND CASE extract(isodow FROM p_day)
             WHEN 1 THEN c.monday_flag WHEN 2 THEN c.tuesday_flag WHEN 3 THEN c.wednesday_flag
             WHEN 4 THEN c.thursday_flag WHEN 5 THEN c.friday_flag WHEN 6 THEN c.saturday_flag
             ELSE c.sunday_flag END
       AND NOT EXISTS (SELECT 1 FROM silver.service_calendar_exception x
                        WHERE x.schedule_version_id = c.schedule_version_id AND x.service_code = c.service_code
                          AND x.exception_date = p_day AND x.exception_type_code = 'Removed')
    UNION
    SELECT x.schedule_version_id, x.service_code
      FROM silver.service_calendar_exception x
      JOIN version v USING (schedule_version_id)
     WHERE x.exception_date = p_day AND x.exception_type_code = 'Added'
)
SELECT p_day,
       t.schedule_version_id,
       t.scheduled_trip_id,
       t.source_trip_key,
       t.route_asset_id,
       r.route_short_name,
       t.direction_code,
       t.trip_headsign,
       st.stop_sequence_number,
       st.stop_asset_id,
       s.stop_code,
       s.stop_name,
       (p_day + st.scheduled_arrival_time)   AT TIME ZONE 'America/Halifax',
       (p_day + st.scheduled_departure_time) AT TIME ZONE 'America/Halifax'
  FROM running sr
  JOIN silver.scheduled_trip t       ON t.schedule_version_id = sr.schedule_version_id AND t.service_code = sr.service_code
  JOIN silver.scheduled_stop_time st ON st.scheduled_trip_id = t.scheduled_trip_id
  JOIN silver.route r                ON r.asset_id = t.route_asset_id
  JOIN silver.stop s                 ON s.asset_id = st.stop_asset_id
$$;

COMMENT ON FUNCTION gold.planned_stop_time(date) IS
  'Demo D03: planned stop times for one service day (newest schedule covering it), times in Halifax time. Read-only.';
