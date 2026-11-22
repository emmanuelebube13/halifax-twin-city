-- Rows whose geometry is not inside a longitude/latitude box (the Halifax region by default).
{% test within_envelope(model, column_name, xmin=-64.6, ymin=44.3, xmax=-62.0, ymax=45.4) %}
select ST_AsText(ST_Envelope({{ column_name }})) as envelope
  from {{ model }}
 where {{ column_name }} is not null
   and not ST_CoveredBy({{ column_name }}, ST_MakeEnvelope({{ xmin }}, {{ ymin }}, {{ xmax }}, {{ ymax }}, 4326))
{% endtest %}
