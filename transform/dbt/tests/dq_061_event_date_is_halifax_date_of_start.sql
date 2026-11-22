-- DQ-061: for every event except Trip, event_date is the Halifax calendar date of event_start_ts.
-- (A Trip's event_date is its GTFS service date, which runs to about 03:00 the next morning.)
{{ config(tags=["DQ-061"], severity="warn") }}
select event_type_code, count(*) as rows_off
  from {{ source('silver', 'event') }}
 where event_type_code <> 'Trip'
   and event_date <> (event_start_ts at time zone 'America/Halifax')::date
 group by event_type_code
