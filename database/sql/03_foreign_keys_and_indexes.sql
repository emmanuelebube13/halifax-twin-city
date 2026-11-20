-- =====================================================================
-- Halifax Digital Twin - physical model V1 (PostgreSQL 16 + PostGIS 3)
-- 03  Foreign keys and indexes
-- Relationships from the logical model become foreign keys. PostgreSQL does not index foreign keys automatically, so each gets an index.
-- Generated from Logical Model V1 (63 entities). Safe to read top to bottom.
-- =====================================================================

SET search_path = silver, public;

-- Foreign keys -----------------------------------------------------------

-- Street is a Location
ALTER TABLE silver.street ADD CONSTRAINT fk_street_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Street Segment is a Location
ALTER TABLE silver.street_segment ADD CONSTRAINT fk_street_segment_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Intersection is a Location
ALTER TABLE silver.intersection ADD CONSTRAINT fk_intersection_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Area is a Location
ALTER TABLE silver.area ADD CONSTRAINT fk_area_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Civic Address is a Location
ALTER TABLE silver.civic_address ADD CONSTRAINT fk_civic_address_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Parcel is a Location
ALTER TABLE silver.parcel ADD CONSTRAINT fk_parcel_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Organization is a Party
ALTER TABLE silver.organization ADD CONSTRAINT fk_organization_party
    FOREIGN KEY (party_id) REFERENCES silver.party (party_id);
-- Weather Observation is a Event
ALTER TABLE silver.weather_observation ADD CONSTRAINT fk_weather_observation_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Area Statistic is a Event
ALTER TABLE silver.area_statistic ADD CONSTRAINT fk_area_statistic_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Economic Indicator is a Event
ALTER TABLE silver.economic_indicator ADD CONSTRAINT fk_economic_indicator_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Route is a Asset
ALTER TABLE silver.route ADD CONSTRAINT fk_route_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Stop is a Asset
ALTER TABLE silver.stop ADD CONSTRAINT fk_stop_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Vehicle is a Asset
ALTER TABLE silver.vehicle ADD CONSTRAINT fk_vehicle_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Route Segment is a Asset
ALTER TABLE silver.route_segment ADD CONSTRAINT fk_route_segment_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Trip is a Event
ALTER TABLE silver.trip ADD CONSTRAINT fk_trip_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Stop Arrival is a Event
ALTER TABLE silver.stop_arrival ADD CONSTRAINT fk_stop_arrival_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Service Alert is a Event
ALTER TABLE silver.service_alert ADD CONSTRAINT fk_service_alert_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Collision is a Event
ALTER TABLE silver.collision ADD CONSTRAINT fk_collision_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Traffic Count is a Event
ALTER TABLE silver.traffic_count ADD CONSTRAINT fk_traffic_count_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Infrastructure Asset is a Asset
ALTER TABLE silver.infrastructure_asset ADD CONSTRAINT fk_infrastructure_asset_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Facility is a Asset
ALTER TABLE silver.facility ADD CONSTRAINT fk_facility_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Service Request is a Event
ALTER TABLE silver.service_request ADD CONSTRAINT fk_service_request_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Work Order is a Event
ALTER TABLE silver.work_order ADD CONSTRAINT fk_work_order_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Capital Project is a Event
ALTER TABLE silver.capital_project ADD CONSTRAINT fk_capital_project_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Road Closure is a Event
ALTER TABLE silver.road_closure ADD CONSTRAINT fk_road_closure_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Snow Clearing is a Event
ALTER TABLE silver.snow_clearing ADD CONSTRAINT fk_snow_clearing_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Pavement Condition Assessment is a Event
ALTER TABLE silver.pavement_condition_assessment ADD CONSTRAINT fk_pavement_condition_assessment_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Waste Collection is a Event
ALTER TABLE silver.waste_collection ADD CONSTRAINT fk_waste_collection_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Waste Tonnage Record is a Event
ALTER TABLE silver.waste_tonnage_record ADD CONSTRAINT fk_waste_tonnage_record_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Water Quality Reading is a Event
ALTER TABLE silver.water_quality_reading ADD CONSTRAINT fk_water_quality_reading_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Utility Outage is a Event
ALTER TABLE silver.utility_outage ADD CONSTRAINT fk_utility_outage_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Public Advisory is a Event
ALTER TABLE silver.public_advisory ADD CONSTRAINT fk_public_advisory_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Building is a Asset
ALTER TABLE silver.building ADD CONSTRAINT fk_building_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Dwelling Unit is a Asset
ALTER TABLE silver.dwelling_unit ADD CONSTRAINT fk_dwelling_unit_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Property Sale is a Event
ALTER TABLE silver.property_sale ADD CONSTRAINT fk_property_sale_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Property Assessment is a Event
ALTER TABLE silver.property_assessment ADD CONSTRAINT fk_property_assessment_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Building Permit is a Event
ALTER TABLE silver.building_permit ADD CONSTRAINT fk_building_permit_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Rental Market Observation is a Event
ALTER TABLE silver.rental_market_observation ADD CONSTRAINT fk_rental_market_observation_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Short-Term Rental Registration is a Event
ALTER TABLE silver.short_term_rental_registration ADD CONSTRAINT fk_short_term_rental_registration_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Development Project is a Event
ALTER TABLE silver.development_project ADD CONSTRAINT fk_development_project_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Sector contains Subsector
ALTER TABLE silver.subsector ADD CONSTRAINT fk_subsector_sector
    FOREIGN KEY (sector_id) REFERENCES silver.sector (sector_id);
