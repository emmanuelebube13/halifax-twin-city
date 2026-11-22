-- Rows where geometry_type_code (Point, Line, Polygon, None) disagrees with the stored geometry.
{% test geometry_type_matches_code(model, column_name, code_column) %}
select {{ code_column }} as code, GeometryType({{ column_name }}) as stored
  from {{ model }}
 where not (
       ({{ code_column }} = 'Point'   and GeometryType({{ column_name }}) in ('POINT', 'MULTIPOINT'))
    or ({{ code_column }} = 'Line'    and GeometryType({{ column_name }}) in ('LINESTRING', 'MULTILINESTRING'))
    or ({{ code_column }} = 'Polygon' and GeometryType({{ column_name }}) in ('POLYGON', 'MULTIPOLYGON'))
    or ({{ code_column }} = 'None'    and {{ column_name }} is null)
 )
{% endtest %}
