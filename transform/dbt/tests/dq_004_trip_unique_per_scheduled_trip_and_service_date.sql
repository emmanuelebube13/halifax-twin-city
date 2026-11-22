-- DQ-004: one trip per scheduled trip and service date (the rule ak1_trip cannot express,
-- because the service date lives on silver.event). Open question 7 on ak1_trip.
{{ config(tags=["DQ-004"]) }}
select t.scheduled_trip_id, e.event_date, count(*) as copies
  from {{ source('silver', 'trip') }} t
  join {{ source('silver', 'event') }} e on e.event_id = t.event_id
 where t.scheduled_trip_id is not null
 group by t.scheduled_trip_id, e.event_date
having count(*) > 1