-- Party publishes Source
ALTER TABLE silver.source ADD CONSTRAINT fk_source_party
    FOREIGN KEY (publisher_party_id) REFERENCES silver.party (party_id);
-- Source provides Location
ALTER TABLE silver.location ADD CONSTRAINT fk_location_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);
-- Street has Street Segment
ALTER TABLE silver.street_segment ADD CONSTRAINT fk_street_segment_street
    FOREIGN KEY (street_location_id) REFERENCES silver.street (location_id);
-- Intersection starts Street Segment
ALTER TABLE silver.street_segment ADD CONSTRAINT fk_street_segment_intersection
    FOREIGN KEY (from_intersection_location_id) REFERENCES silver.intersection (location_id);
-- Intersection ends Street Segment
ALTER TABLE silver.street_segment ADD CONSTRAINT fk_street_segment_intersection_2
    FOREIGN KEY (to_intersection_location_id) REFERENCES silver.intersection (location_id);
-- Area contains Area
ALTER TABLE silver.area ADD CONSTRAINT fk_area_area
    FOREIGN KEY (parent_area_location_id) REFERENCES silver.area (location_id);
-- Street has Civic Address
ALTER TABLE silver.civic_address ADD CONSTRAINT fk_civic_address_street
    FOREIGN KEY (street_location_id) REFERENCES silver.street (location_id);
-- Parcel has Civic Address
ALTER TABLE silver.civic_address ADD CONSTRAINT fk_civic_address_parcel
    FOREIGN KEY (parcel_location_id) REFERENCES silver.parcel (location_id);
-- Location contains Location Containment
ALTER TABLE silver.location_containment ADD CONSTRAINT fk_location_containment_location
    FOREIGN KEY (containing_location_id) REFERENCES silver.location (location_id);
-- Location is contained in Location Containment
ALTER TABLE silver.location_containment ADD CONSTRAINT fk_location_containment_location_2
    FOREIGN KEY (contained_location_id) REFERENCES silver.location (location_id);
-- Source provides Party
ALTER TABLE silver.party ADD CONSTRAINT fk_party_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);
-- Party is classified by Party Sector Classification
ALTER TABLE silver.party_sector_classification ADD CONSTRAINT fk_party_sector_classification_party
    FOREIGN KEY (party_id) REFERENCES silver.party (party_id);
-- Subsector classifies Party Sector Classification
ALTER TABLE silver.party_sector_classification ADD CONSTRAINT fk_party_sector_classification_subsector
    FOREIGN KEY (subsector_id) REFERENCES silver.subsector (subsector_id);
-- Location locates Asset
ALTER TABLE silver.asset ADD CONSTRAINT fk_asset_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Subsector classifies Asset
ALTER TABLE silver.asset ADD CONSTRAINT fk_asset_subsector
    FOREIGN KEY (subsector_id) REFERENCES silver.subsector (subsector_id);
-- Source provides Asset
ALTER TABLE silver.asset ADD CONSTRAINT fk_asset_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);
-- Party plays Party Asset Role
ALTER TABLE silver.party_asset_role ADD CONSTRAINT fk_party_asset_role_party
    FOREIGN KEY (party_id) REFERENCES silver.party (party_id);
