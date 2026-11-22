-- Location rules from Logical Model V1 (LOCRULE): rows of one type whose location_id is
-- not a row of an allowed location subtype. allowed = [] means the location must be empty.
{% test location_rule(model, column_name, type_column, type_value, allowed) %}
select p.{{ column_name }}
  from {{ model }} p
 where p.{{ type_column }} = '{{ type_value }}'
   and p.{{ column_name }} is not null
{% for table in allowed %}
   and not exists (select 1 from {{ source('silver', table) }} l where l.location_id = p.{{ column_name }})
{% endfor %}
{% endtest %}
