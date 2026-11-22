-- Subtype rows whose supertype row has a different discriminator value
-- (for example a silver.trip row whose event is typed 'Stop Arrival').
{% test discriminator_matches(model, column_name, parent, discriminator, value) %}
select c.{{ column_name }}, p.{{ discriminator }} as found
  from {{ model }} c
  join {{ source('silver', parent) }} p on p.{{ column_name }} = c.{{ column_name }}
 where p.{{ discriminator }} is distinct from '{{ value }}'
{% endtest %}
