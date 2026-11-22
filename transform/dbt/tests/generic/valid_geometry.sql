-- Rows whose geometry fails PostGIS validity (self-intersections, bad rings ...).
-- ST_IsValidReason says why, so a failure is easy to read with `dbt test --store-failures` on a scratch copy.
{% test valid_geometry(model, column_name) %}
select ST_IsValidReason({{ column_name }}) as reason
  from {{ model }}
 where {{ column_name }} is not null
   and not ST_IsValid({{ column_name }})
{% endtest %}