-- Asset has Party Asset Role
ALTER TABLE silver.party_asset_role ADD CONSTRAINT fk_party_asset_role_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Calendar Date is the date of Event
ALTER TABLE silver.event ADD CONSTRAINT fk_event_calendar_date
    FOREIGN KEY (event_date) REFERENCES silver.calendar_date (calendar_date);
-- Location is the place of Event
ALTER TABLE silver.event ADD CONSTRAINT fk_event_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Subsector classifies Event
ALTER TABLE silver.event ADD CONSTRAINT fk_event_subsector
    FOREIGN KEY (subsector_id) REFERENCES silver.subsector (subsector_id);
-- Source reports Event
ALTER TABLE silver.event ADD CONSTRAINT fk_event_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);
-- Event involves Event Asset Involvement
ALTER TABLE silver.event_asset_involvement ADD CONSTRAINT fk_event_asset_involvement_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Asset is involved in Event Asset Involvement
ALTER TABLE silver.event_asset_involvement ADD CONSTRAINT fk_event_asset_involvement_asset
    FOREIGN KEY (asset_id) REFERENCES silver.asset (asset_id);
-- Event involves Event Party Involvement
ALTER TABLE silver.event_party_involvement ADD CONSTRAINT fk_event_party_involvement_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Party is involved in Event Party Involvement
ALTER TABLE silver.event_party_involvement ADD CONSTRAINT fk_event_party_involvement_party
    FOREIGN KEY (party_id) REFERENCES silver.party (party_id);
-- Event covers Event Coverage
ALTER TABLE silver.event_coverage ADD CONSTRAINT fk_event_coverage_event
    FOREIGN KEY (event_id) REFERENCES silver.event (event_id);
-- Location is covered by Event Coverage
ALTER TABLE silver.event_coverage ADD CONSTRAINT fk_event_coverage_location
    FOREIGN KEY (location_id) REFERENCES silver.location (location_id);
-- Measure is measured by Area Statistic
ALTER TABLE silver.area_statistic ADD CONSTRAINT fk_area_statistic_measure
    FOREIGN KEY (measure_code) REFERENCES silver.measure (measure_code);
-- Measure is measured by Economic Indicator
ALTER TABLE silver.economic_indicator ADD CONSTRAINT fk_economic_indicator_measure
    FOREIGN KEY (measure_code) REFERENCES silver.measure (measure_code);
-- Source publishes Schedule Version
ALTER TABLE silver.schedule_version ADD CONSTRAINT fk_schedule_version_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);
-- Schedule Version defines Service Calendar
ALTER TABLE silver.service_calendar ADD CONSTRAINT fk_service_calendar_schedule_version
    FOREIGN KEY (schedule_version_id) REFERENCES silver.schedule_version (schedule_version_id);
-- Service Calendar has Service Calendar Exception
ALTER TABLE silver.service_calendar_exception ADD CONSTRAINT fk_service_calendar_exception_service_calendar
    FOREIGN KEY (schedule_version_id, service_code) REFERENCES silver.service_calendar (schedule_version_id, service_code);
-- Calendar Date is the date of Service Calendar Exception
ALTER TABLE silver.service_calendar_exception ADD CONSTRAINT fk_service_calendar_exception_calendar_date
    FOREIGN KEY (exception_date) REFERENCES silver.calendar_date (calendar_date);
-- Stop contains Stop
ALTER TABLE silver.stop ADD CONSTRAINT fk_stop_stop
    FOREIGN KEY (parent_stop_asset_id) REFERENCES silver.stop (asset_id);
-- Stop starts Route Segment
ALTER TABLE silver.route_segment ADD CONSTRAINT fk_route_segment_stop
    FOREIGN KEY (from_stop_asset_id) REFERENCES silver.stop (asset_id);
-- Stop ends Route Segment
ALTER TABLE silver.route_segment ADD CONSTRAINT fk_route_segment_stop_2
    FOREIGN KEY (to_stop_asset_id) REFERENCES silver.stop (asset_id);
-- Schedule Version orders Route Segment Sequence
ALTER TABLE silver.route_segment_sequence ADD CONSTRAINT fk_route_segment_sequence_schedule_version
    FOREIGN KEY (schedule_version_id) REFERENCES silver.schedule_version (schedule_version_id);
-- Route is made of Route Segment Sequence
ALTER TABLE silver.route_segment_sequence ADD CONSTRAINT fk_route_segment_sequence_route
    FOREIGN KEY (route_asset_id) REFERENCES silver.route (asset_id);
