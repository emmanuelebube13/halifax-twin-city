# Halifax Digital Twin – Modeling Style by Layer

Step 7 decision · 20 Nov 2026 · Emmanuel Mbachu

**Decision:** Bronze keeps each source exactly as received. Silver is the 3NF model from erwin with SCD Type 2 history. Gold will be Kimball star schemas, one per group of business questions. Data Vault was considered and set aside for now.

## The three layers

| Layer | Style | What it holds | Why this style |
| --- | --- | --- | --- |
| Bronze | Source-shaped (no modeling) | Raw feed files on disk, plus `bronze.feed_fetch`, a register of every download | If a later step has a bug, the raw data is still there to reprocess. Principle 5: each source stays separate. |
| Silver | Third normal form (3NF), an Inmon-style integrated model | The 63 tables of the logical model, conformed across sectors, with history | One shared core (Location, Party, Asset, Event, Time) lets a question cross sectors. 3NF stores each fact once, so a stop renamed in one place is renamed everywhere. |
| Gold | Kimball star schemas (facts and dimensions) | Tables shaped for one group of questions, such as transit reliability | Dashboards, the map and analysts need fast, simple queries. A star schema answers "on-time % by route by hour" with one join per dimension. |

## Why not Data Vault in Silver?

Data Vault (hubs, links, satellites) is built for many sources that change often, strict auditing and parallel loading by large teams. It has real strengths, and banks and insurers use it widely. For this project it would roughly triple the number of tables: a hub, links and at least one satellite per entity. That's a lot to maintain for a one-person project. The two things it would give us are already covered:
- **Audit:** `source_id`, `dw_loaded_ts` and `dw_batch_id` on every row.
- **History:** SCD Type 2 history tables.

**Revisit when:** many partner sources for the same entity arrive and disagree, or a team starts loading in parallel.

## Example: how one question flows through the layers

**TRN-Q02: Which routes are most often late, and at what times of day?**

1. **Bronze:** every 30 seconds the collector saves the Trip Updates feed to a file and logs the fetch in `bronze.feed_fetch`.
2. **Silver:** each arrival becomes a row in `event` and `stop_arrival`, linked to its `trip`, `route` and `stop`. The planned time comes from `scheduled_stop_time` through the trip's scheduled trip.
3. **Gold:** a star schema built for this question:
   - **Fact table** `fact_stop_arrival`: one row per arrival, with the delay in seconds and an on-time flag.
   - **Dimensions:** `dim_date`, `dim_time_of_day`, `dim_route`, `dim_stop` and `dim_weather`.

   "Late by route and hour" then becomes one query across five small dimensions.

## What this means for the work ahead

- Step 9 (physical model) builds Bronze and Silver: done in Physical Model V1.
- Gold is designed one question group at a time, starting with transit reliability (Wave C in the map plan), once a few weeks of feed history exist.
- Step 10 (source-to-target mapping) describes Bronze to Silver. A second mapping, Silver to Gold, comes with the first star schema.
