-- Empty every table the API reads (scratch database only). Reference data stays.
BEGIN;

TRUNCATE silver.stop_arrival, silver.trip, silver.road_closure, silver.building_permit, silver.service_alert,
         silver.event_asset_involvement, silver.vehicle_position, silver.scheduled_stop_time, silver.scheduled_trip,
         silver.service_calendar_exception, silver.service_calendar, silver.schedule_version, bronze.feed_fetch
         CASCADE;
DELETE FROM silver.event;
DELETE FROM silver.vehicle; DELETE FROM silver.route; DELETE FROM silver.stop;
DELETE FROM silver.asset;
DELETE FROM silver.location;
TRUNCATE silver.asset_hist, silver.location_hist, silver.vehicle_hist, silver.route_hist, silver.stop_hist;

COMMIT;
