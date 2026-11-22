-- Rows where a boolean expression is false. Rows where it is null are not counted:
-- add a not_null test when emptiness matters.
{% test expression_is_true(model, expression, column_name=none) %}
select *
  from {{ model }}
 where not ({{ expression }})
{% endtest %}
