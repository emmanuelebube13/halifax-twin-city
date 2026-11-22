# Data dictionary

Step 11 of the data-design method. **Generated, do not edit by hand.** Regenerate with `python database/generator/build_data_dictionary.py` from the repository root; `--check` confirms these files match the model.

Sources: `database/generator/logical_model_spec.py` (entities, attributes, domains) and `database/sql/02`, `03`, `04`, `06` and `07` (physical types, keys, references, history and the `COMMENT ON` text). The same rows, one per column, are in `data-dictionary.csv`.

## Summary

| Item | Count |
| --- | --- |
| Silver tables | 63 |
| Silver columns | 520 |
| Silver tables with SCD Type 2 history | 22 |
| Bronze tables | 1 |
| Columns with no comment in the database | 11 |

## How to read it

| Field | Meaning |
| --- | --- |
| Attribute | The logical attribute name in Logical Model V1. Empty for audit, history and derived columns |
| Class | Logical (from the model), Audit (`dw_` columns), SCD2 (`valid_from_ts`), Derived (computed by the database), Register (bronze) |
| Domain | The logical domain, which sets the type and the check rule |
| Null | Yes if the column may be empty |
| Keys | Physical primary key (`pk_`) and alternate keys (`ak1_`, `ak2_`) the column belongs to |
| References | The column a foreign key points to |
| Check | The CHECK constraint on the column |

Times are `timestamptz`, stored in UTC and shown in Halifax time (America/Halifax). Geometry is `geometry(Geometry, 4326)` (WGS 84). See `standards.md` for the rules behind these choices.

Columns with no comment in the database (a gap to close in `07_comments.sql` through the generator):

- `silver.vehicle_position.position_geom`
- `silver.vehicle_position.dw_loaded_ts`
- `bronze.feed_fetch.fetch_id`
- `bronze.feed_fetch.source_id`
- `bronze.feed_fetch.fetched_ts`
- `bronze.feed_fetch.http_status`
- `bronze.feed_fetch.entity_count`
- `bronze.feed_fetch.file_path`
- `bronze.feed_fetch.file_bytes`
- `bronze.feed_fetch.error_text`
- `bronze.feed_fetch.dw_loaded_ts`

## Contents

- **Core:** `sector`, `subsector`, `source`, `calendar_date`, `measure`, `location`, `street`, `street_segment`, `intersection`, `area`, `civic_address`, `parcel`, `location_containment`, `party`, `organization`, `party_sector_classification`, `asset`, `party_asset_role`, `event`, `event_asset_involvement`, `event_party_involvement`, `event_coverage`, `weather_observation`, `area_statistic`, `economic_indicator`
- **Transportation:** `schedule_version`, `service_calendar`, `service_calendar_exception`, `route`, `stop`, `vehicle`, `route_segment`, `route_segment_sequence`, `route_segment_street_segment`, `scheduled_trip`, `scheduled_stop_time`, `trip`, `stop_arrival`, `vehicle_position`, `service_alert`, `collision`, `traffic_count`
- **Public Works:** `infrastructure_asset`, `facility`, `service_request`, `work_order`, `capital_project`, `road_closure`, `snow_clearing`, `pavement_condition_assessment`, `waste_collection`, `waste_tonnage_record`, `water_quality_reading`, `utility_outage`, `public_advisory`
- **Housing & Real Estate:** `building`, `dwelling_unit`, `property_sale`, `property_assessment`, `building_permit`, `rental_market_observation`, `short_term_rental_registration`, `development_project`
- **Bronze:** `feed_fetch`

## Core

### silver.sector

**Sector** (Reference). One of the 17 city sectors from the Domain Map (S01 to S17).

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `sector_id` | Sector ID | Logical | Reference Code | varchar(30) | No | pk_sector |  |  | Sector ID. Domain: Reference Code. S04 |
| 2 | `sector_name` | Sector Name | Logical | Name | varchar(200) | No |  |  |  | Sector Name. Domain: Name. |
| 3 | `sector_description` | Sector Description | Logical | Description | varchar(2000) | Yes |  |  |  | Sector Description. Domain: Description. |
| 4 | `phase_number` | Phase Number | Logical | Count | integer | Yes |  |  | phase_number >= 0 | Phase Number. Domain: Count. 1 = Phase 1 sector |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.subsector

**Subsector** (Reference). One subsector from the Domain Map, such as TRN-01 Passenger Transportation.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `subsector_id` | Subsector ID | Logical | Reference Code | varchar(30) | No | pk_subsector |  |  | Subsector ID. Domain: Reference Code. TRN-01; CORE-00 for shared core data |
| 2 | `sector_id` | Sector ID | Logical | Reference Code | varchar(30) | No |  | silver.sector.sector_id |  | Sector ID. Domain: Reference Code. |
| 3 | `subsector_name` | Subsector Name | Logical | Name | varchar(200) | No |  |  |  | Subsector Name. Domain: Name. |
| 4 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.source

**Source** (Reference). One dataset or feed the twin loads, from the Source Inventory.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No | pk_source |  |  | Source ID. Domain: Reference Code. SRC-001 |
| 2 | `publisher_party_id` | Publisher Party ID | Logical | Identifier | bigint | No |  | silver.party.party_id |  | Publisher Party ID. Domain: Identifier. Role name of Party ID |
| 3 | `dataset_name` | Dataset Name | Logical | Name | varchar(200) | No |  |  |  | Dataset Name. Domain: Name. |
| 4 | `source_format_code` | Source Format Code | Logical | Code | varchar(30) | No |  |  |  | Source Format Code. Domain: Code. GTFS, GTFS-RT, ArcGIS REST API, CSV … |
| 5 | `access_method_code` | Access Method Code | Logical | Code | varchar(30) | No |  |  |  | Access Method Code. Domain: Code. Live feed, API, File download … |
| 6 | `cadence_code` | Cadence Code | Logical | Code | varchar(30) | Yes |  |  |  | Cadence Code. Domain: Code. Real-time, Daily … Irregular |
| 7 | `availability_code` | Availability Code | Logical | Code | varchar(30) | No |  |  |  | Availability Code. Domain: Code. Open, Mixed, Partner, Private |
| 8 | `licence_name` | Licence Name | Logical | Name | varchar(200) | No |  |  |  | Licence Name. Domain: Name. |
| 9 | `attribution_required_flag` | Attribution Required Flag | Logical | Flag | boolean | No |  |  |  | Attribution Required Flag. Domain: Flag. |
| 10 | `record_grain_description` | Record Grain Description | Logical | Description | varchar(2000) | No |  |  |  | Record Grain Description. Domain: Description. What one record is |
| 11 | `source_url` | Source URL | Logical | URL | varchar(500) | No |  |  | source_url ~ '^https?://' | Source URL. Domain: URL. |
| 12 | `reliability_tier_code` | Reliability Tier Code | Logical | Code | varchar(30) | No |  |  |  | Reliability Tier Code. Domain: Code. Tier 1 to Tier 3 |
| 13 | `source_status_code` | Source Status Code | Logical | Code | varchar(30) | No |  |  |  | Source Status Code. Domain: Code. Verified, Not checked … |
| 14 | `last_checked_date` | Last Checked Date | Logical | Date | date | Yes |  |  |  | Last Checked Date. Domain: Date. |
| 15 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 16 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 17 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.calendar_date

**Calendar Date** (Reference). One calendar day, used for the date an event occurs on.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `calendar_date` | Calendar Date | Logical | Date | date | No | pk_calendar_date |  |  | Calendar Date. Domain: Date. |
| 2 | `calendar_year` | Calendar Year | Logical | Year | smallint | No |  |  | calendar_year BETWEEN 1700 AND 2100 | Calendar Year. Domain: Year. |
| 3 | `quarter_number` | Quarter Number | Logical | Count | integer | No |  |  | quarter_number >= 0 | Quarter Number. Domain: Count. |
| 4 | `month_number` | Month Number | Logical | Count | integer | No |  |  | month_number >= 0 | Month Number. Domain: Count. |
| 5 | `week_of_year_number` | Week Of Year Number | Logical | Count | integer | No |  |  | week_of_year_number >= 0 | Week Of Year Number. Domain: Count. ISO week |
| 6 | `day_of_week_name` | Day Of Week Name | Logical | Name | varchar(200) | No |  |  |  | Day Of Week Name. Domain: Name. |
| 7 | `weekend_flag` | Weekend Flag | Logical | Flag | boolean | No |  |  |  | Weekend Flag. Domain: Flag. |
| 8 | `statutory_holiday_flag` | Statutory Holiday Flag | Logical | Flag | boolean | No |  |  |  | Statutory Holiday Flag. Domain: Flag. Nova Scotia |
| 9 | `holiday_name` | Holiday Name | Logical | Name | varchar(200) | Yes |  |  |  | Holiday Name. Domain: Name. |
| 10 | `season_name` | Season Name | Logical | Name | varchar(200) | No |  |  |  | Season Name. Domain: Name. |
| 11 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 12 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.measure

