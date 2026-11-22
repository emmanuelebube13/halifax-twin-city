-- DQ-043: an arrival's stop must be the stop the schedule plans for that trip and stop sequence.
-- Same trip link as DQ-042. Arrivals whose trip cannot be linked to a scheduled trip are not judged here.
{{ config(tags=["DQ-043"], severity="warn") }}
with arrivals as (
    select sa.event_id, sa.stop_asset_id, sa.stop_sequence_number, te.source_event_key, te.event_date,
           t.scheduled_trip_id
      from {{ source('silver', 'stop_arrival') }} sa
      join {{ source('silver', 'trip') }} t on t.event_id = sa.trip_event_id
      join {{ source('silver', 'event') }} te on te.event_id = t.event_id
),
linked as (
    select a.*, sst.stop_asset_id as scheduled_stop_asset_id
      from arrivals a
      join {{ source('silver', 'scheduled_trip') }} st
        on st.scheduled_trip_id = a.scheduled_trip_id
        or (a.scheduled_trip_id is null
            and st.source_trip_key = split_part(a.source_event_key, '|', 1)
            and st.schedule_version_id in (
                select sv.schedule_version_id
                  from {{ source('silver', 'schedule_version') }} sv
                 where a.event_date between sv.service_period_start_date and sv.service_period_end_date))
      join {{ source('silver', 'scheduled_stop_time') }} sst
        on sst.scheduled_trip_id = st.scheduled_trip_id
       and sst.stop_sequence_number = a.stop_sequence_number
)
select *
  from linked
 where stop_asset_id <> scheduled_stop_asset_id