-- Route Segment appears in Route Segment Sequence
ALTER TABLE silver.route_segment_sequence ADD CONSTRAINT fk_route_segment_sequence_route_segment
    FOREIGN KEY (route_segment_asset_id) REFERENCES silver.route_segment (asset_id);
-- Route Segment runs along Route Segment Street Segment
ALTER TABLE silver.route_segment_street_segment ADD CONSTRAINT fk_route_segment_street_segment_route_segment
    FOREIGN KEY (route_segment_asset_id) REFERENCES silver.route_segment (asset_id);
-- Street Segment carries Route Segment Street Segment
ALTER TABLE silver.route_segment_street_segment ADD CONSTRAINT fk_route_segment_street_segment_street_segment
    FOREIGN KEY (street_segment_location_id) REFERENCES silver.street_segment (location_id);
-- Service Calendar governs Scheduled Trip
ALTER TABLE silver.scheduled_trip ADD CONSTRAINT fk_scheduled_trip_service_calendar
    FOREIGN KEY (schedule_version_id, service_code) REFERENCES silver.service_calendar (schedule_version_id, service_code);
-- Route has Scheduled Trip
ALTER TABLE silver.scheduled_trip ADD CONSTRAINT fk_scheduled_trip_route
    FOREIGN KEY (route_asset_id) REFERENCES silver.route (asset_id);
-- Scheduled Trip has Scheduled Stop Time
ALTER TABLE silver.scheduled_stop_time ADD CONSTRAINT fk_scheduled_stop_time_scheduled_trip
    FOREIGN KEY (scheduled_trip_id) REFERENCES silver.scheduled_trip (scheduled_trip_id);
-- Stop has Scheduled Stop Time
ALTER TABLE silver.scheduled_stop_time ADD CONSTRAINT fk_scheduled_stop_time_stop
    FOREIGN KEY (stop_asset_id) REFERENCES silver.stop (asset_id);
-- Scheduled Trip runs as Trip
ALTER TABLE silver.trip ADD CONSTRAINT fk_trip_scheduled_trip
    FOREIGN KEY (scheduled_trip_id) REFERENCES silver.scheduled_trip (scheduled_trip_id);
-- Route has Trip
ALTER TABLE silver.trip ADD CONSTRAINT fk_trip_route
    FOREIGN KEY (route_asset_id) REFERENCES silver.route (asset_id);
-- Vehicle operates Trip
ALTER TABLE silver.trip ADD CONSTRAINT fk_trip_vehicle
    FOREIGN KEY (vehicle_asset_id) REFERENCES silver.vehicle (asset_id);
-- Trip reaches Stop Arrival
ALTER TABLE silver.stop_arrival ADD CONSTRAINT fk_stop_arrival_trip
    FOREIGN KEY (trip_event_id) REFERENCES silver.trip (event_id);
-- Stop receives Stop Arrival
ALTER TABLE silver.stop_arrival ADD CONSTRAINT fk_stop_arrival_stop
    FOREIGN KEY (stop_asset_id) REFERENCES silver.stop (asset_id);
-- Vehicle records Vehicle Position
ALTER TABLE silver.vehicle_position ADD CONSTRAINT fk_vehicle_position_vehicle
    FOREIGN KEY (vehicle_asset_id) REFERENCES silver.vehicle (asset_id);
-- Trip is tracked by Vehicle Position
ALTER TABLE silver.vehicle_position ADD CONSTRAINT fk_vehicle_position_trip
    FOREIGN KEY (trip_event_id) REFERENCES silver.trip (event_id);
-- Service Request results in Work Order
ALTER TABLE silver.work_order ADD CONSTRAINT fk_work_order_service_request
    FOREIGN KEY (service_request_event_id) REFERENCES silver.service_request (event_id);
-- Capital Project includes Work Order
ALTER TABLE silver.work_order ADD CONSTRAINT fk_work_order_capital_project
    FOREIGN KEY (capital_project_event_id) REFERENCES silver.capital_project (event_id);
-- Infrastructure Asset is repaired by Work Order
ALTER TABLE silver.work_order ADD CONSTRAINT fk_work_order_infrastructure_asset
    FOREIGN KEY (infrastructure_asset_id) REFERENCES silver.infrastructure_asset (asset_id);
-- Capital Project causes Road Closure
ALTER TABLE silver.road_closure ADD CONSTRAINT fk_road_closure_capital_project
    FOREIGN KEY (capital_project_event_id) REFERENCES silver.capital_project (event_id);