**Measure** (Reference). Something that is counted or measured, with its unit, such as median household income or E. coli count.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `measure_code` | Measure Code | Logical | Reference Code | varchar(30) | No | pk_measure |  |  | Measure Code. Domain: Reference Code. |
| 2 | `measure_name` | Measure Name | Logical | Name | varchar(200) | No |  |  |  | Measure Name. Domain: Name. |
| 3 | `unit_of_measure_code` | Unit Of Measure Code | Logical | Code | varchar(30) | No |  |  |  | Unit Of Measure Code. Domain: Code. CAD, %, mg/L, count … |
| 4 | `measure_description` | Measure Description | Logical | Description | varchar(2000) | Yes |  |  |  | Measure Description. Domain: Description. |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.location

**Location** (Supertype). Any place in the city: a point, line, area, service area or citywide.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint; identity (by default) | No | pk_location |  |  | Location ID. Domain: Identifier. |
| 2 | `location_type_code` | Location Type Code | Logical | Code | varchar(30) | No |  |  |  | Location Type Code. Domain: Code. Discriminator |
| 3 | `location_name` | Location Name | Logical | Name | varchar(200) | Yes |  |  |  | Location Name. Domain: Name. |
| 4 | `geometry_type_code` | Geometry Type Code | Logical | Code | varchar(30) | No |  |  |  | Geometry Type Code. Domain: Code. Point, Line, Polygon, None |
| 5 | `location_geometry` | Location Geometry | Logical | Geometry | geometry(Geometry, 4326) | Yes |  |  |  | Location Geometry. Domain: Geometry. None for Citywide |
| 6 | `centroid_latitude` | Centroid Latitude | Logical | Latitude | numeric(9,6) | Yes |  |  | centroid_latitude BETWEEN -90 AND 90 | Centroid Latitude. Domain: Latitude. |
| 7 | `centroid_longitude` | Centroid Longitude | Logical | Longitude | numeric(9,6) | Yes |  |  | centroid_longitude BETWEEN -180 AND 180 | Centroid Longitude. Domain: Longitude. |
| 8 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No | ak1_location (2 columns) | silver.source.source_id |  | Source ID. Domain: Reference Code. |
| 9 | `source_location_key` | Source Location Key | Logical | Source Key | varchar(100) | No | ak1_location (2 columns) |  |  | Source Location Key. Domain: Source Key. Key as the source gives it |
| 10 | `start_date` | Start Date | Logical | Date | date | Yes |  |  |  | Start Date. Domain: Date. Lifecycle: created |
| 11 | `end_date` | End Date | Logical | Date | date | Yes |  |  |  | End Date. Domain: Date. Lifecycle: retired |
| 12 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 13 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 14 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.street

**Street** (Subtype of Location). A named street, made up of street segments.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_street | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `street_name` | Street Name | Logical | Name | varchar(200) | No |  |  |  | Street Name. Domain: Name. |
| 3 | `street_type_code` | Street Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Street Type Code. Domain: Code. St, Ave, Rd … |
| 4 | `street_direction_code` | Street Direction Code | Logical | Code | varchar(30) | Yes |  |  |  | Street Direction Code. Domain: Code. |
| 5 | `road_jurisdiction_code` | Road Jurisdiction Code | Logical | Code | varchar(30) | No |  |  |  | Road Jurisdiction Code. Domain: Code. Municipal, Provincial, Private |
| 6 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.street_segment

**Street Segment** (Subtype of Location). The stretch of one street between two intersections.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_street_segment | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `street_location_id` | Street Location ID | Logical | Identifier | bigint | No |  | silver.street.location_id |  | Street Location ID. Domain: Identifier. Role name: the street |
| 3 | `from_intersection_location_id` | From Intersection Location ID | Logical | Identifier | bigint | Yes |  | silver.intersection.location_id |  | From Intersection Location ID. Domain: Identifier. Role name |
| 4 | `to_intersection_location_id` | To Intersection Location ID | Logical | Identifier | bigint | Yes |  | silver.intersection.location_id |  | To Intersection Location ID. Domain: Identifier. Role name |
| 5 | `segment_length_metres` | Segment Length Metres | Logical | Length Metres | numeric(12,2) | Yes |  |  | segment_length_metres >= 0 | Segment Length Metres. Domain: Length Metres. |
| 6 | `road_class_code` | Road Class Code | Logical | Code | varchar(30) | Yes |  |  |  | Road Class Code. Domain: Code. Arterial, Collector, Local … |
| 7 | `speed_limit_kph` | Speed Limit Kph | Logical | Count | integer | Yes |  |  | speed_limit_kph >= 0 | Speed Limit Kph. Domain: Count. |
| 8 | `lane_count` | Lane Count | Logical | Count | integer | Yes |  |  | lane_count >= 0 | Lane Count. Domain: Count. |
| 9 | `one_way_flag` | One Way Flag | Logical | Flag | boolean | Yes |  |  |  | One Way Flag. Domain: Flag. |
| 10 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 11 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 12 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.intersection

**Intersection** (Subtype of Location). A point where two or more street segments meet.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_intersection | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `intersection_name` | Intersection Name | Logical | Name | varchar(200) | Yes |  |  |  | Intersection Name. Domain: Name. Barrington St & Spring Garden Rd |
| 3 | `traffic_control_code` | Traffic Control Code | Logical | Code | varchar(30) | Yes |  |  |  | Traffic Control Code. Domain: Code. Signal, Stop, Roundabout, None |
| 4 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.area

**Area** (Subtype of Location). A bounded area: neighbourhood, census tract, council district, CMHC zone, snow or waste zone, zoning zone.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_area | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `area_type_code` | Area Type Code | Logical | Code | varchar(30) | No |  |  |  | Area Type Code. Domain: Code. |
| 3 | `area_code` | Area Code | Logical | Code | varchar(30) | Yes |  |  |  | Area Code. Domain: Code. Official code, e.g. census DGUID |
| 4 | `parent_area_location_id` | Parent Area Location ID | Logical | Identifier | bigint | Yes |  | silver.area.location_id |  | Parent Area Location ID. Domain: Identifier. Recursive; role name |
| 5 | `area_square_km` | Area Square Km | Logical | Area Square Km | numeric(12,2) | Yes |  |  | area_square_km >= 0 | Area Square Km. Domain: Area Square Km. |
| 6 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.civic_address

**Civic Address** (Subtype of Location). A civic number on a street, located on one parcel.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_civic_address | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `street_location_id` | Street Location ID | Logical | Identifier | bigint | No |  | silver.street.location_id |  | Street Location ID. Domain: Identifier. Role name: the street |
| 3 | `parcel_location_id` | Parcel Location ID | Logical | Identifier | bigint | No |  | silver.parcel.location_id |  | Parcel Location ID. Domain: Identifier. Role name: the parcel |
| 4 | `civic_number` | Civic Number | Logical | Count | integer | No |  |  | civic_number >= 0 | Civic Number. Domain: Count. |
| 5 | `civic_number_suffix` | Civic Number Suffix | Logical | Code | varchar(30) | Yes |  |  |  | Civic Number Suffix. Domain: Code. A, B, ½ |
| 6 | `postal_code` | Postal Code | Logical | Code | varchar(30) | Yes |  |  |  | Postal Code. Domain: Code. |
| 7 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 8 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 9 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.parcel

**Parcel** (Subtype of Location). A legal land parcel, identified by its Nova Scotia PID.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_parcel | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 2 | `parcel_pid` | Parcel PID | Logical | Reference Code | varchar(30) | No | ak1_parcel |  |  | Parcel PID. Domain: Reference Code. Property Identification Number |
| 3 | `parcel_area_square_metres` | Parcel Area Square Metres | Logical | Area Square Metres | numeric(12,2) | Yes |  |  | parcel_area_square_metres >= 0 | Parcel Area Square Metres. Domain: Area Square Metres. |
| 4 | `land_use_code` | Land Use Code | Logical | Code | varchar(30) | Yes |  |  |  | Land Use Code. Domain: Code. |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.location_containment

**Location Containment** (Associative). One location lying inside or overlapping another, such as a parcel inside a neighbourhood. Resolves the Street Segment–Area and Area–Parcel many-to-many lines.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `containing_location_id` | Containing Location ID | Logical | Identifier | bigint | No | pk_location_containment (2 columns) | silver.location.location_id |  | Containing Location ID. Domain: Identifier. Role name; usually an Area |
| 2 | `contained_location_id` | Contained Location ID | Logical | Identifier | bigint | No | pk_location_containment (2 columns) | silver.location.location_id |  | Contained Location ID. Domain: Identifier. Role name |
| 3 | `overlap_percent` | Overlap Percent | Logical | Percent | numeric(5,2) | Yes |  |  | overlap_percent BETWEEN 0 AND 100 | Overlap Percent. Domain: Percent. Share of the contained location inside |
| 4 | `containment_method_code` | Containment Method Code | Logical | Code | varchar(30) | No |  |  |  | Containment Method Code. Domain: Code. Spatial join, Published by source |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.party

