-- Rows that carry a geometry with no coordinates (GEOMETRYCOLLECTION EMPTY and the like).
{% test geometry_not_empty(model, column_name) %}
select 1 as empty_geometry
  from {{ model }}
 where {{ column_name }} is not null
   and ST_IsEmpty({{ column_name }})
{% endtest %}
