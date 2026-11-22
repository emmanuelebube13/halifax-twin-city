-- DQ-042: a trip's route must match the route of the scheduled trip it runs (Logical Model V1,
-- Trip.Route Asset ID note). Linked through scheduled_trip_id when filled, otherwise through the
-- GTFS trip_id in the event's source key and the schedule version in force on the service date.
{{ config(tags=["DQ-042"]) }}
with linked as (
    select t.event_id, t.route_asset_id, st.route_asset_id as scheduled_route_asset_id
      from {{ source('silver', 'trip') }} t
      join {{ source('silver', 'event') }} e on e.event_id = t.event_id
      join {{ source('silver', 'scheduled_trip') }} st
        on st.scheduled_trip_id = t.scheduled_trip_id
        or (t.scheduled_trip_id is null
            and st.source_trip_key = split_part(e.source_event_key, '|', 1)
            and st.schedule_version_id in (
                select sv.schedule_version_id
                  from {{ source('silver', 'schedule_version') }} sv
                 where e.event_date between sv.service_period_start_date and sv.service_period_end_date))
)
select *
  from linked
 where route_asset_id <> scheduled_route_asset_id
