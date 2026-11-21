# D03: the transit schedule

20 Nov 2026 · Task D03 of the demo build

## What was built and why

The live feeds say what is happening; the schedule says what should happen. Without it the map can't draw routes, can't name stops, and can't tell whether a bus is late against its plan. D03 loads Halifax Transit's GTFS file (SRC-004) in about 25 seconds:

| GTFS file | Lands in | Count (version 2026_08_August_20260806) |
| --- | --- | --- |
| stops.txt | `location` (point) + `asset` + `stop` | 2,358 |
| routes.txt + shapes.txt | `location` (route line) + `asset` + `route` | 81 |
| feed_info.txt | `schedule_version` | 1 |
| calendar.txt, calendar_dates.txt | `service_calendar`, `service_calendar_exception` | 9 patterns, 82 exceptions |
| trips.txt | `scheduled_trip` | 9,239 |
| stop_times.txt | `scheduled_stop_time` | 324,165 |

It also installs `gold.planned_stop_time(day)`, a read-only function that answers "what is planned on this day?" (4,186 trips and 145,866 stop times on Friday 20 Nov).

### Ideas worth knowing

**1. Two kinds of change.** Stops and routes are things that change slowly, so they are updated in place and SCD2 keeps the old versions. A schedule is a document that is replaced as a whole, so each file becomes a new `schedule_version` and the old one stays. Both keep history; they just do it differently.

**2. Reloading should change nothing.** Running the loader twice on the same file must add no rows and no history. The first version of this loader failed that test: it inserted stops, then set their parent station in a second step, which left 60 false versions in `stop_hist`. The fix was to set everything in one statement. The check is part of "How I verified": all four history tables stay at 0 after a reload.

**3. Times past midnight.** GTFS writes a 01:27 trip that belongs to Friday's service as `25:27:00`. Stored as an interval, `day + interval` gives the right moment, and the trip still sorts after the 23:50 one.

**4. COPY for big tables.** 324,165 stop times go in with PostgreSQL's `COPY`, which streams rows instead of sending one INSERT each. That's most of why the load takes seconds, not minutes.

## How to run it

```powershell
powershell -ExecutionPolicy Bypass -File demo\load.ps1 gtfs_schedule
```

Or all one-off loaders at once: `demo\load.ps1 all`. The service period ends 29 Nov 2026; run it again when Halifax Transit publishes the next file.

## Hands-on exercise

Work out how your busiest route's day looks, from the plan alone.

1. Find today's five busiest routes:

   ```sql
   SELECT route_short_name, count(DISTINCT scheduled_trip_id) AS trips, count(*) AS stop_times
     FROM gold.planned_stop_time((now() AT TIME ZONE 'America/Halifax')::date)
    GROUP BY 1 ORDER BY 3 DESC LIMIT 5;
   ```

2. For route 1, list the planned departures from its first stop, in Halifax time. Hint: filter `stop_sequence_number = 1` and format `scheduled_departure_ts AT TIME ZONE 'America/Halifax'`.
3. From those departures, work out the gap between buses at 08:00 and at 21:00. Is route 1 "frequent" by the interim rule (every 15 minutes or better)? Write the SQL that answers it with `lag()`.
4. Now compare the plan with what happened: pick one trip from step 2 that has already run today and join it to `silver.stop_arrival` through `silver.event.source_event_key = '<trip_id>|<date>'`.