-- Development Project causes Road Closure
ALTER TABLE silver.road_closure ADD CONSTRAINT fk_road_closure_development_project
    FOREIGN KEY (development_project_event_id) REFERENCES silver.development_project (event_id);
-- Calendar Date schedules Waste Collection
ALTER TABLE silver.waste_collection ADD CONSTRAINT fk_waste_collection_calendar_date
    FOREIGN KEY (scheduled_collection_date) REFERENCES silver.calendar_date (calendar_date);
-- Facility records Waste Tonnage Record
ALTER TABLE silver.waste_tonnage_record ADD CONSTRAINT fk_waste_tonnage_record_facility
    FOREIGN KEY (facility_asset_id) REFERENCES silver.facility (asset_id);
-- Infrastructure Asset is sampled by Water Quality Reading
ALTER TABLE silver.water_quality_reading ADD CONSTRAINT fk_water_quality_reading_infrastructure_asset
    FOREIGN KEY (infrastructure_asset_id) REFERENCES silver.infrastructure_asset (asset_id);
-- Measure is measured by Water Quality Reading
ALTER TABLE silver.water_quality_reading ADD CONSTRAINT fk_water_quality_reading_measure
    FOREIGN KEY (measure_code) REFERENCES silver.measure (measure_code);
-- Building contains Dwelling Unit
ALTER TABLE silver.dwelling_unit ADD CONSTRAINT fk_dwelling_unit_building
    FOREIGN KEY (building_asset_id) REFERENCES silver.building (asset_id);
-- Dwelling Unit is registered by Short-Term Rental Registration
ALTER TABLE silver.short_term_rental_registration ADD CONSTRAINT fk_short_term_rental_registration_dwelling_unit
    FOREIGN KEY (dwelling_unit_asset_id) REFERENCES silver.dwelling_unit (asset_id);
-- Development Project has Building Permit
ALTER TABLE silver.building_permit ADD CONSTRAINT fk_building_permit_development_project
    FOREIGN KEY (development_project_event_id) REFERENCES silver.development_project (event_id);
-- Building is authorized by Building Permit
ALTER TABLE silver.building_permit ADD CONSTRAINT fk_building_permit_building
    FOREIGN KEY (building_asset_id) REFERENCES silver.building (asset_id);
-- Source reports Vehicle Position (rolled down from Event)
ALTER TABLE silver.vehicle_position ADD CONSTRAINT fk_vehicle_position_source
    FOREIGN KEY (source_id) REFERENCES silver.source (source_id);

-- Indexes on foreign-key columns ----------------------------------------
-- Skipped where the primary key already starts with the same columns.