**Party** (Supertype). An organization that owns, operates, publishes or takes part in something. People are reserved for a later phase.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `party_id` | Party ID | Logical | Identifier | bigint; identity (by default) | No | pk_party |  |  | Party ID. Domain: Identifier. |
| 2 | `party_type_code` | Party Type Code | Logical | Code | varchar(30) | No |  |  |  | Party Type Code. Domain: Code. Discriminator: Organization (Person reserved) |
| 3 | `party_name` | Party Name | Logical | Name | varchar(200) | No |  |  |  | Party Name. Domain: Name. |
| 4 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | Yes | ak1_party (2 columns) | silver.source.source_id |  | Source ID. Domain: Reference Code. Optional: avoids a loop with Source |
| 5 | `source_party_key` | Source Party Key | Logical | Source Key | varchar(100) | Yes | ak1_party (2 columns) |  |  | Source Party Key. Domain: Source Key. |
| 6 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.organization

**Organization** (Subtype of Party). A government body, agency, utility, company or non-profit.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `party_id` | Party ID | Logical | Identifier | bigint | No | pk_organization | silver.party.party_id |  | Party ID. Domain: Identifier. |
| 2 | `organization_type_code` | Organization Type Code | Logical | Code | varchar(30) | No |  |  |  | Organization Type Code. Domain: Code. |
| 3 | `legal_name` | Legal Name | Logical | Name | varchar(200) | Yes |  |  |  | Legal Name. Domain: Name. |
| 4 | `business_number` | Business Number | Logical | Reference Code | varchar(30) | Yes |  |  |  | Business Number. Domain: Reference Code. CRA business number |
| 5 | `website_url` | Website URL | Logical | URL | varchar(500) | Yes |  |  | website_url ~ '^https?://' | Website URL. Domain: URL. |
| 6 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.party_sector_classification

**Party Sector Classification** (Associative). The subsectors a party works in. Replaces Sector classifies Party.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `party_id` | Party ID | Logical | Identifier | bigint | No | pk_party_sector_classification (2 columns) | silver.party.party_id |  | Party ID. Domain: Identifier. |
| 2 | `subsector_id` | Subsector ID | Logical | Reference Code | varchar(30) | No | pk_party_sector_classification (2 columns) | silver.subsector.subsector_id |  | Subsector ID. Domain: Reference Code. |
| 3 | `primary_classification_flag` | Primary Classification Flag | Logical | Flag | boolean | No |  |  |  | Primary Classification Flag. Domain: Flag. |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.asset

**Asset** (Supertype). A physical thing the city depends on: route, stop, vehicle, road asset, facility, building, dwelling unit.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint; identity (by default) | No | pk_asset |  |  | Asset ID. Domain: Identifier. |
| 2 | `asset_type_code` | Asset Type Code | Logical | Code | varchar(30) | No |  |  |  | Asset Type Code. Domain: Code. Discriminator |
| 3 | `asset_name` | Asset Name | Logical | Name | varchar(200) | Yes |  |  |  | Asset Name. Domain: Name. |
| 4 | `location_id` | Location ID | Logical | Identifier | bigint | Yes |  | silver.location.location_id |  | Location ID. Domain: Identifier. Located at; empty for vehicles |
| 5 | `subsector_id` | Subsector ID | Logical | Reference Code | varchar(30) | No |  | silver.subsector.subsector_id |  | Subsector ID. Domain: Reference Code. |
| 6 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No | ak1_asset (2 columns) | silver.source.source_id |  | Source ID. Domain: Reference Code. |
| 7 | `source_asset_key` | Source Asset Key | Logical | Source Key | varchar(100) | No | ak1_asset (2 columns) |  |  | Source Asset Key. Domain: Source Key. e.g. GTFS route_id, stop_id |
| 8 | `asset_status_code` | Asset Status Code | Logical | Code | varchar(30) | No |  |  |  | Asset Status Code. Domain: Code. Active, Planned, Retired |
| 9 | `in_service_date` | In Service Date | Logical | Date | date | Yes |  |  |  | In Service Date. Domain: Date. |
| 10 | `out_of_service_date` | Out Of Service Date | Logical | Date | date | Yes |  |  |  | Out Of Service Date. Domain: Date. |
| 11 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 12 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 13 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.party_asset_role

**Party Asset Role** (Associative). A party owning, operating or maintaining an asset for a period. Replaces Party owns/operates Asset.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `party_id` | Party ID | Logical | Identifier | bigint | No | pk_party_asset_role (4 columns) | silver.party.party_id |  | Party ID. Domain: Identifier. |
| 2 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_party_asset_role (4 columns) | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 3 | `asset_role_code` | Asset Role Code | Logical | Code | varchar(30) | No | pk_party_asset_role (4 columns) |  |  | Asset Role Code. Domain: Code. Owner, Operator, Maintainer |
| 4 | `role_start_date` | Role Start Date | Logical | Date | date | No | pk_party_asset_role (4 columns) |  |  | Role Start Date. Domain: Date. |
| 5 | `role_end_date` | Role End Date | Logical | Date | date | Yes |  |  |  | Role End Date. Domain: Date. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.event

**Event** (Supertype). Something that happens at a place and time and is reported by a source: a trip, a repair, a sale, a reading.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint; identity (by default) | No | pk_event |  |  | Event ID. Domain: Identifier. |
| 2 | `event_type_code` | Event Type Code | Logical | Code | varchar(30) | No |  |  |  | Event Type Code. Domain: Code. Discriminator |
| 3 | `event_start_ts` | Event Start Timestamp | Logical | Timestamp | timestamptz | No |  |  |  | Event Start Timestamp. Domain: Timestamp. UTC |
| 4 | `event_end_ts` | Event End Timestamp | Logical | Timestamp | timestamptz | Yes |  |  |  | Event End Timestamp. Domain: Timestamp. UTC |
| 5 | `event_date` | Event Date | Logical | Date | date | No |  | silver.calendar_date.calendar_date |  | Event Date. Domain: Date. Role name of Calendar Date; occurs on |
| 6 | `location_id` | Location ID | Logical | Identifier | bigint | Yes |  | silver.location.location_id |  | Location ID. Domain: Identifier. Occurs at; see the location rules |
| 7 | `subsector_id` | Subsector ID | Logical | Reference Code | varchar(30) | No |  | silver.subsector.subsector_id |  | Subsector ID. Domain: Reference Code. |
| 8 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No | ak1_event (2 columns) | silver.source.source_id |  | Source ID. Domain: Reference Code. Reported by |
| 9 | `source_event_key` | Source Event Key | Logical | Source Key | varchar(100) | No | ak1_event (2 columns) |  |  | Source Event Key. Domain: Source Key. Permit no., request no. … |
| 10 | `event_status_code` | Event Status Code | Logical | Code | varchar(30) | Yes |  |  |  | Event Status Code. Domain: Code. |
| 11 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 12 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.event_asset_involvement

**Event Asset Involvement** (Associative). An asset taking part in an event in a named role, such as a route affected by a service alert. Replaces Event involves Asset and Service Alert affects Route/Stop.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_event_asset_involvement (3 columns) | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_event_asset_involvement (3 columns) | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 3 | `involvement_role_code` | Involvement Role Code | Logical | Code | varchar(30) | No | pk_event_asset_involvement (3 columns) |  |  | Involvement Role Code. Domain: Code. Affected, Measured, Used … |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.event_party_involvement

**Event Party Involvement** (Associative). A party taking part in an event in a named role, such as the contractor on a work order. Replaces Event involves Party.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_event_party_involvement (3 columns) | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `party_id` | Party ID | Logical | Identifier | bigint | No | pk_event_party_involvement (3 columns) | silver.party.party_id |  | Party ID. Domain: Identifier. |
| 3 | `involvement_role_code` | Involvement Role Code | Logical | Code | varchar(30) | No | pk_event_party_involvement (3 columns) |  |  | Involvement Role Code. Domain: Code. Reporter, Responsible, Contractor, Applicant |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.event_coverage

**Event Coverage** (Associative). Extra locations an event covers beyond its main one, such as every street segment in a road closure. Replaces Road Closure on Street Segment, Utility Outage affects Area, Public Advisory covers Area.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_event_coverage (3 columns) | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `location_id` | Location ID | Logical | Identifier | bigint | No | pk_event_coverage (3 columns) | silver.location.location_id |  | Location ID. Domain: Identifier. |
| 3 | `coverage_role_code` | Coverage Role Code | Logical | Code | varchar(30) | No | pk_event_coverage (3 columns) |  |  | Coverage Role Code. Domain: Code. Affected, Closed, Detour |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.weather_observation

