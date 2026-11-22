-- Rows stamped later than now plus a small tolerance for clock drift.
{% test not_in_future(model, column_name, tolerance='5 minutes') %}
select {{ column_name }}
  from {{ model }}
 where {{ column_name }} > now() + interval '{{ tolerance }}'
{% endtest %}
