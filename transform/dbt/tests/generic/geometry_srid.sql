-- Rows whose geometry is not in the expected spatial reference (4326 = WGS 84 longitude/latitude).
{% test geometry_srid(model, column_name, srid=4326) %}
select ST_SRID({{ column_name }}) as srid
  from {{ model }}
 where {{ column_name }} is not null
   and ST_SRID({{ column_name }}) <> {{ srid }}
{% endtest %}
