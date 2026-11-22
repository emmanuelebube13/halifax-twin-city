-- DQ-096 (Gate 0): no gap over 2 minutes between successful fetches of the live feeds
-- SRC-001 to SRC-003 within the last 48 hours. Each returned row is one gap.
{{ config(tags=["DQ-096"], severity="warn") }}
select source_id, fetched_ts, gap
  from {{ source('bronze', 'feed_gap') }}
 where source_id in ('SRC-001', 'SRC-002', 'SRC-003')
   and fetched_ts >= now() - interval '48 hours'
   and gap > interval '2 minutes'
