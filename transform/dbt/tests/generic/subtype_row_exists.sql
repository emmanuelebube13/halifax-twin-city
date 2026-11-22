-- Supertype rows whose discriminator names a subtype but have no row in that subtype table.
-- subtypes: {discriminator value: silver table name}
{% test subtype_row_exists(model, column_name, key_column, subtypes) %}
{% for value, table in subtypes.items() %}
select '{{ value }}' as expected_subtype, p.{{ key_column }}
  from {{ model }} p
 where p.{{ column_name }} = '{{ value }}'
   and not exists (select 1 from {{ source('silver', table) }} c where c.{{ key_column }} = p.{{ key_column }})
{% if not loop.last %}union all{% endif %}
{% endfor %}
{% endtest %}
