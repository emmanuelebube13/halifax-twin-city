-- Combinations of columns that occur more than once (an alternate key that is not unique).
{% test unique_combination(model, combination_of_columns) %}
select {{ combination_of_columns | join(', ') }}, count(*) as copies
  from {{ model }}
 group by {{ combination_of_columns | join(', ') }}
having count(*) > 1
{% endtest %}
