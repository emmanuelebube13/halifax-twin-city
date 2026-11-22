-- Gold layer, read-only helper. Silver is not changed.
-- gold.stop_headway(day): for each recorded arrival at a stop, the time since the previous recorded bus of
-- the same route and direction at that stop (actual headway), and the planned gap for that trip (scheduled
-- headway). The base of TRN-Q03 (bunching) and TRN-Q04 (actual versus scheduled wait).
--
-- headway_complete: the previous recorded bus is the trip planned just before or just after this one at
-- this stop. When a bus in between was not recorded (feed gap, no arrival reported), the actual headway
-- would look too long, so it is marked incomplete. Use only complete headways for measures.

CREATE OR REPLACE FUNCTION gold.stop_headway(p_day date)
RETURNS TABLE (
    service_date                date,
    stop_asset_id               bigint,
    stop_code                   varchar,
    stop_name                   varchar,
    route_asset_id              bigint,
    route_short_name            varchar,
    direction_code              varchar,
    trip_event_id               bigint,
    source_trip_key             varchar,
    actual_arrival_ts           timestamptz,
    scheduled_arrival_ts        timestamptz,
    actual_headway_seconds      numeric,
    scheduled_headway_seconds   numeric,
    next_actual_headway_seconds numeric,
    headway_complete            boolean
)
LANGUAGE sql STABLE AS
$$
WITH planned AS (
    SELECT p.source_trip_key, p.stop_sequence_number, p.stop_asset_id, p.route_asset_id, p.direction_code,
           row_number() OVER w AS planned_rank,
           extract(epoch FROM p.scheduled_arrival_ts - lag(p.scheduled_arrival_ts) OVER w) AS scheduled_headway_seconds
      FROM gold.planned_stop_time(p_day) p
    WINDOW w AS (PARTITION BY p.stop_asset_id, p.route_asset_id, p.direction_code ORDER BY p.scheduled_arrival_ts, p.source_trip_key)
),
observed AS (
    SELECT o.*, pl.planned_rank, pl.scheduled_headway_seconds
      FROM gold.observed_stop_arrival(p_day) o
      JOIN planned pl ON pl.source_trip_key = o.source_trip_key AND pl.stop_sequence_number = o.stop_sequence_number
),
ordered AS (
    SELECT ob.*,
           extract(epoch FROM ob.actual_arrival_ts - lag(ob.actual_arrival_ts) OVER w)  AS actual_headway_seconds,
           extract(epoch FROM lead(ob.actual_arrival_ts) OVER w - ob.actual_arrival_ts) AS next_actual_headway_seconds,
           lag(ob.planned_rank) OVER w AS previous_planned_rank
      FROM observed ob
    WINDOW w AS (PARTITION BY ob.stop_asset_id, ob.route_asset_id, ob.direction_code ORDER BY ob.actual_arrival_ts, ob.source_trip_key)
)
SELECT service_date, stop_asset_id, stop_code, stop_name, route_asset_id, route_short_name, direction_code,
       trip_event_id, source_trip_key, actual_arrival_ts, scheduled_arrival_ts,
       actual_headway_seconds, scheduled_headway_seconds::numeric, next_actual_headway_seconds,
       coalesce(abs(planned_rank - previous_planned_rank) = 1, false)
  FROM ordered
$$;

COMMENT ON FUNCTION gold.stop_headway(date) IS
  'Actual and scheduled headway for each recorded arrival, by stop, route and direction; headway_complete marks gaps with no unrecorded bus in between. Read-only.';
