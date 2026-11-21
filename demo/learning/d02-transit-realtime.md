# D02: live transit into the database

20 Nov 2026 · Task D02 of the demo build

## What was built and why

The old live-buses script only saved bus positions. D02 replaces it with a collector inside the demo (`demo/loaders/transit_realtime/`) that saves all three Halifax Transit realtime feeds into silver, every 30 seconds:

| Feed | Lands in | Answers |
| --- | --- | --- |
| Vehicle positions (SRC-001) | `vehicle_position` | Where is every bus? |
| Trip updates (SRC-002) | `event` + `trip`, `event` + `stop_arrival` | Is it on time? |
| Service alerts (SRC-003) | `event` + `service_alert`, `event_asset_involvement` | What's disrupted, and which routes and stops? |

`demo\start.ps1` now starts it in the background with the app. The old live-buses app on port 8000 is retired.

### Ideas worth knowing

**1. Bronze first, always.** Every download is logged in `bronze.feed_fetch` before anything is parsed, even a failed one. That's what makes `bronze.feed_gap` honest: if the internet drops for 10 minutes, the gap shows. It already caught one: about 10 minutes on 20 Nov between the old collector stopping and the new one starting.

**2. Predictions are not facts.** A trip update lists predicted times for every stop still ahead. Storing those would mean rewriting thousands of rows every 30 seconds, all of them guesses. The collector stores a stop only once its time has passed, and updates it while it's still in the feed. The last value is the arrival.

**3. Supertype and subtype in one transaction.** A trip is a row in `event` (when, where, which source) plus a row in `trip` (route, vehicle, status), sharing one `event_id`. The collector writes both with set-based SQL (`INSERT ... SELECT FROM unnest(...)`), so one cycle of about 270 trips and 300 arrivals is a handful of statements, not hundreds.

**4. Never invent a key.** A trip needs a route, and an arrival needs a stop; both come from the schedule (D03). Until D03 was loaded, the collector counted them as "waiting" instead of making up route rows.

## How to run it

```powershell
powershell -ExecutionPolicy Bypass -File demo\start.ps1
```

On its own:

```powershell
powershell -ExecutionPolicy Bypass -File demo\load.ps1 transit_realtime --once
```

Log: `demo\data\logs\transit_realtime.log`. Raw files: `demo\data\bronze\SRC-001\`, `SRC-002\`, `SRC-003\`.

## Hands-on exercise

Answer TRN-Q01's second half yourself: "is it on time?"

1. In pgAdmin, count today's arrivals by status, using the interim rule from `demo/config/business-rules.yaml` (60 s early to 300 s late):

   ```sql
   SELECT CASE WHEN reported_delay_seconds < -60 THEN 'early'
               WHEN reported_delay_seconds > 300 THEN 'late'
               ELSE 'on time' END AS status,
          count(*)
     FROM silver.stop_arrival sa
     JOIN silver.event e USING (event_id)
    WHERE e.event_date = (now() AT TIME ZONE 'America/Halifax')::date
    GROUP BY 1;
   ```

   On 20 Nov at 20:00 it was 299 on time, 84 late and 77 early (65% on time).
2. Change the query to show the five routes with the most late arrivals. You'll need `silver.trip` (on `sa.trip_event_id = trip.event_id`) and `silver.route`.
3. Stop the collector (close the demo), wait three minutes, start it again, then run:

   ```sql
   SELECT source_id, fetched_ts AT TIME ZONE 'America/Halifax' AS at, gap
     FROM bronze.feed_gap WHERE gap > interval '90 seconds' ORDER BY fetched_ts DESC;
   ```

   Find the hole you just made. That's how Gate 0 (48 hours with no gaps) will be checked.