**Weather Observation** (Subtype of Event). Weather recorded for an area over one hour or one day.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_weather_observation | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `observation_interval_code` | Observation Interval Code | Logical | Code | varchar(30) | No |  |  |  | Observation Interval Code. Domain: Code. Hourly, Daily |
| 3 | `air_temperature_celsius` | Air Temperature Celsius | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Air Temperature Celsius. Domain: Measure Value. |
| 4 | `precipitation_mm` | Precipitation Mm | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Precipitation Mm. Domain: Measure Value. |
| 5 | `snowfall_cm` | Snowfall Cm | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Snowfall Cm. Domain: Measure Value. |
| 6 | `snow_on_ground_cm` | Snow On Ground Cm | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Snow On Ground Cm. Domain: Measure Value. |
| 7 | `mean_wind_speed_kph` | Mean Wind Speed Kph | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Mean Wind Speed Kph. Domain: Measure Value. |
| 8 | `max_gust_kph` | Max Gust Kph | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Max Gust Kph. Domain: Measure Value. |
| 9 | `weather_condition_code` | Weather Condition Code | Logical | Code | varchar(30) | Yes |  |  |  | Weather Condition Code. Domain: Code. |
| 10 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 11 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.area_statistic

**Area Statistic** (Subtype of Event). One published statistic for one area and period, such as population of a census tract in 2021.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_area_statistic | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `measure_code` | Measure Code | Logical | Reference Code | varchar(30) | No |  | silver.measure.measure_code |  | Measure Code. Domain: Reference Code. |
| 3 | `statistic_value` | Statistic Value | Logical | Measure Value | numeric(18,6) | No |  |  |  | Statistic Value. Domain: Measure Value. |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.economic_indicator

**Economic Indicator** (Subtype of Event). One value of an economic series for a period, such as the Bank of Canada policy rate.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_economic_indicator | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `measure_code` | Measure Code | Logical | Reference Code | varchar(30) | No |  | silver.measure.measure_code |  | Measure Code. Domain: Reference Code. |
| 3 | `indicator_value` | Indicator Value | Logical | Measure Value | numeric(18,6) | No |  |  |  | Indicator Value. Domain: Measure Value. |
| 4 | `period_type_code` | Period Type Code | Logical | Code | varchar(30) | No |  |  |  | Period Type Code. Domain: Code. Monthly, Quarterly, Annual |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

## Transportation

### silver.schedule_version

**Schedule Version** (Reference). One published GTFS schedule file. Every version is kept to judge past trips.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `schedule_version_id` | Schedule Version ID | Logical | Identifier | bigint; identity (by default) | No | pk_schedule_version |  |  | Schedule Version ID. Domain: Identifier. |
| 2 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No |  | silver.source.source_id |  | Source ID. Domain: Reference Code. SRC-004 |
| 3 | `feed_version_label` | Feed Version Label | Logical | Name | varchar(200) | Yes |  |  |  | Feed Version Label. Domain: Name. feed_info.feed_version |
| 4 | `feed_published_date` | Feed Published Date | Logical | Date | date | No |  |  |  | Feed Published Date. Domain: Date. |
| 5 | `service_period_start_date` | Service Period Start Date | Logical | Date | date | No |  |  |  | Service Period Start Date. Domain: Date. |
| 6 | `service_period_end_date` | Service Period End Date | Logical | Date | date | No |  |  |  | Service Period End Date. Domain: Date. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.service_calendar

**Service Calendar** (Reference). A GTFS service pattern: the weekdays a set of trips runs within a version (calendar.txt).

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `schedule_version_id` | Schedule Version ID | Logical | Identifier | bigint | No | pk_service_calendar (2 columns) | silver.schedule_version.schedule_version_id |  | Schedule Version ID. Domain: Identifier. |
| 2 | `service_code` | Service Code | Logical | Source Key | varchar(100) | No | pk_service_calendar (2 columns) |  |  | Service Code. Domain: Source Key. GTFS service_id |
| 3 | `monday_flag` | Monday Flag | Logical | Flag | boolean | No |  |  |  | Monday Flag. Domain: Flag. |
| 4 | `tuesday_flag` | Tuesday Flag | Logical | Flag | boolean | No |  |  |  | Tuesday Flag. Domain: Flag. |
| 5 | `wednesday_flag` | Wednesday Flag | Logical | Flag | boolean | No |  |  |  | Wednesday Flag. Domain: Flag. |
| 6 | `thursday_flag` | Thursday Flag | Logical | Flag | boolean | No |  |  |  | Thursday Flag. Domain: Flag. |
| 7 | `friday_flag` | Friday Flag | Logical | Flag | boolean | No |  |  |  | Friday Flag. Domain: Flag. |
| 8 | `saturday_flag` | Saturday Flag | Logical | Flag | boolean | No |  |  |  | Saturday Flag. Domain: Flag. |
| 9 | `sunday_flag` | Sunday Flag | Logical | Flag | boolean | No |  |  |  | Sunday Flag. Domain: Flag. |
| 10 | `start_date` | Start Date | Logical | Date | date | No |  |  |  | Start Date. Domain: Date. |
| 11 | `end_date` | End Date | Logical | Date | date | No |  |  |  | End Date. Domain: Date. |
| 12 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 13 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.service_calendar_exception

**Service Calendar Exception** (Reference). A date a service pattern is added or removed, such as a holiday (calendar_dates.txt).

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `schedule_version_id` | Schedule Version ID | Logical | Identifier | bigint | No | pk_service_calendar_exception (3 columns) | silver.service_calendar.schedule_version_id |  | Schedule Version ID. Domain: Identifier. |
| 2 | `service_code` | Service Code | Logical | Source Key | varchar(100) | No | pk_service_calendar_exception (3 columns) | silver.service_calendar.service_code |  | Service Code. Domain: Source Key. |
| 3 | `exception_date` | Exception Date | Logical | Date | date | No | pk_service_calendar_exception (3 columns) | silver.calendar_date.calendar_date |  | Exception Date. Domain: Date. Role name of Calendar Date |
| 4 | `exception_type_code` | Exception Type Code | Logical | Code | varchar(30) | No |  |  |  | Exception Type Code. Domain: Code. Added, Removed |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.route

**Route** (Subtype of Asset). A public bus or ferry route.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_route | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `route_short_name` | Route Short Name | Logical | Name | varchar(200) | No |  |  |  | Route Short Name. Domain: Name. 1, 9A, Alderney Ferry |
| 3 | `route_long_name` | Route Long Name | Logical | Name | varchar(200) | Yes |  |  |  | Route Long Name. Domain: Name. |
| 4 | `route_mode_code` | Route Mode Code | Logical | Code | varchar(30) | No |  |  |  | Route Mode Code. Domain: Code. Bus, Ferry |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.stop

**Stop** (Subtype of Asset). A bus stop, ferry terminal or station where riders board.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_stop | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `stop_code` | Stop Code | Logical | Reference Code | varchar(30) | Yes | ak1_stop |  |  | Stop Code. Domain: Reference Code. Public stop number |
| 3 | `stop_name` | Stop Name | Logical | Name | varchar(200) | No |  |  |  | Stop Name. Domain: Name. |
| 4 | `stop_kind_code` | Stop Kind Code | Logical | Code | varchar(30) | No |  |  |  | Stop Kind Code. Domain: Code. Stop, Station, Ferry terminal |
| 5 | `parent_stop_asset_id` | Parent Stop Asset ID | Logical | Identifier | bigint | Yes |  | silver.stop.asset_id |  | Parent Stop Asset ID. Domain: Identifier. Recursive; role name |
| 6 | `wheelchair_boarding_code` | Wheelchair Boarding Code | Logical | Code | varchar(30) | Yes |  |  |  | Wheelchair Boarding Code. Domain: Code. |
| 7 | `shelter_flag` | Shelter Flag | Logical | Flag | boolean | Yes |  |  |  | Shelter Flag. Domain: Flag. From Transit Shelters layer |
| 8 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.vehicle

**Vehicle** (Subtype of Asset). A bus or ferry in the transit fleet.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_vehicle | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `vehicle_label` | Vehicle Label | Logical | Name | varchar(200) | Yes |  |  |  | Vehicle Label. Domain: Name. Fleet number |
| 3 | `vehicle_mode_code` | Vehicle Mode Code | Logical | Code | varchar(30) | No |  |  |  | Vehicle Mode Code. Domain: Code. Bus, Ferry |
| 4 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.route_segment

**Route Segment** (Subtype of Asset). The path between two consecutive stops, shared by every route that uses it.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_route_segment | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `from_stop_asset_id` | From Stop Asset ID | Logical | Identifier | bigint | No | ak1_route_segment (2 columns) | silver.stop.asset_id |  | From Stop Asset ID. Domain: Identifier. Starts at; role name |
| 3 | `to_stop_asset_id` | To Stop Asset ID | Logical | Identifier | bigint | No | ak1_route_segment (2 columns) | silver.stop.asset_id |  | To Stop Asset ID. Domain: Identifier. Ends at; role name |
| 4 | `segment_length_metres` | Segment Length Metres | Logical | Length Metres | numeric(12,2) | Yes |  |  | segment_length_metres >= 0 | Segment Length Metres. Domain: Length Metres. |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.route_segment_sequence