CREATE INDEX ix_subsector_sector_id ON silver.subsector (sector_id);
CREATE INDEX ix_source_publisher_party_id ON silver.source (publisher_party_id);
CREATE INDEX ix_location_source_id ON silver.location (source_id);
CREATE INDEX ix_street_segment_street_location_id ON silver.street_segment (street_location_id);
CREATE INDEX ix_street_segment_from_intersection_location_id ON silver.street_segment (from_intersection_location_id);
CREATE INDEX ix_street_segment_to_intersection_location_id ON silver.street_segment (to_intersection_location_id);
CREATE INDEX ix_area_parent_area_location_id ON silver.area (parent_area_location_id);
CREATE INDEX ix_civic_address_street_location_id ON silver.civic_address (street_location_id);
CREATE INDEX ix_civic_address_parcel_location_id ON silver.civic_address (parcel_location_id);
CREATE INDEX ix_location_containment_contained_location_id ON silver.location_containment (contained_location_id);
CREATE INDEX ix_party_source_id ON silver.party (source_id);
CREATE INDEX ix_party_sector_classification_subsector_id ON silver.party_sector_classification (subsector_id);
CREATE INDEX ix_asset_location_id ON silver.asset (location_id);
CREATE INDEX ix_asset_subsector_id ON silver.asset (subsector_id);
CREATE INDEX ix_asset_source_id ON silver.asset (source_id);
CREATE INDEX ix_party_asset_role_asset_id ON silver.party_asset_role (asset_id);
CREATE INDEX ix_event_event_date ON silver.event (event_date);
CREATE INDEX ix_event_location_id ON silver.event (location_id);
CREATE INDEX ix_event_subsector_id ON silver.event (subsector_id);
CREATE INDEX ix_event_source_id ON silver.event (source_id);
CREATE INDEX ix_event_asset_involvement_asset_id ON silver.event_asset_involvement (asset_id);
CREATE INDEX ix_event_party_involvement_party_id ON silver.event_party_involvement (party_id);
CREATE INDEX ix_event_coverage_location_id ON silver.event_coverage (location_id);
CREATE INDEX ix_area_statistic_measure_code ON silver.area_statistic (measure_code);
CREATE INDEX ix_economic_indicator_measure_code ON silver.economic_indicator (measure_code);
CREATE INDEX ix_schedule_version_source_id ON silver.schedule_version (source_id);
CREATE INDEX ix_service_calendar_exception_exception_date ON silver.service_calendar_exception (exception_date);
CREATE INDEX ix_stop_parent_stop_asset_id ON silver.stop (parent_stop_asset_id);
CREATE INDEX ix_route_segment_from_stop_asset_id ON silver.route_segment (from_stop_asset_id);
CREATE INDEX ix_route_segment_to_stop_asset_id ON silver.route_segment (to_stop_asset_id);
CREATE INDEX ix_route_segment_sequence_route_asset_id ON silver.route_segment_sequence (route_asset_id);
CREATE INDEX ix_route_segment_sequence_route_segment_asset_id ON silver.route_segment_sequence (route_segment_asset_id);
CREATE INDEX ix_route_segment_street_segment_street_segment_location_id ON silver.route_segment_street_segment (street_segment_location_id);
CREATE INDEX ix_scheduled_trip_schedule_version_id_service_code ON silver.scheduled_trip (schedule_version_id, service_code);
CREATE INDEX ix_scheduled_trip_route_asset_id ON silver.scheduled_trip (route_asset_id);
CREATE INDEX ix_scheduled_stop_time_stop_asset_id ON silver.scheduled_stop_time (stop_asset_id);
CREATE INDEX ix_trip_scheduled_trip_id ON silver.trip (scheduled_trip_id);
CREATE INDEX ix_trip_route_asset_id ON silver.trip (route_asset_id);
CREATE INDEX ix_trip_vehicle_asset_id ON silver.trip (vehicle_asset_id);
CREATE INDEX ix_stop_arrival_trip_event_id ON silver.stop_arrival (trip_event_id);
CREATE INDEX ix_stop_arrival_stop_asset_id ON silver.stop_arrival (stop_asset_id);
CREATE INDEX ix_vehicle_position_trip_event_id ON silver.vehicle_position (trip_event_id);
CREATE INDEX ix_work_order_service_request_event_id ON silver.work_order (service_request_event_id);
CREATE INDEX ix_work_order_capital_project_event_id ON silver.work_order (capital_project_event_id);
CREATE INDEX ix_work_order_infrastructure_asset_id ON silver.work_order (infrastructure_asset_id);
CREATE INDEX ix_road_closure_capital_project_event_id ON silver.road_closure (capital_project_event_id);
CREATE INDEX ix_road_closure_development_project_event_id ON silver.road_closure (development_project_event_id);
CREATE INDEX ix_waste_collection_scheduled_collection_date ON silver.waste_collection (scheduled_collection_date);
CREATE INDEX ix_waste_tonnage_record_facility_asset_id ON silver.waste_tonnage_record (facility_asset_id);
CREATE INDEX ix_water_quality_reading_infrastructure_asset_id ON silver.water_quality_reading (infrastructure_asset_id);
CREATE INDEX ix_water_quality_reading_measure_code ON silver.water_quality_reading (measure_code);
CREATE INDEX ix_dwelling_unit_building_asset_id ON silver.dwelling_unit (building_asset_id);
CREATE INDEX ix_short_term_rental_registration_dwelling_unit_asset_id ON silver.short_term_rental_registration (dwelling_unit_asset_id);
CREATE INDEX ix_building_permit_development_project_event_id ON silver.building_permit (development_project_event_id);
CREATE INDEX ix_building_permit_building_asset_id ON silver.building_permit (building_asset_id);
CREATE INDEX ix_vehicle_position_source_id ON silver.vehicle_position (source_id);

-- Spatial indexes (GiST) make "what is near / inside" queries fast.
CREATE INDEX ix_location_location_geometry_gist ON silver.location USING gist (location_geometry);

-- Time-based lookups on events.
CREATE INDEX ix_event_event_start_ts ON silver.event (event_start_ts);
CREATE INDEX ix_event_event_type_code_event_date ON silver.event (event_type_code, event_date);
