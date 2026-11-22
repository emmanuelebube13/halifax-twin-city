# Gold: transit functions

Read-only SQL functions in the `gold` schema for the transit stories. They read silver (and `bronze.feed_fetch` for coverage) and change nothing. Silver is not changed.

All of them are installed, in order, by the GTFS schedule loader after every load, or on their own:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1 -GoldOnly
```

Every function is `CREATE OR REPLACE`, so installing again is safe. Tests: `services/collector/tests/test_db_gold.py` (a hand-built service day with known answers).

## Conventions

- **Service day** (`date`): the GTFS service date, which runs past midnight (a 01:10 trip belongs to the day before). Trip updates give it as `start_date`.
- Times are `timestamptz`. Hours of day (`hour_of_day`) are Halifax hours of the recorded arrival, 0 to 23.
- Ranges (`p_from`, `p_to`) include both days. Pass the Halifax date, not `CURRENT_DATE` (the server runs in UTC): `(now() AT TIME ZONE 'America/Halifax')::date`.
- Thresholds are parameters with interim defaults, **not yet decided** by the architect. The serving API should pass them from `config/business-rules.yaml` so a rule change is configuration, not code.
- Shares are fractions from 0 to 1 with 4 decimals. Seconds are `numeric`.
- A day with no recorded data returns no rows (no zeros are invented).

## Functions

| Function | Question | Grain |
| --- | --- | --- |
| `planned_stop_time(p_day)` | Base: what the schedule plans | One planned stop time |
| `observed_stop_arrival(p_day)` | Base: what the feed recorded, matched to the plan | One recorded arrival |
| `stop_headway(p_day)` | Base for Q03 and Q04 | One recorded arrival with its headways |
| `route_lateness_by_hour(p_from, p_to, p_early_limit_seconds, p_late_limit_seconds)` | TRN-Q02 | Route x hour |
| `bus_bunching(p_day, p_bunched_ratio, p_long_gap_ratio)` | TRN-Q03 | One bunched arrival |
| `bunching_by_route_hour(p_from, p_to, p_bunched_ratio, p_long_gap_ratio)` | TRN-Q03 | Route x hour |
| `stop_wait_comparison(p_from, p_to)` | TRN-Q04 | Stop x route x direction |
| `scheduled_trip_status(p_day, p_as_of, p_max_gap_seconds)` | TRN-Q05 | One planned trip |
| `segment_speed(p_from, p_to, p_slow_ratio)` | TRN-Q11 | Route x direction x stop pair |

Question wording (Business Questions register, Transportation tab):

| Id | Question | Cadence |
| --- | --- | --- |
| TRN-Q02 | Which routes are most often late, and at what times of day? | Daily |
| TRN-Q03 | Where and when do buses bunch together, arriving close together followed by a long gap? | Daily |
| TRN-Q04 | What is the actual wait between buses at each stop compared with the schedule? | Daily |
| TRN-Q05 | Which scheduled trips never run? | Daily |
| TRN-Q11 | Which route segments are consistently slow and could be optimized? | Periodic |

### planned_stop_time(p_day date)

Every stop time the newest schedule covering the day plans, in Halifax time.

Columns: `service_date`, `schedule_version_id`, `scheduled_trip_id`, `source_trip_key`, `route_asset_id`, `route_short_name`, `direction_code`, `trip_headsign`, `stop_sequence_number`, `stop_asset_id`, `stop_code`, `stop_name`, `scheduled_arrival_ts`, `scheduled_departure_ts`.

### observed_stop_arrival(p_day date)

Recorded arrivals (`silver.stop_arrival`) for trips of the service day, matched to the planned stop time by GTFS trip id and stop sequence. Arrivals of trips not in the schedule (added trips) keep empty scheduled columns.

Columns: `service_date`, `trip_event_id`, `source_trip_key`, `scheduled_trip_id`, `route_asset_id`, `route_short_name`, `direction_code`, `stop_sequence_number`, `stop_asset_id`, `stop_code`, `stop_name`, `actual_arrival_ts`, `actual_departure_ts`, `reported_delay_seconds`, `scheduled_arrival_ts`, `scheduled_departure_ts`.

### stop_headway(p_day date)

For each recorded arrival with a planned match: the time since the previous recorded bus of the same route and direction at that stop (`actual_headway_seconds`), the planned gap before this trip (`scheduled_headway_seconds`), and the time to the next recorded bus (`next_actual_headway_seconds`).

`headway_complete` is true when the previous recorded bus is the trip planned just before or just after this one at the stop. When a bus in between was not recorded, the actual headway would look too long, so Q03 and Q04 use complete headways only.

Columns: `service_date`, `stop_asset_id`, `stop_code`, `stop_name`, `route_asset_id`, `route_short_name`, `direction_code`, `trip_event_id`, `source_trip_key`, `actual_arrival_ts`, `scheduled_arrival_ts`, `actual_headway_seconds`, `scheduled_headway_seconds`, `next_actual_headway_seconds`, `headway_complete`.

### route_lateness_by_hour(p_from date, p_to date, p_early_limit_seconds integer = -60, p_late_limit_seconds integer = 300)

TRN-Q02. Recorded arrivals with a reported delay, by route and Halifax hour. On time = delay between the two limits (inclusive); late = above the late limit; early = below the early limit.

Columns: `route_asset_id`, `route_short_name`, `hour_of_day`, `days_observed`, `arrival_count`, `on_time_count`, `late_count`, `early_count`, `late_share`, `on_time_share`, `average_delay_seconds`, `median_delay_seconds`.

### bus_bunching(p_day date, p_bunched_ratio numeric = 0.25, p_long_gap_ratio numeric = 1.5)

TRN-Q03, detail. Each arrival whose complete actual headway is below `p_bunched_ratio` x the scheduled headway (it came less than a quarter of the planned gap behind the bus ahead). `followed_by_long_gap` is true when the next headway is above `p_long_gap_ratio` x the scheduled one.

Columns: `service_date`, `hour_of_day`, `stop_asset_id`, `stop_code`, `stop_name`, `route_asset_id`, `route_short_name`, `direction_code`, `source_trip_key`, `actual_arrival_ts`, `actual_headway_seconds`, `scheduled_headway_seconds`, `next_actual_headway_seconds`, `followed_by_long_gap`.

### bunching_by_route_hour(p_from date, p_to date, p_bunched_ratio numeric = 0.25, p_long_gap_ratio numeric = 1.5)

TRN-Q03, summary for the story.

Columns: `route_asset_id`, `route_short_name`, `hour_of_day`, `days_observed`, `headways_judged`, `bunched_count`, `bunched_then_gap_count`, `bunched_share`.

### stop_wait_comparison(p_from date, p_to date)

TRN-Q04. For each stop, route and direction: average recorded and planned gap between buses, and the expected wait of a rider who turns up at a random moment, `sum(h^2) / (2 x sum(h))`. Uneven gaps raise the expected wait even when the average gap matches the plan. `excess_wait_seconds` = recorded minus planned expected wait.

Columns: `stop_asset_id`, `stop_code`, `stop_name`, `route_asset_id`, `route_short_name`, `direction_code`, `days_observed`, `headways_observed`, `average_actual_headway_seconds`, `average_scheduled_headway_seconds`, `expected_actual_wait_seconds`, `expected_scheduled_wait_seconds`, `excess_wait_seconds`.

### scheduled_trip_status(p_day date, p_as_of timestamptz = now(), p_max_gap_seconds integer = 300)

TRN-Q05. Every trip planned for the service day, with `trip_status`:

| Status | Meaning |
| --- | --- |
| Seen | In the trip updates feed (SRC-002) for that service day |
| Cancelled | The feed marked it cancelled and no bus reported it |
| Not seen | Never in the feed, and the collector fetched trip updates with no gap over `p_max_gap_seconds` from its first planned departure to its last planned arrival |
| Not covered | Never in the feed, but the collector was not fetching the whole time: cannot tell |
| Not yet due | Its last planned arrival is after `p_as_of` |

Only Not seen and Cancelled answer "never ran". Not covered is shown so that a collector outage is never mistaken for missed service.

Columns: `service_date`, `scheduled_trip_id`, `source_trip_key`, `route_asset_id`, `route_short_name`, `direction_code`, `trip_headsign`, `first_departure_ts`, `last_arrival_ts`, `trip_event_id`, `trip_status`.

### segment_speed(p_from date, p_to date, p_slow_ratio numeric = 1.2)

TRN-Q11. A segment is two consecutive stops of a trip (sequence n to n + 1). Recorded time = arrival at the second stop minus departure from the first (arrival when no departure was reported); planned time from the schedule. Distance is the straight line between the stops (route shapes are not cut into segments yet), so `median_speed_km_per_hour` is a straight-line speed. A day is slow when its median recorded time is above `p_slow_ratio` x its median planned time. "Consistently slow" = high `slow_day_share` over many `days_observed`. Recorded times of zero or over one hour are left out.

Columns: `route_asset_id`, `route_short_name`, `direction_code`, `from_stop_asset_id`, `from_stop_name`, `to_stop_asset_id`, `to_stop_name`, `straight_line_metres`, `days_observed`, `observation_count`, `median_actual_seconds`, `median_scheduled_seconds`, `median_speed_km_per_hour`, `slow_day_count`, `slow_day_share`.

## Interim thresholds to decide

| Parameter | Default | Used by |
| --- | --- | --- |
| On time | 60 s early to 300 s late | `route_lateness_by_hour` (already in `config/business-rules.yaml`) |
| Bunched | headway below 0.25 x scheduled | `bus_bunching`, `bunching_by_route_hour` |
| Long gap | headway above 1.5 x scheduled | `bus_bunching`, `bunching_by_route_hour` |
| Slow segment day | median time above 1.2 x planned | `segment_speed` |
| Coverage gap | 300 s without a successful trip updates fetch | `scheduled_trip_status` |

## How much history these need

The collector started writing to `halifax_twin` at 21:05 on 21 Nov 2026. Daily measures are meaningful once whole service days are recorded (from 22 Nov 2026); Q11's "consistently" needs two to four weeks (wave C in the plan). Until then the functions return what exists, labelled by `days_observed`, `headways_judged` and `trip_status`.
