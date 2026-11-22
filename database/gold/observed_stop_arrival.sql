-- Gold layer, read-only helper. Silver is not changed.
-- gold.observed_stop_arrival(day): every arrival the realtime collector recorded for trips of one service
-- day, matched to its planned stop time (same GTFS trip_id and stop sequence) in gold.planned_stop_time(day).
-- The base of the daily bus measures (TRN-Q02, Q03, Q04, Q11). Needs planned_stop_time.sql first.

CREATE OR REPLACE FUNCTION gold.observed_stop_arrival(p_day date)
RETURNS TABLE (
    service_date            date,
    trip_event_id           bigint,
    source_trip_key         varchar,
    scheduled_trip_id       bigint,
    route_asset_id          bigint,
    route_short_name        varchar,
    direction_code          varchar,
    stop_sequence_number    integer,
    stop_asset_id           bigint,
    stop_code               varchar,
    stop_name               varchar,
    actual_arrival_ts       timestamptz,
    actual_departure_ts     timestamptz,
    reported_delay_seconds  integer,
    scheduled_arrival_ts    timestamptz,
    scheduled_departure_ts  timestamptz
)
LANGUAGE sql STABLE AS
$$
WITH planned AS (
    SELECT * FROM gold.planned_stop_time(p_day)
)
SELECT te.event_date,
       te.event_id,
       split_part(te.source_event_key, '|', 1)::varchar,
       p.scheduled_trip_id,
       t.route_asset_id,
       r.route_short_name,
       p.direction_code,
       sa.stop_sequence_number,
       sa.stop_asset_id,
       s.stop_code,
       s.stop_name,
       ae.event_start_ts,
       sa.actual_departure_ts,
       sa.reported_delay_seconds,
       p.scheduled_arrival_ts,
       p.scheduled_departure_ts
  FROM silver.event te
  JOIN silver.trip t          ON t.event_id = te.event_id
  JOIN silver.stop_arrival sa ON sa.trip_event_id = te.event_id
  JOIN silver.event ae        ON ae.event_id = sa.event_id
  JOIN silver.route r         ON r.asset_id = t.route_asset_id
  JOIN silver.stop s          ON s.asset_id = sa.stop_asset_id
  LEFT JOIN planned p         ON p.source_trip_key = split_part(te.source_event_key, '|', 1)
                             AND p.stop_sequence_number = sa.stop_sequence_number
 WHERE te.event_type_code = 'Trip'
   AND te.source_id = 'SRC-002'
   AND te.event_date = p_day
$$;

COMMENT ON FUNCTION gold.observed_stop_arrival(date) IS
  'Recorded stop arrivals for trips of one service day, matched to the planned stop time where the schedule has it (scheduled columns empty otherwise). Read-only.';