**Route Segment Sequence** (Associative). The ordered segments a route runs through in one direction, per schedule version. Resolves Route made of Route Segment.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `schedule_version_id` | Schedule Version ID | Logical | Identifier | bigint | No | pk_route_segment_sequence (4 columns) | silver.schedule_version.schedule_version_id |  | Schedule Version ID. Domain: Identifier. |
| 2 | `route_asset_id` | Route Asset ID | Logical | Identifier | bigint | No | pk_route_segment_sequence (4 columns) | silver.route.asset_id |  | Route Asset ID. Domain: Identifier. Role name |
| 3 | `direction_code` | Direction Code | Logical | Code | varchar(30) | No | pk_route_segment_sequence (4 columns) |  |  | Direction Code. Domain: Code. 0, 1 |
| 4 | `segment_sequence_number` | Segment Sequence Number | Logical | Count | integer | No | pk_route_segment_sequence (4 columns) |  | segment_sequence_number >= 0 | Segment Sequence Number. Domain: Count. |
| 5 | `route_segment_asset_id` | Route Segment Asset ID | Logical | Identifier | bigint | No |  | silver.route_segment.asset_id |  | Route Segment Asset ID. Domain: Identifier. Role name |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.route_segment_street_segment

**Route Segment Street Segment** (Associative). The street segments a route segment runs along, in order. Resolves Route Segment runs along Street Segment.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `route_segment_asset_id` | Route Segment Asset ID | Logical | Identifier | bigint | No | pk_route_segment_street_segment (2 columns) | silver.route_segment.asset_id |  | Route Segment Asset ID. Domain: Identifier. Role name |
| 2 | `street_segment_location_id` | Street Segment Location ID | Logical | Identifier | bigint | No | pk_route_segment_street_segment (2 columns) | silver.street_segment.location_id |  | Street Segment Location ID. Domain: Identifier. Role name |
| 3 | `path_sequence_number` | Path Sequence Number | Logical | Count | integer | No |  |  | path_sequence_number >= 0 | Path Sequence Number. Domain: Count. |
| 4 | `overlap_length_metres` | Overlap Length Metres | Logical | Length Metres | numeric(12,2) | Yes |  |  | overlap_length_metres >= 0 | Overlap Length Metres. Domain: Length Metres. |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.scheduled_trip

**Scheduled Trip** (Reference). One trip as planned in a schedule version (GTFS trips.txt). It repeats on every day its service runs.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scheduled_trip_id` | Scheduled Trip ID | Logical | Identifier | bigint; identity (by default) | No | pk_scheduled_trip |  |  | Scheduled Trip ID. Domain: Identifier. |
| 2 | `schedule_version_id` | Schedule Version ID | Logical | Identifier | bigint | No | ak1_scheduled_trip (2 columns) | silver.service_calendar.schedule_version_id |  | Schedule Version ID. Domain: Identifier. Part of the FK to Service Calendar |
| 3 | `service_code` | Service Code | Logical | Source Key | varchar(100) | No |  | silver.service_calendar.service_code |  | Service Code. Domain: Source Key. Part of the FK to Service Calendar |
| 4 | `source_trip_key` | Source Trip Key | Logical | Source Key | varchar(100) | No | ak1_scheduled_trip (2 columns) |  |  | Source Trip Key. Domain: Source Key. GTFS trip_id |
| 5 | `route_asset_id` | Route Asset ID | Logical | Identifier | bigint | No |  | silver.route.asset_id |  | Route Asset ID. Domain: Identifier. Role name |
| 6 | `direction_code` | Direction Code | Logical | Code | varchar(30) | No |  |  |  | Direction Code. Domain: Code. 0, 1 |
| 7 | `trip_headsign` | Trip Headsign | Logical | Name | varchar(200) | Yes |  |  |  | Trip Headsign. Domain: Name. |
| 8 | `block_code` | Block Code | Logical | Source Key | varchar(100) | Yes |  |  |  | Block Code. Domain: Source Key. Vehicle duty |
| 9 | `shape_key` | Shape Key | Logical | Source Key | varchar(100) | Yes |  |  |  | Shape Key. Domain: Source Key. GTFS shape_id |
| 10 | `wheelchair_accessible_code` | Wheelchair Accessible Code | Logical | Code | varchar(30) | Yes |  |  |  | Wheelchair Accessible Code. Domain: Code. |
| 11 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 12 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.scheduled_stop_time

**Scheduled Stop Time** (Reference). When a scheduled trip is planned to reach one stop (GTFS stop_times.txt).

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scheduled_trip_id` | Scheduled Trip ID | Logical | Identifier | bigint | No | pk_scheduled_stop_time (2 columns) | silver.scheduled_trip.scheduled_trip_id |  | Scheduled Trip ID. Domain: Identifier. |
| 2 | `stop_sequence_number` | Stop Sequence Number | Logical | Count | integer | No | pk_scheduled_stop_time (2 columns) |  | stop_sequence_number >= 0 | Stop Sequence Number. Domain: Count. |
| 3 | `stop_asset_id` | Stop Asset ID | Logical | Identifier | bigint | No |  | silver.stop.asset_id |  | Stop Asset ID. Domain: Identifier. Role name |
| 4 | `scheduled_arrival_time` | Scheduled Arrival Time | Logical | Service Day Time | interval | Yes |  |  |  | Scheduled Arrival Time. Domain: Service Day Time. Can pass 24:00:00 |
| 5 | `scheduled_departure_time` | Scheduled Departure Time | Logical | Service Day Time | interval | Yes |  |  |  | Scheduled Departure Time. Domain: Service Day Time. |
| 6 | `timepoint_flag` | Timepoint Flag | Logical | Flag | boolean | Yes |  |  |  | Timepoint Flag. Domain: Flag. |
| 7 | `pickup_type_code` | Pickup Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Pickup Type Code. Domain: Code. |
| 8 | `drop_off_type_code` | Drop Off Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Drop Off Type Code. Domain: Code. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.trip

**Trip** (Subtype of Event). One run of a trip on one service date, whether it ran, was cancelled or was added.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_trip | silver.event.event_id |  | Event ID. Domain: Identifier. Event Date = service date |
| 2 | `scheduled_trip_id` | Scheduled Trip ID | Logical | Identifier | bigint | Yes | ak1_trip | silver.scheduled_trip.scheduled_trip_id |  | Scheduled Trip ID. Domain: Identifier. Empty for added trips |
| 3 | `route_asset_id` | Route Asset ID | Logical | Identifier | bigint | No |  | silver.route.asset_id |  | Route Asset ID. Domain: Identifier. Role name; must match the scheduled trip's route |
| 4 | `vehicle_asset_id` | Vehicle Asset ID | Logical | Identifier | bigint | Yes |  | silver.vehicle.asset_id |  | Vehicle Asset ID. Domain: Identifier. Operates; role name |
| 5 | `trip_schedule_status_code` | Trip Schedule Status Code | Logical | Code | varchar(30) | No |  |  |  | Trip Schedule Status Code. Domain: Code. Scheduled, Added, Cancelled |
| 6 | `actual_start_ts` | Actual Start Timestamp | Logical | Timestamp | timestamptz | Yes |  |  |  | Actual Start Timestamp. Domain: Timestamp. Event Start = planned start |
| 7 | `actual_end_ts` | Actual End Timestamp | Logical | Timestamp | timestamptz | Yes |  |  |  | Actual End Timestamp. Domain: Timestamp. |
| 8 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 9 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.stop_arrival

**Stop Arrival** (Subtype of Event). A trip actually reaching a stop on one service date.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_stop_arrival | silver.event.event_id |  | Event ID. Domain: Identifier. Event Start = actual arrival |
| 2 | `trip_event_id` | Trip Event ID | Logical | Identifier | bigint | No | ak1_stop_arrival (2 columns) | silver.trip.event_id |  | Trip Event ID. Domain: Identifier. Role name |
| 3 | `stop_sequence_number` | Stop Sequence Number | Logical | Count | integer | No | ak1_stop_arrival (2 columns) |  | stop_sequence_number >= 0 | Stop Sequence Number. Domain: Count. |
| 4 | `stop_asset_id` | Stop Asset ID | Logical | Identifier | bigint | No |  | silver.stop.asset_id |  | Stop Asset ID. Domain: Identifier. Role name |
| 5 | `actual_departure_ts` | Actual Departure Timestamp | Logical | Timestamp | timestamptz | Yes |  |  |  | Actual Departure Timestamp. Domain: Timestamp. |
| 6 | `reported_delay_seconds` | Reported Delay Seconds | Logical | Count | integer | Yes |  |  |  | Reported Delay Seconds. Domain: Count. As the feed reports it; signed |
| 7 | `arrival_observation_method_code` | Arrival Observation Method Code | Logical | Code | varchar(30) | No |  |  |  | Arrival Observation Method Code. Domain: Code. Reported, Inferred from positions |
| 8 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 9 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.vehicle_position

