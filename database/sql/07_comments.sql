-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 07  Comments (the data dictionary inside the database)
-- Every table and column gets a description, so tools like pgAdmin and DBeaver show the dictionary next to the data.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

COMMENT ON TABLE silver.sector IS 'Sector: One of the 17 city sectors from the Domain Map (S01 to S17).';
COMMENT ON COLUMN silver.sector.sector_id IS 'Sector ID. Domain: Reference Code. S04';
COMMENT ON COLUMN silver.sector.sector_name IS 'Sector Name. Domain: Name.';
COMMENT ON COLUMN silver.sector.sector_description IS 'Sector Description. Domain: Description.';
COMMENT ON COLUMN silver.sector.phase_number IS 'Phase Number. Domain: Count. 1 = Phase 1 sector';
COMMENT ON COLUMN silver.sector.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.sector.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.sector.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.subsector IS 'Subsector: One subsector from the Domain Map, such as TRN-01 Passenger Transportation.';
COMMENT ON COLUMN silver.subsector.subsector_id IS 'Subsector ID. Domain: Reference Code. TRN-01; CORE-00 for shared core data';
COMMENT ON COLUMN silver.subsector.sector_id IS 'Sector ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.subsector.subsector_name IS 'Subsector Name. Domain: Name.';
COMMENT ON COLUMN silver.subsector.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.subsector.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.subsector.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.source IS 'Source: One dataset or feed the twin loads, from the Source Inventory.';
COMMENT ON COLUMN silver.source.source_id IS 'Source ID. Domain: Reference Code. SRC-001';
COMMENT ON COLUMN silver.source.publisher_party_id IS 'Publisher Party ID. Domain: Identifier. Role name of Party ID';
COMMENT ON COLUMN silver.source.dataset_name IS 'Dataset Name. Domain: Name.';
COMMENT ON COLUMN silver.source.source_format_code IS 'Source Format Code. Domain: Code. GTFS, GTFS-RT, ArcGIS REST API, CSV …';
COMMENT ON COLUMN silver.source.access_method_code IS 'Access Method Code. Domain: Code. Live feed, API, File download …';
COMMENT ON COLUMN silver.source.cadence_code IS 'Cadence Code. Domain: Code. Real-time, Daily … Irregular';
COMMENT ON COLUMN silver.source.availability_code IS 'Availability Code. Domain: Code. Open, Mixed, Partner, Private';
COMMENT ON COLUMN silver.source.licence_name IS 'Licence Name. Domain: Name.';
COMMENT ON COLUMN silver.source.attribution_required_flag IS 'Attribution Required Flag. Domain: Flag.';
COMMENT ON COLUMN silver.source.record_grain_description IS 'Record Grain Description. Domain: Description. What one record is';
COMMENT ON COLUMN silver.source.source_url IS 'Source URL. Domain: URL.';
COMMENT ON COLUMN silver.source.reliability_tier_code IS 'Reliability Tier Code. Domain: Code. Tier 1 to Tier 3';
COMMENT ON COLUMN silver.source.source_status_code IS 'Source Status Code. Domain: Code. Verified, Not checked …';
COMMENT ON COLUMN silver.source.last_checked_date IS 'Last Checked Date. Domain: Date.';
COMMENT ON COLUMN silver.source.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.source.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.source.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.calendar_date IS 'Calendar Date: One calendar day, used for the date an event occurs on.';
COMMENT ON COLUMN silver.calendar_date.calendar_date IS 'Calendar Date. Domain: Date.';
COMMENT ON COLUMN silver.calendar_date.calendar_year IS 'Calendar Year. Domain: Year.';
COMMENT ON COLUMN silver.calendar_date.quarter_number IS 'Quarter Number. Domain: Count.';
COMMENT ON COLUMN silver.calendar_date.month_number IS 'Month Number. Domain: Count.';
COMMENT ON COLUMN silver.calendar_date.week_of_year_number IS 'Week Of Year Number. Domain: Count. ISO week';
COMMENT ON COLUMN silver.calendar_date.day_of_week_name IS 'Day Of Week Name. Domain: Name.';
COMMENT ON COLUMN silver.calendar_date.weekend_flag IS 'Weekend Flag. Domain: Flag.';
COMMENT ON COLUMN silver.calendar_date.statutory_holiday_flag IS 'Statutory Holiday Flag. Domain: Flag. Nova Scotia';
COMMENT ON COLUMN silver.calendar_date.holiday_name IS 'Holiday Name. Domain: Name.';
COMMENT ON COLUMN silver.calendar_date.season_name IS 'Season Name. Domain: Name.';
COMMENT ON COLUMN silver.calendar_date.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.calendar_date.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.measure IS 'Measure: Something that is counted or measured, with its unit, such as median household income or E. coli count.';
COMMENT ON COLUMN silver.measure.measure_code IS 'Measure Code. Domain: Reference Code.';
COMMENT ON COLUMN silver.measure.measure_name IS 'Measure Name. Domain: Name.';
COMMENT ON COLUMN silver.measure.unit_of_measure_code IS 'Unit Of Measure Code. Domain: Code. CAD, %, mg/L, count …';
COMMENT ON COLUMN silver.measure.measure_description IS 'Measure Description. Domain: Description.';
COMMENT ON COLUMN silver.measure.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.measure.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.measure.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.location IS 'Location: Any place in the city: a point, line, area, service area or citywide.';
COMMENT ON COLUMN silver.location.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.location.location_type_code IS 'Location Type Code. Domain: Code. Discriminator';
COMMENT ON COLUMN silver.location.location_name IS 'Location Name. Domain: Name.';
COMMENT ON COLUMN silver.location.geometry_type_code IS 'Geometry Type Code. Domain: Code. Point, Line, Polygon, None';
COMMENT ON COLUMN silver.location.location_geometry IS 'Location Geometry. Domain: Geometry. None for Citywide';
COMMENT ON COLUMN silver.location.centroid_latitude IS 'Centroid Latitude. Domain: Latitude.';
COMMENT ON COLUMN silver.location.centroid_longitude IS 'Centroid Longitude. Domain: Longitude.';
COMMENT ON COLUMN silver.location.source_id IS 'Source ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.location.source_location_key IS 'Source Location Key. Domain: Source Key. Key as the source gives it';
COMMENT ON COLUMN silver.location.start_date IS 'Start Date. Domain: Date. Lifecycle: created';
COMMENT ON COLUMN silver.location.end_date IS 'End Date. Domain: Date. Lifecycle: retired';
COMMENT ON COLUMN silver.location.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.location.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.location.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.street IS 'Street: A named street, made up of street segments.';
COMMENT ON COLUMN silver.street.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.street.street_name IS 'Street Name. Domain: Name.';
COMMENT ON COLUMN silver.street.street_type_code IS 'Street Type Code. Domain: Code. St, Ave, Rd …';
COMMENT ON COLUMN silver.street.street_direction_code IS 'Street Direction Code. Domain: Code.';
COMMENT ON COLUMN silver.street.road_jurisdiction_code IS 'Road Jurisdiction Code. Domain: Code. Municipal, Provincial, Private';
COMMENT ON COLUMN silver.street.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.street.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.street.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.street_segment IS 'Street Segment: The stretch of one street between two intersections.';
COMMENT ON COLUMN silver.street_segment.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.street_segment.street_location_id IS 'Street Location ID. Domain: Identifier. Role name: the street';
COMMENT ON COLUMN silver.street_segment.from_intersection_location_id IS 'From Intersection Location ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.street_segment.to_intersection_location_id IS 'To Intersection Location ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.street_segment.segment_length_metres IS 'Segment Length Metres. Domain: Length Metres.';
COMMENT ON COLUMN silver.street_segment.road_class_code IS 'Road Class Code. Domain: Code. Arterial, Collector, Local …';
COMMENT ON COLUMN silver.street_segment.speed_limit_kph IS 'Speed Limit Kph. Domain: Count.';
COMMENT ON COLUMN silver.street_segment.lane_count IS 'Lane Count. Domain: Count.';
COMMENT ON COLUMN silver.street_segment.one_way_flag IS 'One Way Flag. Domain: Flag.';
COMMENT ON COLUMN silver.street_segment.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.street_segment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.street_segment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.intersection IS 'Intersection: A point where two or more street segments meet.';
COMMENT ON COLUMN silver.intersection.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.intersection.intersection_name IS 'Intersection Name. Domain: Name. Barrington St & Spring Garden Rd';
COMMENT ON COLUMN silver.intersection.traffic_control_code IS 'Traffic Control Code. Domain: Code. Signal, Stop, Roundabout, None';
COMMENT ON COLUMN silver.intersection.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.intersection.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.intersection.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.area IS 'Area: A bounded area: neighbourhood, census tract, council district, CMHC zone, snow or waste zone, zoning zone.';
COMMENT ON COLUMN silver.area.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.area.area_type_code IS 'Area Type Code. Domain: Code.';
COMMENT ON COLUMN silver.area.area_code IS 'Area Code. Domain: Code. Official code, e.g. census DGUID';
COMMENT ON COLUMN silver.area.parent_area_location_id IS 'Parent Area Location ID. Domain: Identifier. Recursive; role name';
COMMENT ON COLUMN silver.area.area_square_km IS 'Area Square Km. Domain: Area Square Km.';
COMMENT ON COLUMN silver.area.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.area.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.area.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.civic_address IS 'Civic Address: A civic number on a street, located on one parcel.';
COMMENT ON COLUMN silver.civic_address.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.civic_address.street_location_id IS 'Street Location ID. Domain: Identifier. Role name: the street';
COMMENT ON COLUMN silver.civic_address.parcel_location_id IS 'Parcel Location ID. Domain: Identifier. Role name: the parcel';
COMMENT ON COLUMN silver.civic_address.civic_number IS 'Civic Number. Domain: Count.';
COMMENT ON COLUMN silver.civic_address.civic_number_suffix IS 'Civic Number Suffix. Domain: Code. A, B, ½';
COMMENT ON COLUMN silver.civic_address.postal_code IS 'Postal Code. Domain: Code.';
COMMENT ON COLUMN silver.civic_address.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.civic_address.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.civic_address.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.parcel IS 'Parcel: A legal land parcel, identified by its Nova Scotia PID.';
COMMENT ON COLUMN silver.parcel.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.parcel.parcel_pid IS 'Parcel PID. Domain: Reference Code. Property Identification Number';
COMMENT ON COLUMN silver.parcel.parcel_area_square_metres IS 'Parcel Area Square Metres. Domain: Area Square Metres.';
COMMENT ON COLUMN silver.parcel.land_use_code IS 'Land Use Code. Domain: Code.';
COMMENT ON COLUMN silver.parcel.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.parcel.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.parcel.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.location_containment IS 'Location Containment: One location lying inside or overlapping another, such as a parcel inside a neighbourhood. Resolves the Street Segment–Area and Area–Parcel many-to-many lines.';
COMMENT ON COLUMN silver.location_containment.containing_location_id IS 'Containing Location ID. Domain: Identifier. Role name; usually an Area';
COMMENT ON COLUMN silver.location_containment.contained_location_id IS 'Contained Location ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.location_containment.overlap_percent IS 'Overlap Percent. Domain: Percent. Share of the contained location inside';
COMMENT ON COLUMN silver.location_containment.containment_method_code IS 'Containment Method Code. Domain: Code. Spatial join, Published by source';
COMMENT ON COLUMN silver.location_containment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.location_containment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.party IS 'Party: An organization that owns, operates, publishes or takes part in something. People are reserved for a later phase.';
COMMENT ON COLUMN silver.party.party_id IS 'Party ID. Domain: Identifier.';
COMMENT ON COLUMN silver.party.party_type_code IS 'Party Type Code. Domain: Code. Discriminator: Organization (Person reserved)';
COMMENT ON COLUMN silver.party.party_name IS 'Party Name. Domain: Name.';
COMMENT ON COLUMN silver.party.source_id IS 'Source ID. Domain: Reference Code. Optional: avoids a loop with Source';
COMMENT ON COLUMN silver.party.source_party_key IS 'Source Party Key. Domain: Source Key.';
COMMENT ON COLUMN silver.party.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.party.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.party.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.organization IS 'Organization: A government body, agency, utility, company or non-profit.';
COMMENT ON COLUMN silver.organization.party_id IS 'Party ID. Domain: Identifier.';
COMMENT ON COLUMN silver.organization.organization_type_code IS 'Organization Type Code. Domain: Code.';
COMMENT ON COLUMN silver.organization.legal_name IS 'Legal Name. Domain: Name.';
COMMENT ON COLUMN silver.organization.business_number IS 'Business Number. Domain: Reference Code. CRA business number';
COMMENT ON COLUMN silver.organization.website_url IS 'Website URL. Domain: URL.';
COMMENT ON COLUMN silver.organization.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.organization.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.organization.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.party_sector_classification IS 'Party Sector Classification: The subsectors a party works in. Replaces Sector classifies Party.';
COMMENT ON COLUMN silver.party_sector_classification.party_id IS 'Party ID. Domain: Identifier.';
COMMENT ON COLUMN silver.party_sector_classification.subsector_id IS 'Subsector ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.party_sector_classification.primary_classification_flag IS 'Primary Classification Flag. Domain: Flag.';
COMMENT ON COLUMN silver.party_sector_classification.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.party_sector_classification.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.asset IS 'Asset: A physical thing the city depends on: route, stop, vehicle, road asset, facility, building, dwelling unit.';
COMMENT ON COLUMN silver.asset.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.asset.asset_type_code IS 'Asset Type Code. Domain: Code. Discriminator';
COMMENT ON COLUMN silver.asset.asset_name IS 'Asset Name. Domain: Name.';
COMMENT ON COLUMN silver.asset.location_id IS 'Location ID. Domain: Identifier. Located at; empty for vehicles';
COMMENT ON COLUMN silver.asset.subsector_id IS 'Subsector ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.asset.source_id IS 'Source ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.asset.source_asset_key IS 'Source Asset Key. Domain: Source Key. e.g. GTFS route_id, stop_id';
COMMENT ON COLUMN silver.asset.asset_status_code IS 'Asset Status Code. Domain: Code. Active, Planned, Retired';
COMMENT ON COLUMN silver.asset.in_service_date IS 'In Service Date. Domain: Date.';
COMMENT ON COLUMN silver.asset.out_of_service_date IS 'Out Of Service Date. Domain: Date.';
COMMENT ON COLUMN silver.asset.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.asset.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.asset.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.party_asset_role IS 'Party Asset Role: A party owning, operating or maintaining an asset for a period. Replaces Party owns/operates Asset.';
COMMENT ON COLUMN silver.party_asset_role.party_id IS 'Party ID. Domain: Identifier.';
COMMENT ON COLUMN silver.party_asset_role.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.party_asset_role.asset_role_code IS 'Asset Role Code. Domain: Code. Owner, Operator, Maintainer';
COMMENT ON COLUMN silver.party_asset_role.role_start_date IS 'Role Start Date. Domain: Date.';
COMMENT ON COLUMN silver.party_asset_role.role_end_date IS 'Role End Date. Domain: Date.';
COMMENT ON COLUMN silver.party_asset_role.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.party_asset_role.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.event IS 'Event: Something that happens at a place and time and is reported by a source: a trip, a repair, a sale, a reading.';
COMMENT ON COLUMN silver.event.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event.event_type_code IS 'Event Type Code. Domain: Code. Discriminator';
COMMENT ON COLUMN silver.event.event_start_ts IS 'Event Start Timestamp. Domain: Timestamp. UTC';
COMMENT ON COLUMN silver.event.event_end_ts IS 'Event End Timestamp. Domain: Timestamp. UTC';
COMMENT ON COLUMN silver.event.event_date IS 'Event Date. Domain: Date. Role name of Calendar Date; occurs on';
COMMENT ON COLUMN silver.event.location_id IS 'Location ID. Domain: Identifier. Occurs at; see the location rules';
COMMENT ON COLUMN silver.event.subsector_id IS 'Subsector ID. Domain: Reference Code.';
COMMENT ON COLUMN silver.event.source_id IS 'Source ID. Domain: Reference Code. Reported by';
COMMENT ON COLUMN silver.event.source_event_key IS 'Source Event Key. Domain: Source Key. Permit no., request no. …';
COMMENT ON COLUMN silver.event.event_status_code IS 'Event Status Code. Domain: Code.';
COMMENT ON COLUMN silver.event.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.event.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.event_asset_involvement IS 'Event Asset Involvement: An asset taking part in an event in a named role, such as a route affected by a service alert. Replaces Event involves Asset and Service Alert affects Route/Stop.';
COMMENT ON COLUMN silver.event_asset_involvement.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_asset_involvement.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_asset_involvement.involvement_role_code IS 'Involvement Role Code. Domain: Code. Affected, Measured, Used …';
COMMENT ON COLUMN silver.event_asset_involvement.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.event_asset_involvement.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.event_party_involvement IS 'Event Party Involvement: A party taking part in an event in a named role, such as the contractor on a work order. Replaces Event involves Party.';
COMMENT ON COLUMN silver.event_party_involvement.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_party_involvement.party_id IS 'Party ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_party_involvement.involvement_role_code IS 'Involvement Role Code. Domain: Code. Reporter, Responsible, Contractor, Applicant';
COMMENT ON COLUMN silver.event_party_involvement.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.event_party_involvement.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.event_coverage IS 'Event Coverage: Extra locations an event covers beyond its main one, such as every street segment in a road closure. Replaces Road Closure on Street Segment, Utility Outage affects Area, Public Advisory covers Area.';
COMMENT ON COLUMN silver.event_coverage.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_coverage.location_id IS 'Location ID. Domain: Identifier.';
COMMENT ON COLUMN silver.event_coverage.coverage_role_code IS 'Coverage Role Code. Domain: Code. Affected, Closed, Detour';
COMMENT ON COLUMN silver.event_coverage.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.event_coverage.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.weather_observation IS 'Weather Observation: Weather recorded for an area over one hour or one day.';
COMMENT ON COLUMN silver.weather_observation.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.weather_observation.observation_interval_code IS 'Observation Interval Code. Domain: Code. Hourly, Daily';
COMMENT ON COLUMN silver.weather_observation.air_temperature_celsius IS 'Air Temperature Celsius. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.precipitation_mm IS 'Precipitation Mm. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.snowfall_cm IS 'Snowfall Cm. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.snow_on_ground_cm IS 'Snow On Ground Cm. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.mean_wind_speed_kph IS 'Mean Wind Speed Kph. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.max_gust_kph IS 'Max Gust Kph. Domain: Measure Value.';
COMMENT ON COLUMN silver.weather_observation.weather_condition_code IS 'Weather Condition Code. Domain: Code.';
COMMENT ON COLUMN silver.weather_observation.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.weather_observation.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.area_statistic IS 'Area Statistic: One published statistic for one area and period, such as population of a census tract in 2021.';
COMMENT ON COLUMN silver.area_statistic.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.area_statistic.measure_code IS 'Measure Code. Domain: Reference Code.';
COMMENT ON COLUMN silver.area_statistic.statistic_value IS 'Statistic Value. Domain: Measure Value.';
COMMENT ON COLUMN silver.area_statistic.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.area_statistic.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.economic_indicator IS 'Economic Indicator: One value of an economic series for a period, such as the Bank of Canada policy rate.';
COMMENT ON COLUMN silver.economic_indicator.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.economic_indicator.measure_code IS 'Measure Code. Domain: Reference Code.';
COMMENT ON COLUMN silver.economic_indicator.indicator_value IS 'Indicator Value. Domain: Measure Value.';
COMMENT ON COLUMN silver.economic_indicator.period_type_code IS 'Period Type Code. Domain: Code. Monthly, Quarterly, Annual';
COMMENT ON COLUMN silver.economic_indicator.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.economic_indicator.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.schedule_version IS 'Schedule Version: One published GTFS schedule file. Every version is kept to judge past trips.';
COMMENT ON COLUMN silver.schedule_version.schedule_version_id IS 'Schedule Version ID. Domain: Identifier.';
COMMENT ON COLUMN silver.schedule_version.source_id IS 'Source ID. Domain: Reference Code. SRC-004';
COMMENT ON COLUMN silver.schedule_version.feed_version_label IS 'Feed Version Label. Domain: Name. feed_info.feed_version';
COMMENT ON COLUMN silver.schedule_version.feed_published_date IS 'Feed Published Date. Domain: Date.';
COMMENT ON COLUMN silver.schedule_version.service_period_start_date IS 'Service Period Start Date. Domain: Date.';
COMMENT ON COLUMN silver.schedule_version.service_period_end_date IS 'Service Period End Date. Domain: Date.';
COMMENT ON COLUMN silver.schedule_version.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.schedule_version.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.service_calendar IS 'Service Calendar: A GTFS service pattern: the weekdays a set of trips runs within a version (calendar.txt).';
COMMENT ON COLUMN silver.service_calendar.schedule_version_id IS 'Schedule Version ID. Domain: Identifier.';
COMMENT ON COLUMN silver.service_calendar.service_code IS 'Service Code. Domain: Source Key. GTFS service_id';
COMMENT ON COLUMN silver.service_calendar.monday_flag IS 'Monday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.tuesday_flag IS 'Tuesday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.wednesday_flag IS 'Wednesday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.thursday_flag IS 'Thursday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.friday_flag IS 'Friday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.saturday_flag IS 'Saturday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.sunday_flag IS 'Sunday Flag. Domain: Flag.';
COMMENT ON COLUMN silver.service_calendar.start_date IS 'Start Date. Domain: Date.';
COMMENT ON COLUMN silver.service_calendar.end_date IS 'End Date. Domain: Date.';
COMMENT ON COLUMN silver.service_calendar.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.service_calendar.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.service_calendar_exception IS 'Service Calendar Exception: A date a service pattern is added or removed, such as a holiday (calendar_dates.txt).';
COMMENT ON COLUMN silver.service_calendar_exception.schedule_version_id IS 'Schedule Version ID. Domain: Identifier.';
COMMENT ON COLUMN silver.service_calendar_exception.service_code IS 'Service Code. Domain: Source Key.';
COMMENT ON COLUMN silver.service_calendar_exception.exception_date IS 'Exception Date. Domain: Date. Role name of Calendar Date';
COMMENT ON COLUMN silver.service_calendar_exception.exception_type_code IS 'Exception Type Code. Domain: Code. Added, Removed';
COMMENT ON COLUMN silver.service_calendar_exception.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.service_calendar_exception.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.route IS 'Route: A public bus or ferry route.';
COMMENT ON COLUMN silver.route.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.route.route_short_name IS 'Route Short Name. Domain: Name. 1, 9A, Alderney Ferry';
COMMENT ON COLUMN silver.route.route_long_name IS 'Route Long Name. Domain: Name.';
COMMENT ON COLUMN silver.route.route_mode_code IS 'Route Mode Code. Domain: Code. Bus, Ferry';
COMMENT ON COLUMN silver.route.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.route.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.route.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.stop IS 'Stop: A bus stop, ferry terminal or station where riders board.';
COMMENT ON COLUMN silver.stop.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.stop.stop_code IS 'Stop Code. Domain: Reference Code. Public stop number';
COMMENT ON COLUMN silver.stop.stop_name IS 'Stop Name. Domain: Name.';
COMMENT ON COLUMN silver.stop.stop_kind_code IS 'Stop Kind Code. Domain: Code. Stop, Station, Ferry terminal';
COMMENT ON COLUMN silver.stop.parent_stop_asset_id IS 'Parent Stop Asset ID. Domain: Identifier. Recursive; role name';
COMMENT ON COLUMN silver.stop.wheelchair_boarding_code IS 'Wheelchair Boarding Code. Domain: Code.';
COMMENT ON COLUMN silver.stop.shelter_flag IS 'Shelter Flag. Domain: Flag. From Transit Shelters layer';
COMMENT ON COLUMN silver.stop.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.stop.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.stop.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.vehicle IS 'Vehicle: A bus or ferry in the transit fleet.';
COMMENT ON COLUMN silver.vehicle.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.vehicle.vehicle_label IS 'Vehicle Label. Domain: Name. Fleet number';
COMMENT ON COLUMN silver.vehicle.vehicle_mode_code IS 'Vehicle Mode Code. Domain: Code. Bus, Ferry';
COMMENT ON COLUMN silver.vehicle.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.vehicle.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.vehicle.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.route_segment IS 'Route Segment: The path between two consecutive stops, shared by every route that uses it.';
COMMENT ON COLUMN silver.route_segment.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.route_segment.from_stop_asset_id IS 'From Stop Asset ID. Domain: Identifier. Starts at; role name';
COMMENT ON COLUMN silver.route_segment.to_stop_asset_id IS 'To Stop Asset ID. Domain: Identifier. Ends at; role name';
COMMENT ON COLUMN silver.route_segment.segment_length_metres IS 'Segment Length Metres. Domain: Length Metres.';
COMMENT ON COLUMN silver.route_segment.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.route_segment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.route_segment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.route_segment_sequence IS 'Route Segment Sequence: The ordered segments a route runs through in one direction, per schedule version. Resolves Route made of Route Segment.';
COMMENT ON COLUMN silver.route_segment_sequence.schedule_version_id IS 'Schedule Version ID. Domain: Identifier.';
COMMENT ON COLUMN silver.route_segment_sequence.route_asset_id IS 'Route Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.route_segment_sequence.direction_code IS 'Direction Code. Domain: Code. 0, 1';
COMMENT ON COLUMN silver.route_segment_sequence.segment_sequence_number IS 'Segment Sequence Number. Domain: Count.';
COMMENT ON COLUMN silver.route_segment_sequence.route_segment_asset_id IS 'Route Segment Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.route_segment_sequence.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.route_segment_sequence.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.route_segment_street_segment IS 'Route Segment Street Segment: The street segments a route segment runs along, in order. Resolves Route Segment runs along Street Segment.';
COMMENT ON COLUMN silver.route_segment_street_segment.route_segment_asset_id IS 'Route Segment Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.route_segment_street_segment.street_segment_location_id IS 'Street Segment Location ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.route_segment_street_segment.path_sequence_number IS 'Path Sequence Number. Domain: Count.';
COMMENT ON COLUMN silver.route_segment_street_segment.overlap_length_metres IS 'Overlap Length Metres. Domain: Length Metres.';
COMMENT ON COLUMN silver.route_segment_street_segment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.route_segment_street_segment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.scheduled_trip IS 'Scheduled Trip: One trip as planned in a schedule version (GTFS trips.txt). It repeats on every day its service runs.';
COMMENT ON COLUMN silver.scheduled_trip.scheduled_trip_id IS 'Scheduled Trip ID. Domain: Identifier.';
COMMENT ON COLUMN silver.scheduled_trip.schedule_version_id IS 'Schedule Version ID. Domain: Identifier. Part of the FK to Service Calendar';
COMMENT ON COLUMN silver.scheduled_trip.service_code IS 'Service Code. Domain: Source Key. Part of the FK to Service Calendar';
COMMENT ON COLUMN silver.scheduled_trip.source_trip_key IS 'Source Trip Key. Domain: Source Key. GTFS trip_id';
COMMENT ON COLUMN silver.scheduled_trip.route_asset_id IS 'Route Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.scheduled_trip.direction_code IS 'Direction Code. Domain: Code. 0, 1';
COMMENT ON COLUMN silver.scheduled_trip.trip_headsign IS 'Trip Headsign. Domain: Name.';
COMMENT ON COLUMN silver.scheduled_trip.block_code IS 'Block Code. Domain: Source Key. Vehicle duty';
COMMENT ON COLUMN silver.scheduled_trip.shape_key IS 'Shape Key. Domain: Source Key. GTFS shape_id';
COMMENT ON COLUMN silver.scheduled_trip.wheelchair_accessible_code IS 'Wheelchair Accessible Code. Domain: Code.';
COMMENT ON COLUMN silver.scheduled_trip.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.scheduled_trip.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.scheduled_stop_time IS 'Scheduled Stop Time: When a scheduled trip is planned to reach one stop (GTFS stop_times.txt).';
COMMENT ON COLUMN silver.scheduled_stop_time.scheduled_trip_id IS 'Scheduled Trip ID. Domain: Identifier.';
COMMENT ON COLUMN silver.scheduled_stop_time.stop_sequence_number IS 'Stop Sequence Number. Domain: Count.';
COMMENT ON COLUMN silver.scheduled_stop_time.stop_asset_id IS 'Stop Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.scheduled_stop_time.scheduled_arrival_time IS 'Scheduled Arrival Time. Domain: Service Day Time. Can pass 24:00:00';
COMMENT ON COLUMN silver.scheduled_stop_time.scheduled_departure_time IS 'Scheduled Departure Time. Domain: Service Day Time.';
COMMENT ON COLUMN silver.scheduled_stop_time.timepoint_flag IS 'Timepoint Flag. Domain: Flag.';
COMMENT ON COLUMN silver.scheduled_stop_time.pickup_type_code IS 'Pickup Type Code. Domain: Code.';
COMMENT ON COLUMN silver.scheduled_stop_time.drop_off_type_code IS 'Drop Off Type Code. Domain: Code.';
COMMENT ON COLUMN silver.scheduled_stop_time.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.scheduled_stop_time.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.trip IS 'Trip: One run of a trip on one service date, whether it ran, was cancelled or was added.';
COMMENT ON COLUMN silver.trip.event_id IS 'Event ID. Domain: Identifier. Event Date = service date';
COMMENT ON COLUMN silver.trip.scheduled_trip_id IS 'Scheduled Trip ID. Domain: Identifier. Empty for added trips';
COMMENT ON COLUMN silver.trip.route_asset_id IS 'Route Asset ID. Domain: Identifier. Role name; must match the scheduled trip''s route';
COMMENT ON COLUMN silver.trip.vehicle_asset_id IS 'Vehicle Asset ID. Domain: Identifier. Operates; role name';
COMMENT ON COLUMN silver.trip.trip_schedule_status_code IS 'Trip Schedule Status Code. Domain: Code. Scheduled, Added, Cancelled';
COMMENT ON COLUMN silver.trip.actual_start_ts IS 'Actual Start Timestamp. Domain: Timestamp. Event Start = planned start';
COMMENT ON COLUMN silver.trip.actual_end_ts IS 'Actual End Timestamp. Domain: Timestamp.';
COMMENT ON COLUMN silver.trip.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.trip.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.stop_arrival IS 'Stop Arrival: A trip actually reaching a stop on one service date.';
COMMENT ON COLUMN silver.stop_arrival.event_id IS 'Event ID. Domain: Identifier. Event Start = actual arrival';
COMMENT ON COLUMN silver.stop_arrival.trip_event_id IS 'Trip Event ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.stop_arrival.stop_sequence_number IS 'Stop Sequence Number. Domain: Count.';
COMMENT ON COLUMN silver.stop_arrival.stop_asset_id IS 'Stop Asset ID. Domain: Identifier. Role name';
COMMENT ON COLUMN silver.stop_arrival.actual_departure_ts IS 'Actual Departure Timestamp. Domain: Timestamp.';
COMMENT ON COLUMN silver.stop_arrival.reported_delay_seconds IS 'Reported Delay Seconds. Domain: Count. As the feed reports it; signed';
COMMENT ON COLUMN silver.stop_arrival.arrival_observation_method_code IS 'Arrival Observation Method Code. Domain: Code. Reported, Inferred from positions';
COMMENT ON COLUMN silver.stop_arrival.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.stop_arrival.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.vehicle_position IS 'Vehicle Position: Where one vehicle was at one moment (GTFS-RT).';
COMMENT ON COLUMN silver.vehicle_position.vehicle_asset_id IS 'Vehicle that reported the position (logical: Vehicle Asset ID).';
COMMENT ON COLUMN silver.vehicle_position.position_ts IS 'When the position was recorded, UTC (logical: Event Start Timestamp).';
COMMENT ON COLUMN silver.vehicle_position.trip_event_id IS 'Trip being run, empty when not in service (logical: Trip Event ID).';
COMMENT ON COLUMN silver.vehicle_position.source_id IS 'Feed the position came from (logical: Event.Source ID).';
COMMENT ON COLUMN silver.vehicle_position.position_latitude IS 'Position Latitude. Domain: Latitude.';
COMMENT ON COLUMN silver.vehicle_position.position_longitude IS 'Position Longitude. Domain: Longitude.';
COMMENT ON COLUMN silver.vehicle_position.bearing_degrees IS 'Bearing Degrees. Domain: Measure Value.';
COMMENT ON COLUMN silver.vehicle_position.speed_metres_per_second IS 'Speed Metres Per Second. Domain: Measure Value.';
COMMENT ON COLUMN silver.vehicle_position.current_stop_sequence_number IS 'Current Stop Sequence Number. Domain: Count.';
COMMENT ON COLUMN silver.vehicle_position.vehicle_stop_status_code IS 'Vehicle Stop Status Code. Domain: Code. Incoming, Stopped, In transit';
COMMENT ON COLUMN silver.vehicle_position.occupancy_status_code IS 'Occupancy Status Code. Domain: Code.';

