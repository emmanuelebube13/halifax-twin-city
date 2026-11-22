-- SCD Type 2 versions of one key that overlap or run backwards, read from a <table>_timeline view.
-- Each version must end at or before the next one starts, and never end before it starts.
{% test scd2_no_overlap(model, key_columns) %}
with v as (
    select {{ key_columns | join(', ') }}, valid_from_ts, valid_to_ts,
           lead(valid_from_ts) over (partition by {{ key_columns | join(', ') }} order by valid_from_ts, is_current) as next_from_ts
      from {{ model }}
)
select *
  from v
 where valid_to_ts < valid_from_ts
    or (next_from_ts is not null and coalesce(valid_to_ts, 'infinity'::timestamptz) > next_from_ts)
{% endtest %}