**Vehicle Position** (Rolled-down event of Event). Where one vehicle was at one moment (GTFS-RT).

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `vehicle_asset_id` | Vehicle Asset ID | Logical | Identifier | bigint | No | pk_vehicle_position (2 columns) | silver.vehicle.asset_id |  | Vehicle that reported the position (logical: Vehicle Asset ID). |
| 2 | `position_ts` | Event Start Timestamp | Logical | Timestamp | timestamptz | No | pk_vehicle_position (2 columns) |  |  | When the position was recorded, UTC (logical: Event Start Timestamp). |
| 3 | `trip_event_id` | Trip Event ID | Logical | Identifier | bigint | Yes |  | silver.trip.event_id |  | Trip being run, empty when not in service (logical: Trip Event ID). |
| 4 | `source_id` | Source ID | Logical | Reference Code | varchar(30) | No |  | silver.source.source_id |  | Feed the position came from (logical: Event.Source ID). |
| 5 | `position_latitude` | Position Latitude | Logical | Latitude | numeric(9,6) | No |  |  | position_latitude BETWEEN -90 AND 90 | Position Latitude. Domain: Latitude. |
| 6 | `position_longitude` | Position Longitude | Logical | Longitude | numeric(9,6) | No |  |  | position_longitude BETWEEN -180 AND 180 | Position Longitude. Domain: Longitude. |
| 7 | `bearing_degrees` | Bearing Degrees | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Bearing Degrees. Domain: Measure Value. |
| 8 | `speed_metres_per_second` | Speed Metres Per Second | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Speed Metres Per Second. Domain: Measure Value. |
| 9 | `current_stop_sequence_number` | Current Stop Sequence Number | Logical | Count | integer | Yes |  |  | current_stop_sequence_number >= 0 | Current Stop Sequence Number. Domain: Count. |
| 10 | `vehicle_stop_status_code` | Vehicle Stop Status Code | Logical | Code | varchar(30) | Yes |  |  |  | Vehicle Stop Status Code. Domain: Code. Incoming, Stopped, In transit |
| 11 | `occupancy_status_code` | Occupancy Status Code | Logical | Code | varchar(30) | Yes |  |  |  | Occupancy Status Code. Domain: Code. |
| 12 | `position_geom` |  | Derived |  | geometry(Point, 4326); generated: ST_SetSRID(ST_MakePoint(position_longitude::float8, position_latitude::float8), 4326) | Yes |  |  |  | (no comment in 07_comments.sql) |
| 13 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | (no comment in 07_comments.sql) |

### silver.service_alert

**Service Alert** (Subtype of Event). A published detour, stop closure or service change (GTFS-RT).

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_service_alert | silver.event.event_id |  | Event ID. Domain: Identifier. Start/End = active period |
| 2 | `alert_cause_code` | Alert Cause Code | Logical | Code | varchar(30) | Yes |  |  |  | Alert Cause Code. Domain: Code. |
| 3 | `alert_effect_code` | Alert Effect Code | Logical | Code | varchar(30) | Yes |  |  |  | Alert Effect Code. Domain: Code. Detour, No service, Stop moved … |
| 4 | `alert_header_text` | Alert Header Text | Logical | Text | varchar(500) | No |  |  |  | Alert Header Text. Domain: Text. |
| 5 | `alert_description_text` | Alert Description Text | Logical | Long Text | text | Yes |  |  |  | Alert Description Text. Domain: Long Text. |
| 6 | `alert_url` | Alert URL | Logical | URL | varchar(500) | Yes |  |  | alert_url ~ '^https?://' | Alert URL. Domain: URL. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.collision

**Collision** (Subtype of Event). One reported traffic collision.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_collision | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `collision_severity_code` | Collision Severity Code | Logical | Code | varchar(30) | No |  |  |  | Collision Severity Code. Domain: Code. Fatal, Injury, Property damage |
| 3 | `vehicle_count` | Vehicle Count | Logical | Count | integer | Yes |  |  | vehicle_count >= 0 | Vehicle Count. Domain: Count. |
| 4 | `pedestrian_involved_flag` | Pedestrian Involved Flag | Logical | Flag | boolean | Yes |  |  |  | Pedestrian Involved Flag. Domain: Flag. |
| 5 | `bicycle_involved_flag` | Bicycle Involved Flag | Logical | Flag | boolean | Yes |  |  |  | Bicycle Involved Flag. Domain: Flag. |
| 6 | `road_surface_condition_code` | Road Surface Condition Code | Logical | Code | varchar(30) | Yes |  |  |  | Road Surface Condition Code. Domain: Code. |
| 7 | `light_condition_code` | Light Condition Code | Logical | Code | varchar(30) | Yes |  |  |  | Light Condition Code. Domain: Code. |
| 8 | `weather_condition_code` | Weather Condition Code | Logical | Code | varchar(30) | Yes |  |  |  | Weather Condition Code. Domain: Code. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.traffic_count

**Traffic Count** (Subtype of Event). One traffic or bicycle count at one location over a study period.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_traffic_count | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `count_type_code` | Count Type Code | Logical | Code | varchar(30) | No |  |  |  | Count Type Code. Domain: Code. Volume, Turning movement, Speed, Classification, Bicycle |
| 3 | `count_direction_code` | Count Direction Code | Logical | Code | varchar(30) | Yes |  |  |  | Count Direction Code. Domain: Code. |
| 4 | `total_volume_count` | Total Volume Count | Logical | Count | integer | Yes |  |  | total_volume_count >= 0 | Total Volume Count. Domain: Count. |
| 5 | `aadt_count` | AADT Count | Logical | Count | integer | Yes |  |  | aadt_count >= 0 | AADT Count. Domain: Count. Annual average daily traffic |
| 6 | `aawt_count` | AAWT Count | Logical | Count | integer | Yes |  |  | aawt_count >= 0 | AAWT Count. Domain: Count. Annual average weekday traffic |
| 7 | `speed_85th_percentile_kph` | Speed 85th Percentile Kph | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Speed 85th Percentile Kph. Domain: Measure Value. |
| 8 | `heavy_vehicle_percent` | Heavy Vehicle Percent | Logical | Percent | numeric(5,2) | Yes |  |  | heavy_vehicle_percent BETWEEN 0 AND 100 | Heavy Vehicle Percent. Domain: Percent. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

## Public Works

### silver.infrastructure_asset

**Infrastructure Asset** (Subtype of Asset). A piece of public infrastructure: road surface, sidewalk, streetlight, sign, hydrant, pipe, tree, park amenity, sampling point.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_infrastructure_asset | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `infrastructure_class_code` | Infrastructure Class Code | Logical | Code | varchar(30) | No |  |  |  | Infrastructure Class Code. Domain: Code. |
| 3 | `material_code` | Material Code | Logical | Code | varchar(30) | Yes |  |  |  | Material Code. Domain: Code. |
| 4 | `condition_rating_code` | Condition Rating Code | Logical | Code | varchar(30) | Yes |  |  |  | Condition Rating Code. Domain: Code. As last reported |
| 5 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.facility

**Facility** (Subtype of Asset). A building or site the city runs: depot, waste facility, treatment plant, terminal, recreation centre.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_facility | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `facility_type_code` | Facility Type Code | Logical | Code | varchar(30) | No |  |  |  | Facility Type Code. Domain: Code. |
| 3 | `capacity_quantity` | Capacity Quantity | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Capacity Quantity. Domain: Measure Value. |
| 4 | `capacity_unit_code` | Capacity Unit Code | Logical | Code | varchar(30) | Yes |  |  |  | Capacity Unit Code. Domain: Code. |
| 5 | `public_access_flag` | Public Access Flag | Logical | Flag | boolean | Yes |  |  |  | Public Access Flag. Domain: Flag. |
| 6 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.service_request

**Service Request** (Subtype of Event). A 311 request from the public. Event End = closed.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_service_request | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `request_type_code` | Request Type Code | Logical | Code | varchar(30) | No |  |  |  | Request Type Code. Domain: Code. |
| 3 | `request_category_code` | Request Category Code | Logical | Code | varchar(30) | Yes |  |  |  | Request Category Code. Domain: Code. |
| 4 | `request_channel_code` | Request Channel Code | Logical | Code | varchar(30) | Yes |  |  |  | Request Channel Code. Domain: Code. Phone, Web, App |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.work_order

**Work Order** (Subtype of Event). A job to inspect, repair or maintain an infrastructure asset.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_work_order | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `service_request_event_id` | Service Request Event ID | Logical | Identifier | bigint | Yes |  | silver.service_request.event_id |  | Service Request Event ID. Domain: Identifier. Results in; role name |
| 3 | `capital_project_event_id` | Capital Project Event ID | Logical | Identifier | bigint | Yes |  | silver.capital_project.event_id |  | Capital Project Event ID. Domain: Identifier. Includes; role name |
| 4 | `infrastructure_asset_id` | Infrastructure Asset ID | Logical | Identifier | bigint | No |  | silver.infrastructure_asset.asset_id |  | Infrastructure Asset ID. Domain: Identifier. Repairs; role name |
| 5 | `work_type_code` | Work Type Code | Logical | Code | varchar(30) | No |  |  |  | Work Type Code. Domain: Code. |
| 6 | `work_priority_code` | Work Priority Code | Logical | Code | varchar(30) | Yes |  |  |  | Work Priority Code. Domain: Code. |
| 7 | `planned_date` | Planned Date | Logical | Date | date | Yes |  |  |  | Planned Date. Domain: Date. |
| 8 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 9 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.capital_project