COMMENT ON TABLE silver.service_alert IS 'Service Alert: A published detour, stop closure or service change (GTFS-RT).';
COMMENT ON COLUMN silver.service_alert.event_id IS 'Event ID. Domain: Identifier. Start/End = active period';
COMMENT ON COLUMN silver.service_alert.alert_cause_code IS 'Alert Cause Code. Domain: Code.';
COMMENT ON COLUMN silver.service_alert.alert_effect_code IS 'Alert Effect Code. Domain: Code. Detour, No service, Stop moved …';
COMMENT ON COLUMN silver.service_alert.alert_header_text IS 'Alert Header Text. Domain: Text.';
COMMENT ON COLUMN silver.service_alert.alert_description_text IS 'Alert Description Text. Domain: Long Text.';
COMMENT ON COLUMN silver.service_alert.alert_url IS 'Alert URL. Domain: URL.';
COMMENT ON COLUMN silver.service_alert.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.service_alert.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.collision IS 'Collision: One reported traffic collision.';
COMMENT ON COLUMN silver.collision.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.collision.collision_severity_code IS 'Collision Severity Code. Domain: Code. Fatal, Injury, Property damage';
COMMENT ON COLUMN silver.collision.vehicle_count IS 'Vehicle Count. Domain: Count.';
COMMENT ON COLUMN silver.collision.pedestrian_involved_flag IS 'Pedestrian Involved Flag. Domain: Flag.';
COMMENT ON COLUMN silver.collision.bicycle_involved_flag IS 'Bicycle Involved Flag. Domain: Flag.';
COMMENT ON COLUMN silver.collision.road_surface_condition_code IS 'Road Surface Condition Code. Domain: Code.';
COMMENT ON COLUMN silver.collision.light_condition_code IS 'Light Condition Code. Domain: Code.';
COMMENT ON COLUMN silver.collision.weather_condition_code IS 'Weather Condition Code. Domain: Code.';
COMMENT ON COLUMN silver.collision.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.collision.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.traffic_count IS 'Traffic Count: One traffic or bicycle count at one location over a study period.';
COMMENT ON COLUMN silver.traffic_count.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.traffic_count.count_type_code IS 'Count Type Code. Domain: Code. Volume, Turning movement, Speed, Classification, Bicycle';
COMMENT ON COLUMN silver.traffic_count.count_direction_code IS 'Count Direction Code. Domain: Code.';
COMMENT ON COLUMN silver.traffic_count.total_volume_count IS 'Total Volume Count. Domain: Count.';
COMMENT ON COLUMN silver.traffic_count.aadt_count IS 'AADT Count. Domain: Count. Annual average daily traffic';
COMMENT ON COLUMN silver.traffic_count.aawt_count IS 'AAWT Count. Domain: Count. Annual average weekday traffic';
COMMENT ON COLUMN silver.traffic_count.speed_85th_percentile_kph IS 'Speed 85th Percentile Kph. Domain: Measure Value.';
COMMENT ON COLUMN silver.traffic_count.heavy_vehicle_percent IS 'Heavy Vehicle Percent. Domain: Percent.';
COMMENT ON COLUMN silver.traffic_count.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.traffic_count.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.infrastructure_asset IS 'Infrastructure Asset: A piece of public infrastructure: road surface, sidewalk, streetlight, sign, hydrant, pipe, tree, park amenity, sampling point.';
COMMENT ON COLUMN silver.infrastructure_asset.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.infrastructure_asset.infrastructure_class_code IS 'Infrastructure Class Code. Domain: Code.';
COMMENT ON COLUMN silver.infrastructure_asset.material_code IS 'Material Code. Domain: Code.';
COMMENT ON COLUMN silver.infrastructure_asset.condition_rating_code IS 'Condition Rating Code. Domain: Code. As last reported';
COMMENT ON COLUMN silver.infrastructure_asset.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.infrastructure_asset.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.infrastructure_asset.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.facility IS 'Facility: A building or site the city runs: depot, waste facility, treatment plant, terminal, recreation centre.';
COMMENT ON COLUMN silver.facility.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.facility.facility_type_code IS 'Facility Type Code. Domain: Code.';
COMMENT ON COLUMN silver.facility.capacity_quantity IS 'Capacity Quantity. Domain: Measure Value.';
COMMENT ON COLUMN silver.facility.capacity_unit_code IS 'Capacity Unit Code. Domain: Code.';
COMMENT ON COLUMN silver.facility.public_access_flag IS 'Public Access Flag. Domain: Flag.';
COMMENT ON COLUMN silver.facility.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.facility.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.facility.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.service_request IS 'Service Request: A 311 request from the public. Event End = closed.';
COMMENT ON COLUMN silver.service_request.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.service_request.request_type_code IS 'Request Type Code. Domain: Code.';
COMMENT ON COLUMN silver.service_request.request_category_code IS 'Request Category Code. Domain: Code.';
COMMENT ON COLUMN silver.service_request.request_channel_code IS 'Request Channel Code. Domain: Code. Phone, Web, App';
COMMENT ON COLUMN silver.service_request.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.service_request.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.work_order IS 'Work Order: A job to inspect, repair or maintain an infrastructure asset.';
COMMENT ON COLUMN silver.work_order.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.work_order.service_request_event_id IS 'Service Request Event ID. Domain: Identifier. Results in; role name';
COMMENT ON COLUMN silver.work_order.capital_project_event_id IS 'Capital Project Event ID. Domain: Identifier. Includes; role name';
COMMENT ON COLUMN silver.work_order.infrastructure_asset_id IS 'Infrastructure Asset ID. Domain: Identifier. Repairs; role name';
COMMENT ON COLUMN silver.work_order.work_type_code IS 'Work Type Code. Domain: Code.';
COMMENT ON COLUMN silver.work_order.work_priority_code IS 'Work Priority Code. Domain: Code.';
COMMENT ON COLUMN silver.work_order.planned_date IS 'Planned Date. Domain: Date.';
COMMENT ON COLUMN silver.work_order.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.work_order.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.capital_project IS 'Capital Project: A funded construction or renewal project. Event Start/End = actual dates.';
COMMENT ON COLUMN silver.capital_project.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.capital_project.project_name IS 'Project Name. Domain: Name.';
COMMENT ON COLUMN silver.capital_project.capital_project_type_code IS 'Capital Project Type Code. Domain: Code.';
COMMENT ON COLUMN silver.capital_project.budget_amount IS 'Budget Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.capital_project.actual_cost_amount IS 'Actual Cost Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.capital_project.planned_start_date IS 'Planned Start Date. Domain: Date.';
COMMENT ON COLUMN silver.capital_project.planned_end_date IS 'Planned End Date. Domain: Date.';
COMMENT ON COLUMN silver.capital_project.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.capital_project.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.road_closure IS 'Road Closure: A full or partial closure of streets for a period. Closed segments are in Event Coverage.';
COMMENT ON COLUMN silver.road_closure.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.road_closure.capital_project_event_id IS 'Capital Project Event ID. Domain: Identifier. Causes; role name';
COMMENT ON COLUMN silver.road_closure.development_project_event_id IS 'Development Project Event ID. Domain: Identifier. Causes; role name (new)';
COMMENT ON COLUMN silver.road_closure.closure_type_code IS 'Closure Type Code. Domain: Code. Full, Partial, Lane, Sidewalk';
COMMENT ON COLUMN silver.road_closure.closure_reason_code IS 'Closure Reason Code. Domain: Code.';
COMMENT ON COLUMN silver.road_closure.detour_description IS 'Detour Description. Domain: Description.';
COMMENT ON COLUMN silver.road_closure.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.road_closure.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.snow_clearing IS 'Snow Clearing: One plowing, salting or sidewalk-clearing pass on a street segment.';
COMMENT ON COLUMN silver.snow_clearing.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.snow_clearing.clearing_activity_code IS 'Clearing Activity Code. Domain: Code. Plow, Salt, Sand, Sidewalk';
COMMENT ON COLUMN silver.snow_clearing.clearing_priority_code IS 'Clearing Priority Code. Domain: Code.';
COMMENT ON COLUMN silver.snow_clearing.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.snow_clearing.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.pavement_condition_assessment IS 'Pavement Condition Assessment: A rating of one street segment''s pavement.';
COMMENT ON COLUMN silver.pavement_condition_assessment.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.pavement_condition_assessment.pavement_condition_index IS 'Pavement Condition Index. Domain: Measure Value. 0 to 100';
COMMENT ON COLUMN silver.pavement_condition_assessment.condition_rating_code IS 'Condition Rating Code. Domain: Code.';
COMMENT ON COLUMN silver.pavement_condition_assessment.assessment_method_code IS 'Assessment Method Code. Domain: Code.';
COMMENT ON COLUMN silver.pavement_condition_assessment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.pavement_condition_assessment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.waste_collection IS 'Waste Collection: One scheduled garbage, recycling or organics pickup at a civic address.';
COMMENT ON COLUMN silver.waste_collection.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.waste_collection.waste_stream_code IS 'Waste Stream Code. Domain: Code. Garbage, Recycling, Organics';
COMMENT ON COLUMN silver.waste_collection.scheduled_collection_date IS 'Scheduled Collection Date. Domain: Date. Role name of Calendar Date';
COMMENT ON COLUMN silver.waste_collection.collection_outcome_code IS 'Collection Outcome Code. Domain: Code. Collected, Missed, Late';
COMMENT ON COLUMN silver.waste_collection.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.waste_collection.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.waste_tonnage_record IS 'Waste Tonnage Record: Tonnes of one waste stream received at a facility in a period.';
COMMENT ON COLUMN silver.waste_tonnage_record.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.waste_tonnage_record.facility_asset_id IS 'Facility Asset ID. Domain: Identifier. Recorded at; role name';
COMMENT ON COLUMN silver.waste_tonnage_record.waste_stream_code IS 'Waste Stream Code. Domain: Code.';
COMMENT ON COLUMN silver.waste_tonnage_record.disposal_destination_code IS 'Disposal Destination Code. Domain: Code. Landfill, Recycling, Compost';
COMMENT ON COLUMN silver.waste_tonnage_record.tonnage_quantity IS 'Tonnage Quantity. Domain: Measure Value. Tonnes';
COMMENT ON COLUMN silver.waste_tonnage_record.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.waste_tonnage_record.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.water_quality_reading IS 'Water Quality Reading: One lab or sensor reading of one water quality measure at a sampling point.';
COMMENT ON COLUMN silver.water_quality_reading.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.water_quality_reading.infrastructure_asset_id IS 'Infrastructure Asset ID. Domain: Identifier. Sampled at; role name';
COMMENT ON COLUMN silver.water_quality_reading.measure_code IS 'Measure Code. Domain: Reference Code.';
COMMENT ON COLUMN silver.water_quality_reading.reading_value IS 'Reading Value. Domain: Measure Value.';
COMMENT ON COLUMN silver.water_quality_reading.exceedance_flag IS 'Exceedance Flag. Domain: Flag. Above guideline';
COMMENT ON COLUMN silver.water_quality_reading.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.water_quality_reading.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.utility_outage IS 'Utility Outage: A loss of electricity, water or wastewater service. Affected areas are in Event Coverage.';
COMMENT ON COLUMN silver.utility_outage.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.utility_outage.utility_type_code IS 'Utility Type Code. Domain: Code. Electricity, Water, Wastewater, Gas';
COMMENT ON COLUMN silver.utility_outage.customers_affected_count IS 'Customers Affected Count. Domain: Count.';
COMMENT ON COLUMN silver.utility_outage.outage_cause_code IS 'Outage Cause Code. Domain: Code.';
COMMENT ON COLUMN silver.utility_outage.estimated_restoration_ts IS 'Estimated Restoration Timestamp. Domain: Timestamp.';
COMMENT ON COLUMN silver.utility_outage.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.utility_outage.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.public_advisory IS 'Public Advisory: A public notice such as a boil-water advisory or winter parking ban. Covered areas are in Event Coverage.';
COMMENT ON COLUMN silver.public_advisory.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.public_advisory.advisory_type_code IS 'Advisory Type Code. Domain: Code.';
COMMENT ON COLUMN silver.public_advisory.advisory_severity_code IS 'Advisory Severity Code. Domain: Code.';
COMMENT ON COLUMN silver.public_advisory.advisory_text IS 'Advisory Text. Domain: Long Text.';
COMMENT ON COLUMN silver.public_advisory.advisory_url IS 'Advisory URL. Domain: URL.';
COMMENT ON COLUMN silver.public_advisory.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.public_advisory.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.building IS 'Building: A structure on a parcel. Its Asset Location is the parcel it sits on.';
COMMENT ON COLUMN silver.building.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.building.building_use_code IS 'Building Use Code. Domain: Code. Residential, Commercial, Mixed …';
COMMENT ON COLUMN silver.building.building_type_code IS 'Building Type Code. Domain: Code. Detached, Row, Apartment …';
COMMENT ON COLUMN silver.building.year_built IS 'Year Built. Domain: Year.';
COMMENT ON COLUMN silver.building.storey_count IS 'Storey Count. Domain: Count.';
COMMENT ON COLUMN silver.building.gross_floor_area_square_metres IS 'Gross Floor Area Square Metres. Domain: Area Square Metres.';
COMMENT ON COLUMN silver.building.reported_unit_count IS 'Reported Unit Count. Domain: Count. As the source states it';
COMMENT ON COLUMN silver.building.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.building.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.building.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.dwelling_unit IS 'Dwelling Unit: One home inside a building: a house, apartment or suite.';
COMMENT ON COLUMN silver.dwelling_unit.asset_id IS 'Asset ID. Domain: Identifier.';
COMMENT ON COLUMN silver.dwelling_unit.building_asset_id IS 'Building Asset ID. Domain: Identifier. Contains; role name';
COMMENT ON COLUMN silver.dwelling_unit.unit_number IS 'Unit Number. Domain: Reference Code.';
COMMENT ON COLUMN silver.dwelling_unit.dwelling_type_code IS 'Dwelling Type Code. Domain: Code.';
COMMENT ON COLUMN silver.dwelling_unit.bedroom_count IS 'Bedroom Count. Domain: Count.';
COMMENT ON COLUMN silver.dwelling_unit.tenure_code IS 'Tenure Code. Domain: Code. Owner, Rental, Social, Student';
COMMENT ON COLUMN silver.dwelling_unit.floor_area_square_metres IS 'Floor Area Square Metres. Domain: Area Square Metres.';
COMMENT ON COLUMN silver.dwelling_unit.valid_from_ts IS 'SCD2: when this version of the row became current.';
COMMENT ON COLUMN silver.dwelling_unit.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.dwelling_unit.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.property_sale IS 'Property Sale: A recorded sale of a parcel. Buyer and seller are not kept.';
COMMENT ON COLUMN silver.property_sale.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.property_sale.sale_price_amount IS 'Sale Price Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.property_sale.sale_type_code IS 'Sale Type Code. Domain: Code. Arm''s length, Non arm''s length';
COMMENT ON COLUMN silver.property_sale.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.property_sale.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.property_assessment IS 'Property Assessment: The PVSC assessed value of a property for one assessment year.';
COMMENT ON COLUMN silver.property_assessment.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.property_assessment.assessment_year IS 'Assessment Year. Domain: Year.';
COMMENT ON COLUMN silver.property_assessment.assessment_account_number IS 'Assessment Account Number. Domain: Reference Code. PVSC AAN';
COMMENT ON COLUMN silver.property_assessment.assessment_class_code IS 'Assessment Class Code. Domain: Code. Residential, Commercial, Resource';
COMMENT ON COLUMN silver.property_assessment.land_value_amount IS 'Land Value Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.property_assessment.building_value_amount IS 'Building Value Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.property_assessment.assessed_value_amount IS 'Assessed Value Amount. Domain: Amount. CAD, as published';
COMMENT ON COLUMN silver.property_assessment.capped_assessed_value_amount IS 'Capped Assessed Value Amount. Domain: Amount. CAD, Nova Scotia CAP';
COMMENT ON COLUMN silver.property_assessment.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.property_assessment.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.building_permit IS 'Building Permit: A permit issued for new construction, alteration or demolition on a parcel.';
COMMENT ON COLUMN silver.building_permit.event_id IS 'Event ID. Domain: Identifier. Event Start = issued';
COMMENT ON COLUMN silver.building_permit.development_project_event_id IS 'Development Project Event ID. Domain: Identifier. Has; role name';
COMMENT ON COLUMN silver.building_permit.building_asset_id IS 'Building Asset ID. Domain: Identifier. Authorizes; role name';
COMMENT ON COLUMN silver.building_permit.permit_type_code IS 'Permit Type Code. Domain: Code. New, Alteration, Demolition';
COMMENT ON COLUMN silver.building_permit.work_description IS 'Work Description. Domain: Description.';
COMMENT ON COLUMN silver.building_permit.construction_value_amount IS 'Construction Value Amount. Domain: Amount. CAD';
COMMENT ON COLUMN silver.building_permit.units_created_count IS 'Units Created Count. Domain: Count.';
COMMENT ON COLUMN silver.building_permit.units_removed_count IS 'Units Removed Count. Domain: Count.';
COMMENT ON COLUMN silver.building_permit.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.building_permit.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.rental_market_observation IS 'Rental Market Observation: CMHC rental survey results for one zone, unit type and survey date.';
COMMENT ON COLUMN silver.rental_market_observation.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.rental_market_observation.bedroom_type_code IS 'Bedroom Type Code. Domain: Code. Bachelor, 1, 2, 3+, Total';
COMMENT ON COLUMN silver.rental_market_observation.structure_type_code IS 'Structure Type Code. Domain: Code. Row, Apartment';
COMMENT ON COLUMN silver.rental_market_observation.vacancy_rate_percent IS 'Vacancy Rate Percent. Domain: Percent.';
COMMENT ON COLUMN silver.rental_market_observation.average_rent_amount IS 'Average Rent Amount. Domain: Amount. CAD per month';
COMMENT ON COLUMN silver.rental_market_observation.median_rent_amount IS 'Median Rent Amount. Domain: Amount. CAD per month';
COMMENT ON COLUMN silver.rental_market_observation.universe_unit_count IS 'Universe Unit Count. Domain: Count.';
COMMENT ON COLUMN silver.rental_market_observation.data_reliability_code IS 'Data Reliability Code. Domain: Code. CMHC a to d';
COMMENT ON COLUMN silver.rental_market_observation.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.rental_market_observation.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.short_term_rental_registration IS 'Short-Term Rental Registration: A dwelling unit registered for short-term rental for a period. The host is not kept.';
COMMENT ON COLUMN silver.short_term_rental_registration.event_id IS 'Event ID. Domain: Identifier. Start/End = valid period';
COMMENT ON COLUMN silver.short_term_rental_registration.dwelling_unit_asset_id IS 'Dwelling Unit Asset ID. Domain: Identifier. Registers; role name';
COMMENT ON COLUMN silver.short_term_rental_registration.registration_type_code IS 'Registration Type Code. Domain: Code. Primary residence, Commercial';
COMMENT ON COLUMN silver.short_term_rental_registration.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.short_term_rental_registration.dw_batch_id IS 'Audit: load batch that wrote the row.';

COMMENT ON TABLE silver.development_project IS 'Development Project: A planning application or development on one or more parcels. Extra parcels are in Event Coverage.';
COMMENT ON COLUMN silver.development_project.event_id IS 'Event ID. Domain: Identifier.';
COMMENT ON COLUMN silver.development_project.project_name IS 'Project Name. Domain: Name.';
COMMENT ON COLUMN silver.development_project.development_type_code IS 'Development Type Code. Domain: Code.';
COMMENT ON COLUMN silver.development_project.proposed_unit_count IS 'Proposed Unit Count. Domain: Count.';
COMMENT ON COLUMN silver.development_project.affordable_unit_count IS 'Affordable Unit Count. Domain: Count.';
COMMENT ON COLUMN silver.development_project.approval_date IS 'Approval Date. Domain: Date.';
COMMENT ON COLUMN silver.development_project.dw_loaded_ts IS 'Audit: when the row was last loaded or changed.';
COMMENT ON COLUMN silver.development_project.dw_batch_id IS 'Audit: load batch that wrote the row.';

