-- DQ-064: at least one loaded GTFS schedule version is in force today (Halifax date).
-- Fails the day after the current service period ends: load the next file then.
{{ config(tags=["DQ-064"]) }}
select (now() at time zone 'America/Halifax')::date as halifax_today
 where not exists (
       select 1
         from {{ source('silver', 'schedule_version') }}
        where (now() at time zone 'America/Halifax')::date
              between service_period_start_date and service_period_end_date)