**Capital Project** (Subtype of Event). A funded construction or renewal project. Event Start/End = actual dates.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_capital_project | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `project_name` | Project Name | Logical | Name | varchar(200) | No |  |  |  | Project Name. Domain: Name. |
| 3 | `capital_project_type_code` | Capital Project Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Capital Project Type Code. Domain: Code. |
| 4 | `budget_amount` | Budget Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Budget Amount. Domain: Amount. CAD |
| 5 | `actual_cost_amount` | Actual Cost Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Actual Cost Amount. Domain: Amount. CAD |
| 6 | `planned_start_date` | Planned Start Date | Logical | Date | date | Yes |  |  |  | Planned Start Date. Domain: Date. |
| 7 | `planned_end_date` | Planned End Date | Logical | Date | date | Yes |  |  |  | Planned End Date. Domain: Date. |
| 8 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 9 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.road_closure

**Road Closure** (Subtype of Event). A full or partial closure of streets for a period. Closed segments are in Event Coverage.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_road_closure | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `capital_project_event_id` | Capital Project Event ID | Logical | Identifier | bigint | Yes |  | silver.capital_project.event_id |  | Capital Project Event ID. Domain: Identifier. Causes; role name |
| 3 | `development_project_event_id` | Development Project Event ID | Logical | Identifier | bigint | Yes |  | silver.development_project.event_id |  | Development Project Event ID. Domain: Identifier. Causes; role name (new) |
| 4 | `closure_type_code` | Closure Type Code | Logical | Code | varchar(30) | No |  |  |  | Closure Type Code. Domain: Code. Full, Partial, Lane, Sidewalk |
| 5 | `closure_reason_code` | Closure Reason Code | Logical | Code | varchar(30) | Yes |  |  |  | Closure Reason Code. Domain: Code. |
| 6 | `detour_description` | Detour Description | Logical | Description | varchar(2000) | Yes |  |  |  | Detour Description. Domain: Description. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.snow_clearing

**Snow Clearing** (Subtype of Event). One plowing, salting or sidewalk-clearing pass on a street segment.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_snow_clearing | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `clearing_activity_code` | Clearing Activity Code | Logical | Code | varchar(30) | No |  |  |  | Clearing Activity Code. Domain: Code. Plow, Salt, Sand, Sidewalk |
| 3 | `clearing_priority_code` | Clearing Priority Code | Logical | Code | varchar(30) | Yes |  |  |  | Clearing Priority Code. Domain: Code. |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.pavement_condition_assessment

**Pavement Condition Assessment** (Subtype of Event). A rating of one street segment's pavement.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_pavement_condition_assessment | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `pavement_condition_index` | Pavement Condition Index | Logical | Measure Value | numeric(18,6) | Yes |  |  |  | Pavement Condition Index. Domain: Measure Value. 0 to 100 |
| 3 | `condition_rating_code` | Condition Rating Code | Logical | Code | varchar(30) | Yes |  |  |  | Condition Rating Code. Domain: Code. |
| 4 | `assessment_method_code` | Assessment Method Code | Logical | Code | varchar(30) | Yes |  |  |  | Assessment Method Code. Domain: Code. |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.waste_collection

**Waste Collection** (Subtype of Event). One scheduled garbage, recycling or organics pickup at a civic address.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_waste_collection | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `waste_stream_code` | Waste Stream Code | Logical | Code | varchar(30) | No |  |  |  | Waste Stream Code. Domain: Code. Garbage, Recycling, Organics |
| 3 | `scheduled_collection_date` | Scheduled Collection Date | Logical | Date | date | No |  | silver.calendar_date.calendar_date |  | Scheduled Collection Date. Domain: Date. Role name of Calendar Date |
| 4 | `collection_outcome_code` | Collection Outcome Code | Logical | Code | varchar(30) | No |  |  |  | Collection Outcome Code. Domain: Code. Collected, Missed, Late |
| 5 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 6 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.waste_tonnage_record

**Waste Tonnage Record** (Subtype of Event). Tonnes of one waste stream received at a facility in a period.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_waste_tonnage_record | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `facility_asset_id` | Facility Asset ID | Logical | Identifier | bigint | No |  | silver.facility.asset_id |  | Facility Asset ID. Domain: Identifier. Recorded at; role name |
| 3 | `waste_stream_code` | Waste Stream Code | Logical | Code | varchar(30) | No |  |  |  | Waste Stream Code. Domain: Code. |
| 4 | `disposal_destination_code` | Disposal Destination Code | Logical | Code | varchar(30) | No |  |  |  | Disposal Destination Code. Domain: Code. Landfill, Recycling, Compost |
| 5 | `tonnage_quantity` | Tonnage Quantity | Logical | Measure Value | numeric(18,6) | No |  |  |  | Tonnage Quantity. Domain: Measure Value. Tonnes |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.water_quality_reading

**Water Quality Reading** (Subtype of Event). One lab or sensor reading of one water quality measure at a sampling point.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_water_quality_reading | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `infrastructure_asset_id` | Infrastructure Asset ID | Logical | Identifier | bigint | No |  | silver.infrastructure_asset.asset_id |  | Infrastructure Asset ID. Domain: Identifier. Sampled at; role name |
| 3 | `measure_code` | Measure Code | Logical | Reference Code | varchar(30) | No |  | silver.measure.measure_code |  | Measure Code. Domain: Reference Code. |
| 4 | `reading_value` | Reading Value | Logical | Measure Value | numeric(18,6) | No |  |  |  | Reading Value. Domain: Measure Value. |
| 5 | `exceedance_flag` | Exceedance Flag | Logical | Flag | boolean | Yes |  |  |  | Exceedance Flag. Domain: Flag. Above guideline |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.utility_outage

**Utility Outage** (Subtype of Event). A loss of electricity, water or wastewater service. Affected areas are in Event Coverage.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_utility_outage | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `utility_type_code` | Utility Type Code | Logical | Code | varchar(30) | No |  |  |  | Utility Type Code. Domain: Code. Electricity, Water, Wastewater, Gas |
| 3 | `customers_affected_count` | Customers Affected Count | Logical | Count | integer | Yes |  |  | customers_affected_count >= 0 | Customers Affected Count. Domain: Count. |
| 4 | `outage_cause_code` | Outage Cause Code | Logical | Code | varchar(30) | Yes |  |  |  | Outage Cause Code. Domain: Code. |
| 5 | `estimated_restoration_ts` | Estimated Restoration Timestamp | Logical | Timestamp | timestamptz | Yes |  |  |  | Estimated Restoration Timestamp. Domain: Timestamp. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.public_advisory

**Public Advisory** (Subtype of Event). A public notice such as a boil-water advisory or winter parking ban. Covered areas are in Event Coverage.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_public_advisory | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `advisory_type_code` | Advisory Type Code | Logical | Code | varchar(30) | No |  |  |  | Advisory Type Code. Domain: Code. |
| 3 | `advisory_severity_code` | Advisory Severity Code | Logical | Code | varchar(30) | Yes |  |  |  | Advisory Severity Code. Domain: Code. |
| 4 | `advisory_text` | Advisory Text | Logical | Long Text | text | Yes |  |  |  | Advisory Text. Domain: Long Text. |
| 5 | `advisory_url` | Advisory URL | Logical | URL | varchar(500) | Yes |  |  | advisory_url ~ '^https?://' | Advisory URL. Domain: URL. |
| 6 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 7 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

## Housing & Real Estate

### silver.building

**Building** (Subtype of Asset). A structure on a parcel. Its Asset Location is the parcel it sits on.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_building | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `building_use_code` | Building Use Code | Logical | Code | varchar(30) | Yes |  |  |  | Building Use Code. Domain: Code. Residential, Commercial, Mixed … |
| 3 | `building_type_code` | Building Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Building Type Code. Domain: Code. Detached, Row, Apartment … |
| 4 | `year_built` | Year Built | Logical | Year | smallint | Yes |  |  | year_built BETWEEN 1700 AND 2100 | Year Built. Domain: Year. |
| 5 | `storey_count` | Storey Count | Logical | Count | integer | Yes |  |  | storey_count >= 0 | Storey Count. Domain: Count. |
| 6 | `gross_floor_area_square_metres` | Gross Floor Area Square Metres | Logical | Area Square Metres | numeric(12,2) | Yes |  |  | gross_floor_area_square_metres >= 0 | Gross Floor Area Square Metres. Domain: Area Square Metres. |
| 7 | `reported_unit_count` | Reported Unit Count | Logical | Count | integer | Yes |  |  | reported_unit_count >= 0 | Reported Unit Count. Domain: Count. As the source states it |
| 8 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.dwelling_unit

**Dwelling Unit** (Subtype of Asset). One home inside a building: a house, apartment or suite.

History: SCD Type 2.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asset_id` | Asset ID | Logical | Identifier | bigint | No | pk_dwelling_unit | silver.asset.asset_id |  | Asset ID. Domain: Identifier. |
| 2 | `building_asset_id` | Building Asset ID | Logical | Identifier | bigint | No |  | silver.building.asset_id |  | Building Asset ID. Domain: Identifier. Contains; role name |
| 3 | `unit_number` | Unit Number | Logical | Reference Code | varchar(30) | Yes |  |  |  | Unit Number. Domain: Reference Code. |
| 4 | `dwelling_type_code` | Dwelling Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Dwelling Type Code. Domain: Code. |
| 5 | `bedroom_count` | Bedroom Count | Logical | Count | integer | Yes |  |  | bedroom_count >= 0 | Bedroom Count. Domain: Count. |
| 6 | `tenure_code` | Tenure Code | Logical | Code | varchar(30) | Yes |  |  |  | Tenure Code. Domain: Code. Owner, Rental, Social, Student |
| 7 | `floor_area_square_metres` | Floor Area Square Metres | Logical | Area Square Metres | numeric(12,2) | Yes |  |  | floor_area_square_metres >= 0 | Floor Area Square Metres. Domain: Area Square Metres. |
| 8 | `valid_from_ts` |  | SCD2 |  | timestamptz; default now() | No |  |  |  | SCD2: when this version of the row became current. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.property_sale

**Property Sale** (Subtype of Event). A recorded sale of a parcel. Buyer and seller are not kept.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_property_sale | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `sale_price_amount` | Sale Price Amount | Logical | Amount | numeric(15,2) | No |  |  |  | Sale Price Amount. Domain: Amount. CAD |
| 3 | `sale_type_code` | Sale Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Sale Type Code. Domain: Code. Arm's length, Non arm's length |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.property_assessment

**Property Assessment** (Subtype of Event). The PVSC assessed value of a property for one assessment year.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_property_assessment | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `assessment_year` | Assessment Year | Logical | Year | smallint | No |  |  | assessment_year BETWEEN 1700 AND 2100 | Assessment Year. Domain: Year. |
| 3 | `assessment_account_number` | Assessment Account Number | Logical | Reference Code | varchar(30) | No |  |  |  | Assessment Account Number. Domain: Reference Code. PVSC AAN |
| 4 | `assessment_class_code` | Assessment Class Code | Logical | Code | varchar(30) | No |  |  |  | Assessment Class Code. Domain: Code. Residential, Commercial, Resource |
| 5 | `land_value_amount` | Land Value Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Land Value Amount. Domain: Amount. CAD |
| 6 | `building_value_amount` | Building Value Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Building Value Amount. Domain: Amount. CAD |
| 7 | `assessed_value_amount` | Assessed Value Amount | Logical | Amount | numeric(15,2) | No |  |  |  | Assessed Value Amount. Domain: Amount. CAD, as published |
| 8 | `capped_assessed_value_amount` | Capped Assessed Value Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Capped Assessed Value Amount. Domain: Amount. CAD, Nova Scotia CAP |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.building_permit

**Building Permit** (Subtype of Event). A permit issued for new construction, alteration or demolition on a parcel.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_building_permit | silver.event.event_id |  | Event ID. Domain: Identifier. Event Start = issued |
| 2 | `development_project_event_id` | Development Project Event ID | Logical | Identifier | bigint | Yes |  | silver.development_project.event_id |  | Development Project Event ID. Domain: Identifier. Has; role name |
| 3 | `building_asset_id` | Building Asset ID | Logical | Identifier | bigint | Yes |  | silver.building.asset_id |  | Building Asset ID. Domain: Identifier. Authorizes; role name |
| 4 | `permit_type_code` | Permit Type Code | Logical | Code | varchar(30) | No |  |  |  | Permit Type Code. Domain: Code. New, Alteration, Demolition |
| 5 | `work_description` | Work Description | Logical | Description | varchar(2000) | Yes |  |  |  | Work Description. Domain: Description. |
| 6 | `construction_value_amount` | Construction Value Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Construction Value Amount. Domain: Amount. CAD |
| 7 | `units_created_count` | Units Created Count | Logical | Count | integer | Yes |  |  | units_created_count >= 0 | Units Created Count. Domain: Count. |
| 8 | `units_removed_count` | Units Removed Count | Logical | Count | integer | Yes |  |  | units_removed_count >= 0 | Units Removed Count. Domain: Count. |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.rental_market_observation

**Rental Market Observation** (Subtype of Event). CMHC rental survey results for one zone, unit type and survey date.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_rental_market_observation | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `bedroom_type_code` | Bedroom Type Code | Logical | Code | varchar(30) | No |  |  |  | Bedroom Type Code. Domain: Code. Bachelor, 1, 2, 3+, Total |
| 3 | `structure_type_code` | Structure Type Code | Logical | Code | varchar(30) | No |  |  |  | Structure Type Code. Domain: Code. Row, Apartment |
| 4 | `vacancy_rate_percent` | Vacancy Rate Percent | Logical | Percent | numeric(5,2) | Yes |  |  | vacancy_rate_percent BETWEEN 0 AND 100 | Vacancy Rate Percent. Domain: Percent. |
| 5 | `average_rent_amount` | Average Rent Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Average Rent Amount. Domain: Amount. CAD per month |
| 6 | `median_rent_amount` | Median Rent Amount | Logical | Amount | numeric(15,2) | Yes |  |  |  | Median Rent Amount. Domain: Amount. CAD per month |
| 7 | `universe_unit_count` | Universe Unit Count | Logical | Count | integer | Yes |  |  | universe_unit_count >= 0 | Universe Unit Count. Domain: Count. |
| 8 | `data_reliability_code` | Data Reliability Code | Logical | Code | varchar(30) | Yes |  |  |  | Data Reliability Code. Domain: Code. CMHC a to d |
| 9 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 10 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.short_term_rental_registration

**Short-Term Rental Registration** (Subtype of Event). A dwelling unit registered for short-term rental for a period. The host is not kept.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_short_term_rental_registration | silver.event.event_id |  | Event ID. Domain: Identifier. Start/End = valid period |
| 2 | `dwelling_unit_asset_id` | Dwelling Unit Asset ID | Logical | Identifier | bigint | No |  | silver.dwelling_unit.asset_id |  | Dwelling Unit Asset ID. Domain: Identifier. Registers; role name |
| 3 | `registration_type_code` | Registration Type Code | Logical | Code | varchar(30) | No |  |  |  | Registration Type Code. Domain: Code. Primary residence, Commercial |
| 4 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 5 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

### silver.development_project

**Development Project** (Subtype of Event). A planning application or development on one or more parcels. Extra parcels are in Event Coverage.

History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | Event ID | Logical | Identifier | bigint | No | pk_development_project | silver.event.event_id |  | Event ID. Domain: Identifier. |
| 2 | `project_name` | Project Name | Logical | Name | varchar(200) | Yes |  |  |  | Project Name. Domain: Name. |
| 3 | `development_type_code` | Development Type Code | Logical | Code | varchar(30) | Yes |  |  |  | Development Type Code. Domain: Code. |
| 4 | `proposed_unit_count` | Proposed Unit Count | Logical | Count | integer | Yes |  |  | proposed_unit_count >= 0 | Proposed Unit Count. Domain: Count. |
| 5 | `affordable_unit_count` | Affordable Unit Count | Logical | Count | integer | Yes |  |  | affordable_unit_count >= 0 | Affordable Unit Count. Domain: Count. |
| 6 | `approval_date` | Approval Date | Logical | Date | date | Yes |  |  |  | Approval Date. Domain: Date. |
| 7 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | Audit: when the row was last loaded or changed. |
| 8 | `dw_batch_id` |  | Audit |  | bigint | Yes |  |  |  | Audit: load batch that wrote the row. |

## Bronze

### bronze.feed_fetch



History: None.

| # | Column | Attribute | Class | Domain | Type | Null | Keys | References | Check | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `fetch_id` |  | Register |  | bigint; identity (always) | No | pk_feed_fetch |  |  | (no column comment in 06_bronze_register.sql) |
| 2 | `source_id` |  | Register |  | varchar(30) | No |  | silver.source.source_id |  | (no column comment in 06_bronze_register.sql) |
| 3 | `fetched_ts` |  | Register |  | timestamptz | No |  |  |  | (no column comment in 06_bronze_register.sql) |
| 4 | `http_status` |  | Register |  | smallint | No |  |  |  | (no column comment in 06_bronze_register.sql) |
| 5 | `feed_header_ts` |  | Register |  | timestamptz | Yes |  |  |  | Timestamp inside the GTFS-RT header; equal values in a row mean the feed did not refresh. |
| 6 | `entity_count` |  | Register |  | integer | Yes |  |  | entity_count >= 0 | (no column comment in 06_bronze_register.sql) |
| 7 | `file_path` |  | Register |  | text | Yes |  |  |  | (no column comment in 06_bronze_register.sql) |
| 8 | `file_bytes` |  | Register |  | integer | Yes |  |  | file_bytes >= 0 | (no column comment in 06_bronze_register.sql) |
| 9 | `file_sha256` |  | Register |  | char(64) | Yes |  |  |  | Fingerprint of the raw file; repeats show identical downloads. |
| 10 | `error_text` |  | Register |  | text | Yes |  |  |  | (no column comment in 06_bronze_register.sql) |
| 11 | `dw_loaded_ts` |  | Audit |  | timestamptz; default now() | No |  |  |  | (no column comment in 06_bronze_register.sql) |
