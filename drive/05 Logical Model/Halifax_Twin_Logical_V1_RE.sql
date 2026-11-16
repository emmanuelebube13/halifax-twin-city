/* Halifax Digital Twin - Logical Model V1 - reverse-engineering script
   Dialect: SQL Server (T-SQL). Names in [brackets] keep their spaces, so erwin's
   logical names come out exactly as in the spec (Street Segment, Location ID).
   Physical snake_case names are generated later in step 9 with erwin naming standards.
   63 tables. Primary keys inline, alternate keys as UNIQUE (AK1, AK2),
   all foreign keys at the end so table order does not matter.
   The comment on each column names its logical domain from the Domains tab. */

/* ===================== CORE ===================== */
/* Reference: One of the 17 city sectors from the Domain Map (S01 to S17). */
CREATE TABLE [Sector] (
    [Sector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Sector Name] varchar(200) NOT NULL,  -- domain: Name
    [Sector Description] varchar(2000) NULL,  -- domain: Description
    [Phase Number] int NULL,  -- domain: Count
    CONSTRAINT [PK_Sector] PRIMARY KEY ([Sector ID])
);

/* Reference: One subsector from the Domain Map, such as TRN-01 Passenger Transportation. */
CREATE TABLE [Subsector] (
    [Subsector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Sector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Subsector Name] varchar(200) NOT NULL,  -- domain: Name
    CONSTRAINT [PK_Subsector] PRIMARY KEY ([Subsector ID])
);

/* Reference: One dataset or feed the twin loads, from the Source Inventory. */
CREATE TABLE [Source] (
    [Source ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Publisher Party ID] bigint NOT NULL,  -- domain: Identifier
    [Dataset Name] varchar(200) NOT NULL,  -- domain: Name
    [Source Format Code] varchar(30) NOT NULL,  -- domain: Code
    [Access Method Code] varchar(30) NOT NULL,  -- domain: Code
    [Cadence Code] varchar(30) NULL,  -- domain: Code
    [Availability Code] varchar(30) NOT NULL,  -- domain: Code
    [Licence Name] varchar(200) NOT NULL,  -- domain: Name
    [Attribution Required Flag] bit NOT NULL,  -- domain: Flag
    [Record Grain Description] varchar(2000) NOT NULL,  -- domain: Description
    [Source URL] varchar(500) NOT NULL,  -- domain: URL
    [Reliability Tier Code] varchar(30) NOT NULL,  -- domain: Code
    [Source Status Code] varchar(30) NOT NULL,  -- domain: Code
    [Last Checked Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Source] PRIMARY KEY ([Source ID])
);

/* Reference: One calendar day, used for the date an event occurs on. */
CREATE TABLE [Calendar Date] (
    [Calendar Date] date NOT NULL,  -- domain: Date
    [Calendar Year] smallint NOT NULL,  -- domain: Year
    [Quarter Number] int NOT NULL,  -- domain: Count
    [Month Number] int NOT NULL,  -- domain: Count
    [Week Of Year Number] int NOT NULL,  -- domain: Count
    [Day Of Week Name] varchar(200) NOT NULL,  -- domain: Name
    [Weekend Flag] bit NOT NULL,  -- domain: Flag
    [Statutory Holiday Flag] bit NOT NULL,  -- domain: Flag
    [Holiday Name] varchar(200) NULL,  -- domain: Name
    [Season Name] varchar(200) NOT NULL,  -- domain: Name
    CONSTRAINT [PK_Calendar_Date] PRIMARY KEY ([Calendar Date])
);

/* Reference: Something that is counted or measured, with its unit, such as median household income or E. coli count. */
CREATE TABLE [Measure] (
    [Measure Code] varchar(30) NOT NULL,  -- domain: Reference Code
    [Measure Name] varchar(200) NOT NULL,  -- domain: Name
    [Unit Of Measure Code] varchar(30) NOT NULL,  -- domain: Code
    [Measure Description] varchar(2000) NULL,  -- domain: Description
    CONSTRAINT [PK_Measure] PRIMARY KEY ([Measure Code])
);

/* Supertype: Any place in the city: a point, line, area, service area or citywide. */
CREATE TABLE [Location] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Location Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Location Name] varchar(200) NULL,  -- domain: Name
    [Geometry Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Location Geometry] varchar(max) NULL,  -- domain: Geometry
    [Centroid Latitude] decimal(9,6) NULL,  -- domain: Latitude
    [Centroid Longitude] decimal(9,6) NULL,  -- domain: Longitude
    [Source ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Source Location Key] varchar(100) NOT NULL,  -- domain: Source Key
    [Start Date] date NULL,  -- domain: Date
    [End Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Location] PRIMARY KEY ([Location ID]),
    CONSTRAINT [AK1_Location] UNIQUE ([Source ID], [Source Location Key])
);

/* Subtype of Location: A named street, made up of street segments. */
CREATE TABLE [Street] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Street Name] varchar(200) NOT NULL,  -- domain: Name
    [Street Type Code] varchar(30) NULL,  -- domain: Code
    [Street Direction Code] varchar(30) NULL,  -- domain: Code
    [Road Jurisdiction Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Street] PRIMARY KEY ([Location ID])
);

/* Subtype of Location: The stretch of one street between two intersections. */
CREATE TABLE [Street Segment] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Street Location ID] bigint NOT NULL,  -- domain: Identifier
    [From Intersection Location ID] bigint NULL,  -- domain: Identifier
    [To Intersection Location ID] bigint NULL,  -- domain: Identifier
    [Segment Length Metres] decimal(12,2) NULL,  -- domain: Length Metres
    [Road Class Code] varchar(30) NULL,  -- domain: Code
    [Speed Limit Kph] int NULL,  -- domain: Count
    [Lane Count] int NULL,  -- domain: Count
    [One Way Flag] bit NULL,  -- domain: Flag
    CONSTRAINT [PK_Street_Segment] PRIMARY KEY ([Location ID])
);

/* Subtype of Location: A point where two or more street segments meet. */
CREATE TABLE [Intersection] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Intersection Name] varchar(200) NULL,  -- domain: Name
    [Traffic Control Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Intersection] PRIMARY KEY ([Location ID])
);

/* Subtype of Location: A bounded area: neighbourhood, census tract, council district, CMHC zone, snow or waste zone, zoning zone. */
CREATE TABLE [Area] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Area Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Area Code] varchar(30) NULL,  -- domain: Code
    [Parent Area Location ID] bigint NULL,  -- domain: Identifier
    [Area Square Km] decimal(12,2) NULL,  -- domain: Area Square Km
    CONSTRAINT [PK_Area] PRIMARY KEY ([Location ID])
);

/* Subtype of Location: A civic number on a street, located on one parcel. */
CREATE TABLE [Civic Address] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Street Location ID] bigint NOT NULL,  -- domain: Identifier
    [Parcel Location ID] bigint NOT NULL,  -- domain: Identifier
    [Civic Number] int NOT NULL,  -- domain: Count
    [Civic Number Suffix] varchar(30) NULL,  -- domain: Code
    [Postal Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Civic_Address] PRIMARY KEY ([Location ID])
);

/* Subtype of Location: A legal land parcel, identified by its Nova Scotia PID. */
CREATE TABLE [Parcel] (
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Parcel PID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Parcel Area Square Metres] decimal(12,2) NULL,  -- domain: Area Square Metres
    [Land Use Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Parcel] PRIMARY KEY ([Location ID]),
    CONSTRAINT [AK2_Parcel] UNIQUE ([Parcel PID])
);

/* Associative: One location lying inside or overlapping another, such as a parcel inside a neighbourhood. Resolves the Street Segment–Area and Area–Parcel many-to-many lines. */
CREATE TABLE [Location Containment] (
    [Containing Location ID] bigint NOT NULL,  -- domain: Identifier
    [Contained Location ID] bigint NOT NULL,  -- domain: Identifier
    [Overlap Percent] decimal(5,2) NULL,  -- domain: Percent
    [Containment Method Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Location_Containment] PRIMARY KEY ([Containing Location ID], [Contained Location ID])
);

/* Supertype: An organization that owns, operates, publishes or takes part in something. People are reserved for a later phase. */
CREATE TABLE [Party] (
    [Party ID] bigint NOT NULL,  -- domain: Identifier
    [Party Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Party Name] varchar(200) NOT NULL,  -- domain: Name
    [Source ID] varchar(30) NULL,  -- domain: Reference Code
    [Source Party Key] varchar(100) NULL,  -- domain: Source Key
    CONSTRAINT [PK_Party] PRIMARY KEY ([Party ID]),
    CONSTRAINT [AK1_Party] UNIQUE ([Source ID], [Source Party Key])
);

/* Subtype of Party: A government body, agency, utility, company or non-profit. */
CREATE TABLE [Organization] (
    [Party ID] bigint NOT NULL,  -- domain: Identifier
    [Organization Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Legal Name] varchar(200) NULL,  -- domain: Name
    [Business Number] varchar(30) NULL,  -- domain: Reference Code
    [Website URL] varchar(500) NULL,  -- domain: URL
    CONSTRAINT [PK_Organization] PRIMARY KEY ([Party ID])
);

/* Associative: The subsectors a party works in. Replaces Sector classifies Party. */
CREATE TABLE [Party Sector Classification] (
    [Party ID] bigint NOT NULL,  -- domain: Identifier
    [Subsector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Primary Classification Flag] bit NOT NULL,  -- domain: Flag
    CONSTRAINT [PK_Party_Sector_Classification] PRIMARY KEY ([Party ID], [Subsector ID])
);

/* Supertype: A physical thing the city depends on: route, stop, vehicle, road asset, facility, building, dwelling unit. */
CREATE TABLE [Asset] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Asset Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Asset Name] varchar(200) NULL,  -- domain: Name
    [Location ID] bigint NULL,  -- domain: Identifier
    [Subsector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Source ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Source Asset Key] varchar(100) NOT NULL,  -- domain: Source Key
    [Asset Status Code] varchar(30) NOT NULL,  -- domain: Code
    [In Service Date] date NULL,  -- domain: Date
    [Out Of Service Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Asset] PRIMARY KEY ([Asset ID]),
    CONSTRAINT [AK1_Asset] UNIQUE ([Source ID], [Source Asset Key])
);

/* Associative: A party owning, operating or maintaining an asset for a period. Replaces Party owns/operates Asset. */
CREATE TABLE [Party Asset Role] (
    [Party ID] bigint NOT NULL,  -- domain: Identifier
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Asset Role Code] varchar(30) NOT NULL,  -- domain: Code
    [Role Start Date] date NOT NULL,  -- domain: Date
    [Role End Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Party_Asset_Role] PRIMARY KEY ([Party ID], [Asset ID], [Asset Role Code], [Role Start Date])
);

/* Supertype: Something that happens at a place and time and is reported by a source: a trip, a repair, a sale, a reading. */
CREATE TABLE [Event] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Event Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Event Start Timestamp] datetime2(3) NOT NULL,  -- domain: Timestamp
    [Event End Timestamp] datetime2(3) NULL,  -- domain: Timestamp
    [Event Date] date NOT NULL,  -- domain: Date
    [Location ID] bigint NULL,  -- domain: Identifier
    [Subsector ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Source ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Source Event Key] varchar(100) NOT NULL,  -- domain: Source Key
    [Event Status Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Event] PRIMARY KEY ([Event ID]),
    CONSTRAINT [AK1_Event] UNIQUE ([Source ID], [Source Event Key])
);

/* Associative: An asset taking part in an event in a named role, such as a route affected by a service alert. Replaces Event involves Asset and Service Alert affects Route/Stop. */
CREATE TABLE [Event Asset Involvement] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Involvement Role Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Event_Asset_Involvement] PRIMARY KEY ([Event ID], [Asset ID], [Involvement Role Code])
);

/* Associative: A party taking part in an event in a named role, such as the contractor on a work order. Replaces Event involves Party. */
CREATE TABLE [Event Party Involvement] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Party ID] bigint NOT NULL,  -- domain: Identifier
    [Involvement Role Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Event_Party_Involvement] PRIMARY KEY ([Event ID], [Party ID], [Involvement Role Code])
);

/* Associative: Extra locations an event covers beyond its main one, such as every street segment in a road closure. Replaces Road Closure on Street Segment, Utility Outage affects Area, Public Advisory covers Area. */
CREATE TABLE [Event Coverage] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Location ID] bigint NOT NULL,  -- domain: Identifier
    [Coverage Role Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Event_Coverage] PRIMARY KEY ([Event ID], [Location ID], [Coverage Role Code])
);

/* Subtype of Event: Weather recorded for an area over one hour or one day. */
CREATE TABLE [Weather Observation] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Observation Interval Code] varchar(30) NOT NULL,  -- domain: Code
    [Air Temperature Celsius] decimal(18,6) NULL,  -- domain: Measure Value
    [Precipitation Mm] decimal(18,6) NULL,  -- domain: Measure Value
    [Snowfall Cm] decimal(18,6) NULL,  -- domain: Measure Value
    [Snow On Ground Cm] decimal(18,6) NULL,  -- domain: Measure Value
    [Mean Wind Speed Kph] decimal(18,6) NULL,  -- domain: Measure Value
    [Max Gust Kph] decimal(18,6) NULL,  -- domain: Measure Value
    [Weather Condition Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Weather_Observation] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One published statistic for one area and period, such as population of a census tract in 2021. */
CREATE TABLE [Area Statistic] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Measure Code] varchar(30) NOT NULL,  -- domain: Reference Code
    [Statistic Value] decimal(18,6) NOT NULL,  -- domain: Measure Value
    CONSTRAINT [PK_Area_Statistic] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One value of an economic series for a period, such as the Bank of Canada policy rate. */
CREATE TABLE [Economic Indicator] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Measure Code] varchar(30) NOT NULL,  -- domain: Reference Code
    [Indicator Value] decimal(18,6) NOT NULL,  -- domain: Measure Value
    [Period Type Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Economic_Indicator] PRIMARY KEY ([Event ID])
);

/* ===================== TRANSPORTATION ===================== */
/* Reference: One published GTFS schedule file. Every version is kept to judge past trips. */
CREATE TABLE [Schedule Version] (
    [Schedule Version ID] bigint NOT NULL,  -- domain: Identifier
    [Source ID] varchar(30) NOT NULL,  -- domain: Reference Code
    [Feed Version Label] varchar(200) NULL,  -- domain: Name
    [Feed Published Date] date NOT NULL,  -- domain: Date
    [Service Period Start Date] date NOT NULL,  -- domain: Date
    [Service Period End Date] date NOT NULL,  -- domain: Date
    CONSTRAINT [PK_Schedule_Version] PRIMARY KEY ([Schedule Version ID])
);

/* Reference: A GTFS service pattern: the weekdays a set of trips runs within a version (calendar.txt). */
CREATE TABLE [Service Calendar] (
    [Schedule Version ID] bigint NOT NULL,  -- domain: Identifier
    [Service Code] varchar(100) NOT NULL,  -- domain: Source Key
    [Monday Flag] bit NOT NULL,  -- domain: Flag
    [Tuesday Flag] bit NOT NULL,  -- domain: Flag
    [Wednesday Flag] bit NOT NULL,  -- domain: Flag
    [Thursday Flag] bit NOT NULL,  -- domain: Flag
    [Friday Flag] bit NOT NULL,  -- domain: Flag
    [Saturday Flag] bit NOT NULL,  -- domain: Flag
    [Sunday Flag] bit NOT NULL,  -- domain: Flag
    [Start Date] date NOT NULL,  -- domain: Date
    [End Date] date NOT NULL,  -- domain: Date
    CONSTRAINT [PK_Service_Calendar] PRIMARY KEY ([Schedule Version ID], [Service Code])
);

/* Reference: A date a service pattern is added or removed, such as a holiday (calendar_dates.txt). */
CREATE TABLE [Service Calendar Exception] (
    [Schedule Version ID] bigint NOT NULL,  -- domain: Identifier
    [Service Code] varchar(100) NOT NULL,  -- domain: Source Key
    [Exception Date] date NOT NULL,  -- domain: Date
    [Exception Type Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Service_Calendar_Exception] PRIMARY KEY ([Schedule Version ID], [Service Code], [Exception Date])
);

/* Subtype of Asset: A public bus or ferry route. */
CREATE TABLE [Route] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Route Short Name] varchar(200) NOT NULL,  -- domain: Name
    [Route Long Name] varchar(200) NULL,  -- domain: Name
    [Route Mode Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Route] PRIMARY KEY ([Asset ID])
);

/* Subtype of Asset: A bus stop, ferry terminal or station where riders board. */
CREATE TABLE [Stop] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Stop Code] varchar(30) NULL,  -- domain: Reference Code
    [Stop Name] varchar(200) NOT NULL,  -- domain: Name
    [Stop Kind Code] varchar(30) NOT NULL,  -- domain: Code
    [Parent Stop Asset ID] bigint NULL,  -- domain: Identifier
    [Wheelchair Boarding Code] varchar(30) NULL,  -- domain: Code
    [Shelter Flag] bit NULL,  -- domain: Flag
    CONSTRAINT [PK_Stop] PRIMARY KEY ([Asset ID]),
    CONSTRAINT [AK2_Stop] UNIQUE ([Stop Code])
);

/* Subtype of Asset: A bus or ferry in the transit fleet. */
CREATE TABLE [Vehicle] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Vehicle Label] varchar(200) NULL,  -- domain: Name
    [Vehicle Mode Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Vehicle] PRIMARY KEY ([Asset ID])
);

/* Subtype of Asset: The path between two consecutive stops, shared by every route that uses it. */
CREATE TABLE [Route Segment] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [From Stop Asset ID] bigint NOT NULL,  -- domain: Identifier
    [To Stop Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Segment Length Metres] decimal(12,2) NULL,  -- domain: Length Metres
    CONSTRAINT [PK_Route_Segment] PRIMARY KEY ([Asset ID]),
    CONSTRAINT [AK2_Route_Segment] UNIQUE ([From Stop Asset ID], [To Stop Asset ID])
);

/* Associative: The ordered segments a route runs through in one direction, per schedule version. Resolves Route made of Route Segment. */
CREATE TABLE [Route Segment Sequence] (
    [Schedule Version ID] bigint NOT NULL,  -- domain: Identifier
    [Route Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Direction Code] varchar(30) NOT NULL,  -- domain: Code
    [Segment Sequence Number] int NOT NULL,  -- domain: Count
    [Route Segment Asset ID] bigint NOT NULL,  -- domain: Identifier
    CONSTRAINT [PK_Route_Segment_Sequence] PRIMARY KEY ([Schedule Version ID], [Route Asset ID], [Direction Code], [Segment Sequence Number])
);

/* Associative: The street segments a route segment runs along, in order. Resolves Route Segment runs along Street Segment. */
CREATE TABLE [Route Segment Street Segment] (
    [Route Segment Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Street Segment Location ID] bigint NOT NULL,  -- domain: Identifier
    [Path Sequence Number] int NOT NULL,  -- domain: Count
    [Overlap Length Metres] decimal(12,2) NULL,  -- domain: Length Metres
    CONSTRAINT [PK_Route_Segment_Street_Segment] PRIMARY KEY ([Route Segment Asset ID], [Street Segment Location ID])
);

/* Reference: One trip as planned in a schedule version (GTFS trips.txt). It repeats on every day its service runs. */
CREATE TABLE [Scheduled Trip] (
    [Scheduled Trip ID] bigint NOT NULL,  -- domain: Identifier
    [Schedule Version ID] bigint NOT NULL,  -- domain: Identifier
    [Service Code] varchar(100) NOT NULL,  -- domain: Source Key
    [Source Trip Key] varchar(100) NOT NULL,  -- domain: Source Key
    [Route Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Direction Code] varchar(30) NOT NULL,  -- domain: Code
    [Trip Headsign] varchar(200) NULL,  -- domain: Name
    [Block Code] varchar(100) NULL,  -- domain: Source Key
    [Shape Key] varchar(100) NULL,  -- domain: Source Key
    [Wheelchair Accessible Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Scheduled_Trip] PRIMARY KEY ([Scheduled Trip ID]),
    CONSTRAINT [AK1_Scheduled_Trip] UNIQUE ([Schedule Version ID], [Source Trip Key])
);

/* Reference: When a scheduled trip is planned to reach one stop (GTFS stop_times.txt). */
CREATE TABLE [Scheduled Stop Time] (
    [Scheduled Trip ID] bigint NOT NULL,  -- domain: Identifier
    [Stop Sequence Number] int NOT NULL,  -- domain: Count
    [Stop Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Scheduled Arrival Time] char(8) NULL,  -- domain: Service Day Time
    [Scheduled Departure Time] char(8) NULL,  -- domain: Service Day Time
    [Timepoint Flag] bit NULL,  -- domain: Flag
    [Pickup Type Code] varchar(30) NULL,  -- domain: Code
    [Drop Off Type Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Scheduled_Stop_Time] PRIMARY KEY ([Scheduled Trip ID], [Stop Sequence Number])
);

/* Subtype of Event: One run of a trip on one service date, whether it ran, was cancelled or was added. */
CREATE TABLE [Trip] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Scheduled Trip ID] bigint NULL,  -- domain: Identifier
    [Route Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Vehicle Asset ID] bigint NULL,  -- domain: Identifier
    [Trip Schedule Status Code] varchar(30) NOT NULL,  -- domain: Code
    [Actual Start Timestamp] datetime2(3) NULL,  -- domain: Timestamp
    [Actual End Timestamp] datetime2(3) NULL,  -- domain: Timestamp
    CONSTRAINT [PK_Trip] PRIMARY KEY ([Event ID]),
    CONSTRAINT [AK2_Trip] UNIQUE ([Scheduled Trip ID])
);

/* Subtype of Event: A trip actually reaching a stop on one service date. */
CREATE TABLE [Stop Arrival] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Trip Event ID] bigint NOT NULL,  -- domain: Identifier
    [Stop Sequence Number] int NOT NULL,  -- domain: Count
    [Stop Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Actual Departure Timestamp] datetime2(3) NULL,  -- domain: Timestamp
    [Reported Delay Seconds] int NULL,  -- domain: Count
    [Arrival Observation Method Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Stop_Arrival] PRIMARY KEY ([Event ID]),
    CONSTRAINT [AK2_Stop_Arrival] UNIQUE ([Trip Event ID], [Stop Sequence Number])
);

/* Subtype of Event: Where one vehicle was at one moment (GTFS-RT). */
CREATE TABLE [Vehicle Position] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Vehicle Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Trip Event ID] bigint NULL,  -- domain: Identifier
    [Position Latitude] decimal(9,6) NOT NULL,  -- domain: Latitude
    [Position Longitude] decimal(9,6) NOT NULL,  -- domain: Longitude
    [Bearing Degrees] decimal(18,6) NULL,  -- domain: Measure Value
    [Speed Metres Per Second] decimal(18,6) NULL,  -- domain: Measure Value
    [Current Stop Sequence Number] int NULL,  -- domain: Count
    [Vehicle Stop Status Code] varchar(30) NULL,  -- domain: Code
    [Occupancy Status Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Vehicle_Position] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A published detour, stop closure or service change (GTFS-RT). */
CREATE TABLE [Service Alert] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Alert Cause Code] varchar(30) NULL,  -- domain: Code
    [Alert Effect Code] varchar(30) NULL,  -- domain: Code
    [Alert Header Text] varchar(500) NOT NULL,  -- domain: Text
    [Alert Description Text] varchar(max) NULL,  -- domain: Long Text
    [Alert URL] varchar(500) NULL,  -- domain: URL
    CONSTRAINT [PK_Service_Alert] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One reported traffic collision. */
CREATE TABLE [Collision] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Collision Severity Code] varchar(30) NOT NULL,  -- domain: Code
    [Vehicle Count] int NULL,  -- domain: Count
    [Pedestrian Involved Flag] bit NULL,  -- domain: Flag
    [Bicycle Involved Flag] bit NULL,  -- domain: Flag
    [Road Surface Condition Code] varchar(30) NULL,  -- domain: Code
    [Light Condition Code] varchar(30) NULL,  -- domain: Code
    [Weather Condition Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Collision] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One traffic or bicycle count at one location over a study period. */
CREATE TABLE [Traffic Count] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Count Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Count Direction Code] varchar(30) NULL,  -- domain: Code
    [Total Volume Count] int NULL,  -- domain: Count
    [AADT Count] int NULL,  -- domain: Count
    [AAWT Count] int NULL,  -- domain: Count
    [Speed 85th Percentile Kph] decimal(18,6) NULL,  -- domain: Measure Value
    [Heavy Vehicle Percent] decimal(5,2) NULL,  -- domain: Percent
    CONSTRAINT [PK_Traffic_Count] PRIMARY KEY ([Event ID])
);

/* ===================== PUBLIC WORKS ===================== */
/* Subtype of Asset: A piece of public infrastructure: road surface, sidewalk, streetlight, sign, hydrant, pipe, tree, park amenity, sampling point. */
CREATE TABLE [Infrastructure Asset] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Infrastructure Class Code] varchar(30) NOT NULL,  -- domain: Code
    [Material Code] varchar(30) NULL,  -- domain: Code
    [Condition Rating Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Infrastructure_Asset] PRIMARY KEY ([Asset ID])
);

/* Subtype of Asset: A building or site the city runs: depot, waste facility, treatment plant, terminal, recreation centre. */
CREATE TABLE [Facility] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Facility Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Capacity Quantity] decimal(18,6) NULL,  -- domain: Measure Value
    [Capacity Unit Code] varchar(30) NULL,  -- domain: Code
    [Public Access Flag] bit NULL,  -- domain: Flag
    CONSTRAINT [PK_Facility] PRIMARY KEY ([Asset ID])
);

/* Subtype of Event: A 311 request from the public. Event End = closed. */
CREATE TABLE [Service Request] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Request Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Request Category Code] varchar(30) NULL,  -- domain: Code
    [Request Channel Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Service_Request] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A job to inspect, repair or maintain an infrastructure asset. */
CREATE TABLE [Work Order] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Service Request Event ID] bigint NULL,  -- domain: Identifier
    [Capital Project Event ID] bigint NULL,  -- domain: Identifier
    [Infrastructure Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Work Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Work Priority Code] varchar(30) NULL,  -- domain: Code
    [Planned Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Work_Order] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A funded construction or renewal project. Event Start/End = actual dates. */
CREATE TABLE [Capital Project] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Project Name] varchar(200) NOT NULL,  -- domain: Name
    [Capital Project Type Code] varchar(30) NULL,  -- domain: Code
    [Budget Amount] decimal(15,2) NULL,  -- domain: Amount
    [Actual Cost Amount] decimal(15,2) NULL,  -- domain: Amount
    [Planned Start Date] date NULL,  -- domain: Date
    [Planned End Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Capital_Project] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A full or partial closure of streets for a period. Closed segments are in Event Coverage. */
CREATE TABLE [Road Closure] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Capital Project Event ID] bigint NULL,  -- domain: Identifier
    [Development Project Event ID] bigint NULL,  -- domain: Identifier
    [Closure Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Closure Reason Code] varchar(30) NULL,  -- domain: Code
    [Detour Description] varchar(2000) NULL,  -- domain: Description
    CONSTRAINT [PK_Road_Closure] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One plowing, salting or sidewalk-clearing pass on a street segment. */
CREATE TABLE [Snow Clearing] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Clearing Activity Code] varchar(30) NOT NULL,  -- domain: Code
    [Clearing Priority Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Snow_Clearing] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A rating of one street segment's pavement. */
CREATE TABLE [Pavement Condition Assessment] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Pavement Condition Index] decimal(18,6) NULL,  -- domain: Measure Value
    [Condition Rating Code] varchar(30) NULL,  -- domain: Code
    [Assessment Method Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Pavement_Condition_Assessment] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One scheduled garbage, recycling or organics pickup at a civic address. */
CREATE TABLE [Waste Collection] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Waste Stream Code] varchar(30) NOT NULL,  -- domain: Code
    [Scheduled Collection Date] date NOT NULL,  -- domain: Date
    [Collection Outcome Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Waste_Collection] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: Tonnes of one waste stream received at a facility in a period. */
CREATE TABLE [Waste Tonnage Record] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Facility Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Waste Stream Code] varchar(30) NOT NULL,  -- domain: Code
    [Disposal Destination Code] varchar(30) NOT NULL,  -- domain: Code
    [Tonnage Quantity] decimal(18,6) NOT NULL,  -- domain: Measure Value
    CONSTRAINT [PK_Waste_Tonnage_Record] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: One lab or sensor reading of one water quality measure at a sampling point. */
CREATE TABLE [Water Quality Reading] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Infrastructure Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Measure Code] varchar(30) NOT NULL,  -- domain: Reference Code
    [Reading Value] decimal(18,6) NOT NULL,  -- domain: Measure Value
    [Exceedance Flag] bit NULL,  -- domain: Flag
    CONSTRAINT [PK_Water_Quality_Reading] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A loss of electricity, water or wastewater service. Affected areas are in Event Coverage. */
CREATE TABLE [Utility Outage] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Utility Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Customers Affected Count] int NULL,  -- domain: Count
    [Outage Cause Code] varchar(30) NULL,  -- domain: Code
    [Estimated Restoration Timestamp] datetime2(3) NULL,  -- domain: Timestamp
    CONSTRAINT [PK_Utility_Outage] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A public notice such as a boil-water advisory or winter parking ban. Covered areas are in Event Coverage. */
CREATE TABLE [Public Advisory] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Advisory Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Advisory Severity Code] varchar(30) NULL,  -- domain: Code
    [Advisory Text] varchar(max) NULL,  -- domain: Long Text
    [Advisory URL] varchar(500) NULL,  -- domain: URL
    CONSTRAINT [PK_Public_Advisory] PRIMARY KEY ([Event ID])
);

/* ===================== HOUSING & REAL ESTATE ===================== */
/* Subtype of Asset: A structure on a parcel. Its Asset Location is the parcel it sits on. */
CREATE TABLE [Building] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Building Use Code] varchar(30) NULL,  -- domain: Code
    [Building Type Code] varchar(30) NULL,  -- domain: Code
    [Year Built] smallint NULL,  -- domain: Year
    [Storey Count] int NULL,  -- domain: Count
    [Gross Floor Area Square Metres] decimal(12,2) NULL,  -- domain: Area Square Metres
    [Reported Unit Count] int NULL,  -- domain: Count
    CONSTRAINT [PK_Building] PRIMARY KEY ([Asset ID])
);

/* Subtype of Asset: One home inside a building: a house, apartment or suite. */
CREATE TABLE [Dwelling Unit] (
    [Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Building Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Unit Number] varchar(30) NULL,  -- domain: Reference Code
    [Dwelling Type Code] varchar(30) NULL,  -- domain: Code
    [Bedroom Count] int NULL,  -- domain: Count
    [Tenure Code] varchar(30) NULL,  -- domain: Code
    [Floor Area Square Metres] decimal(12,2) NULL,  -- domain: Area Square Metres
    CONSTRAINT [PK_Dwelling_Unit] PRIMARY KEY ([Asset ID])
);

/* Subtype of Event: A recorded sale of a parcel. Buyer and seller are not kept. */
CREATE TABLE [Property Sale] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Sale Price Amount] decimal(15,2) NOT NULL,  -- domain: Amount
    [Sale Type Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Property_Sale] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: The PVSC assessed value of a property for one assessment year. */
CREATE TABLE [Property Assessment] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Assessment Year] smallint NOT NULL,  -- domain: Year
    [Assessment Account Number] varchar(30) NOT NULL,  -- domain: Reference Code
    [Assessment Class Code] varchar(30) NOT NULL,  -- domain: Code
    [Land Value Amount] decimal(15,2) NULL,  -- domain: Amount
    [Building Value Amount] decimal(15,2) NULL,  -- domain: Amount
    [Assessed Value Amount] decimal(15,2) NOT NULL,  -- domain: Amount
    [Capped Assessed Value Amount] decimal(15,2) NULL,  -- domain: Amount
    CONSTRAINT [PK_Property_Assessment] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A permit issued for new construction, alteration or demolition on a parcel. */
CREATE TABLE [Building Permit] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Development Project Event ID] bigint NULL,  -- domain: Identifier
    [Building Asset ID] bigint NULL,  -- domain: Identifier
    [Permit Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Work Description] varchar(2000) NULL,  -- domain: Description
    [Construction Value Amount] decimal(15,2) NULL,  -- domain: Amount
    [Units Created Count] int NULL,  -- domain: Count
    [Units Removed Count] int NULL,  -- domain: Count
    CONSTRAINT [PK_Building_Permit] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: CMHC rental survey results for one zone, unit type and survey date. */
CREATE TABLE [Rental Market Observation] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Bedroom Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Structure Type Code] varchar(30) NOT NULL,  -- domain: Code
    [Vacancy Rate Percent] decimal(5,2) NULL,  -- domain: Percent
    [Average Rent Amount] decimal(15,2) NULL,  -- domain: Amount
    [Median Rent Amount] decimal(15,2) NULL,  -- domain: Amount
    [Universe Unit Count] int NULL,  -- domain: Count
    [Data Reliability Code] varchar(30) NULL,  -- domain: Code
    CONSTRAINT [PK_Rental_Market_Observation] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A dwelling unit registered for short-term rental for a period. The host is not kept. */
CREATE TABLE [Short-Term Rental Registration] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Dwelling Unit Asset ID] bigint NOT NULL,  -- domain: Identifier
    [Registration Type Code] varchar(30) NOT NULL,  -- domain: Code
    CONSTRAINT [PK_Short_Term_Rental_Registration] PRIMARY KEY ([Event ID])
);

/* Subtype of Event: A planning application or development on one or more parcels. Extra parcels are in Event Coverage. */
CREATE TABLE [Development Project] (
    [Event ID] bigint NOT NULL,  -- domain: Identifier
    [Project Name] varchar(200) NULL,  -- domain: Name
    [Development Type Code] varchar(30) NULL,  -- domain: Code
    [Proposed Unit Count] int NULL,  -- domain: Count
    [Affordable Unit Count] int NULL,  -- domain: Count
    [Approval Date] date NULL,  -- domain: Date
    CONSTRAINT [PK_Development_Project] PRIMARY KEY ([Event ID])
);

/* ===================== FOREIGN KEYS ===================== */
/* Location is a Street */
ALTER TABLE [Street] ADD CONSTRAINT [FK_Street_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is a Street Segment */
ALTER TABLE [Street Segment] ADD CONSTRAINT [FK_Street_Segment_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is a Intersection */
ALTER TABLE [Intersection] ADD CONSTRAINT [FK_Intersection_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is a Area */
ALTER TABLE [Area] ADD CONSTRAINT [FK_Area_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is a Civic Address */
ALTER TABLE [Civic Address] ADD CONSTRAINT [FK_Civic_Address_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is a Parcel */
ALTER TABLE [Parcel] ADD CONSTRAINT [FK_Parcel_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Party is a Organization */
ALTER TABLE [Organization] ADD CONSTRAINT [FK_Organization_Party] FOREIGN KEY ([Party ID])
    REFERENCES [Party] ([Party ID]);
/* Event is a Weather Observation */
ALTER TABLE [Weather Observation] ADD CONSTRAINT [FK_Weather_Observation_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Area Statistic */
ALTER TABLE [Area Statistic] ADD CONSTRAINT [FK_Area_Statistic_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Economic Indicator */
ALTER TABLE [Economic Indicator] ADD CONSTRAINT [FK_Economic_Indicator_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Asset is a Route */
ALTER TABLE [Route] ADD CONSTRAINT [FK_Route_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Asset is a Stop */
ALTER TABLE [Stop] ADD CONSTRAINT [FK_Stop_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Asset is a Vehicle */
ALTER TABLE [Vehicle] ADD CONSTRAINT [FK_Vehicle_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Asset is a Route Segment */
ALTER TABLE [Route Segment] ADD CONSTRAINT [FK_Route_Segment_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Event is a Trip */
ALTER TABLE [Trip] ADD CONSTRAINT [FK_Trip_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Stop Arrival */
ALTER TABLE [Stop Arrival] ADD CONSTRAINT [FK_Stop_Arrival_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Vehicle Position */
ALTER TABLE [Vehicle Position] ADD CONSTRAINT [FK_Vehicle_Position_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Service Alert */
ALTER TABLE [Service Alert] ADD CONSTRAINT [FK_Service_Alert_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Collision */
ALTER TABLE [Collision] ADD CONSTRAINT [FK_Collision_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Traffic Count */
ALTER TABLE [Traffic Count] ADD CONSTRAINT [FK_Traffic_Count_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Asset is a Infrastructure Asset */
ALTER TABLE [Infrastructure Asset] ADD CONSTRAINT [FK_Infrastructure_Asset_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Asset is a Facility */
ALTER TABLE [Facility] ADD CONSTRAINT [FK_Facility_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Event is a Service Request */
ALTER TABLE [Service Request] ADD CONSTRAINT [FK_Service_Request_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Work Order */
ALTER TABLE [Work Order] ADD CONSTRAINT [FK_Work_Order_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Capital Project */
ALTER TABLE [Capital Project] ADD CONSTRAINT [FK_Capital_Project_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Road Closure */
ALTER TABLE [Road Closure] ADD CONSTRAINT [FK_Road_Closure_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Snow Clearing */
ALTER TABLE [Snow Clearing] ADD CONSTRAINT [FK_Snow_Clearing_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Pavement Condition Assessment */
ALTER TABLE [Pavement Condition Assessment] ADD CONSTRAINT [FK_Pavement_Condition_Assessment_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Waste Collection */
ALTER TABLE [Waste Collection] ADD CONSTRAINT [FK_Waste_Collection_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Waste Tonnage Record */
ALTER TABLE [Waste Tonnage Record] ADD CONSTRAINT [FK_Waste_Tonnage_Record_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Water Quality Reading */
ALTER TABLE [Water Quality Reading] ADD CONSTRAINT [FK_Water_Quality_Reading_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Utility Outage */
ALTER TABLE [Utility Outage] ADD CONSTRAINT [FK_Utility_Outage_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Public Advisory */
ALTER TABLE [Public Advisory] ADD CONSTRAINT [FK_Public_Advisory_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Asset is a Building */
ALTER TABLE [Building] ADD CONSTRAINT [FK_Building_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Asset is a Dwelling Unit */
ALTER TABLE [Dwelling Unit] ADD CONSTRAINT [FK_Dwelling_Unit_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Event is a Property Sale */
ALTER TABLE [Property Sale] ADD CONSTRAINT [FK_Property_Sale_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Property Assessment */
ALTER TABLE [Property Assessment] ADD CONSTRAINT [FK_Property_Assessment_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Building Permit */
ALTER TABLE [Building Permit] ADD CONSTRAINT [FK_Building_Permit_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Rental Market Observation */
ALTER TABLE [Rental Market Observation] ADD CONSTRAINT [FK_Rental_Market_Observation_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Short-Term Rental Registration */
ALTER TABLE [Short-Term Rental Registration] ADD CONSTRAINT [FK_Short_Term_Rental_Registration_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Event is a Development Project */
ALTER TABLE [Development Project] ADD CONSTRAINT [FK_Development_Project_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Sector contains Subsector */
ALTER TABLE [Subsector] ADD CONSTRAINT [FK_Subsector_Sector] FOREIGN KEY ([Sector ID])
    REFERENCES [Sector] ([Sector ID]);
/* Party publishes Source */
ALTER TABLE [Source] ADD CONSTRAINT [FK_Source_Party] FOREIGN KEY ([Publisher Party ID])
    REFERENCES [Party] ([Party ID]);
/* Source provides Location */
ALTER TABLE [Location] ADD CONSTRAINT [FK_Location_Source] FOREIGN KEY ([Source ID])
    REFERENCES [Source] ([Source ID]);
/* Street has Street Segment */
ALTER TABLE [Street Segment] ADD CONSTRAINT [FK_Street_Segment_Street] FOREIGN KEY ([Street Location ID])
    REFERENCES [Street] ([Location ID]);
/* Intersection starts Street Segment */
ALTER TABLE [Street Segment] ADD CONSTRAINT [FK_Street_Segment_Intersection] FOREIGN KEY ([From Intersection Location ID])
    REFERENCES [Intersection] ([Location ID]);
/* Intersection ends Street Segment */
ALTER TABLE [Street Segment] ADD CONSTRAINT [FK_Street_Segment_Intersection_2] FOREIGN KEY ([To Intersection Location ID])
    REFERENCES [Intersection] ([Location ID]);
/* Area contains Area */
ALTER TABLE [Area] ADD CONSTRAINT [FK_Area_Area] FOREIGN KEY ([Parent Area Location ID])
    REFERENCES [Area] ([Location ID]);
/* Street has Civic Address */
ALTER TABLE [Civic Address] ADD CONSTRAINT [FK_Civic_Address_Street] FOREIGN KEY ([Street Location ID])
    REFERENCES [Street] ([Location ID]);
/* Parcel has Civic Address */
ALTER TABLE [Civic Address] ADD CONSTRAINT [FK_Civic_Address_Parcel] FOREIGN KEY ([Parcel Location ID])
    REFERENCES [Parcel] ([Location ID]);
/* Location contains Location Containment */
ALTER TABLE [Location Containment] ADD CONSTRAINT [FK_Location_Containment_Location] FOREIGN KEY ([Containing Location ID])
    REFERENCES [Location] ([Location ID]);
/* Location is contained in Location Containment */
ALTER TABLE [Location Containment] ADD CONSTRAINT [FK_Location_Containment_Location_2] FOREIGN KEY ([Contained Location ID])
    REFERENCES [Location] ([Location ID]);
/* Source provides Party */
ALTER TABLE [Party] ADD CONSTRAINT [FK_Party_Source] FOREIGN KEY ([Source ID])
    REFERENCES [Source] ([Source ID]);
/* Party is classified by Party Sector Classification */
ALTER TABLE [Party Sector Classification] ADD CONSTRAINT [FK_Party_Sector_Classification_Party] FOREIGN KEY ([Party ID])
    REFERENCES [Party] ([Party ID]);
/* Subsector classifies Party Sector Classification */
ALTER TABLE [Party Sector Classification] ADD CONSTRAINT [FK_Party_Sector_Classification_Subsector] FOREIGN KEY ([Subsector ID])
    REFERENCES [Subsector] ([Subsector ID]);
/* Location locates Asset */
ALTER TABLE [Asset] ADD CONSTRAINT [FK_Asset_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Subsector classifies Asset */
ALTER TABLE [Asset] ADD CONSTRAINT [FK_Asset_Subsector] FOREIGN KEY ([Subsector ID])
    REFERENCES [Subsector] ([Subsector ID]);
/* Source provides Asset */
ALTER TABLE [Asset] ADD CONSTRAINT [FK_Asset_Source] FOREIGN KEY ([Source ID])
    REFERENCES [Source] ([Source ID]);
/* Party plays Party Asset Role */
ALTER TABLE [Party Asset Role] ADD CONSTRAINT [FK_Party_Asset_Role_Party] FOREIGN KEY ([Party ID])
    REFERENCES [Party] ([Party ID]);
/* Asset has Party Asset Role */
ALTER TABLE [Party Asset Role] ADD CONSTRAINT [FK_Party_Asset_Role_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Calendar Date is the date of Event */
ALTER TABLE [Event] ADD CONSTRAINT [FK_Event_Calendar_Date] FOREIGN KEY ([Event Date])
    REFERENCES [Calendar Date] ([Calendar Date]);
/* Location is the place of Event */
ALTER TABLE [Event] ADD CONSTRAINT [FK_Event_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Subsector classifies Event */
ALTER TABLE [Event] ADD CONSTRAINT [FK_Event_Subsector] FOREIGN KEY ([Subsector ID])
    REFERENCES [Subsector] ([Subsector ID]);
/* Source reports Event */
ALTER TABLE [Event] ADD CONSTRAINT [FK_Event_Source] FOREIGN KEY ([Source ID])
    REFERENCES [Source] ([Source ID]);
/* Event involves Event Asset Involvement */
ALTER TABLE [Event Asset Involvement] ADD CONSTRAINT [FK_Event_Asset_Involvement_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Asset is involved in Event Asset Involvement */
ALTER TABLE [Event Asset Involvement] ADD CONSTRAINT [FK_Event_Asset_Involvement_Asset] FOREIGN KEY ([Asset ID])
    REFERENCES [Asset] ([Asset ID]);
/* Event involves Event Party Involvement */
ALTER TABLE [Event Party Involvement] ADD CONSTRAINT [FK_Event_Party_Involvement_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Party is involved in Event Party Involvement */
ALTER TABLE [Event Party Involvement] ADD CONSTRAINT [FK_Event_Party_Involvement_Party] FOREIGN KEY ([Party ID])
    REFERENCES [Party] ([Party ID]);
/* Event covers Event Coverage */
ALTER TABLE [Event Coverage] ADD CONSTRAINT [FK_Event_Coverage_Event] FOREIGN KEY ([Event ID])
    REFERENCES [Event] ([Event ID]);
/* Location is covered by Event Coverage */
ALTER TABLE [Event Coverage] ADD CONSTRAINT [FK_Event_Coverage_Location] FOREIGN KEY ([Location ID])
    REFERENCES [Location] ([Location ID]);
/* Measure is measured by Area Statistic */
ALTER TABLE [Area Statistic] ADD CONSTRAINT [FK_Area_Statistic_Measure] FOREIGN KEY ([Measure Code])
    REFERENCES [Measure] ([Measure Code]);
/* Measure is measured by Economic Indicator */
ALTER TABLE [Economic Indicator] ADD CONSTRAINT [FK_Economic_Indicator_Measure] FOREIGN KEY ([Measure Code])
    REFERENCES [Measure] ([Measure Code]);
/* Source publishes Schedule Version */
ALTER TABLE [Schedule Version] ADD CONSTRAINT [FK_Schedule_Version_Source] FOREIGN KEY ([Source ID])
    REFERENCES [Source] ([Source ID]);
/* Schedule Version defines Service Calendar */
ALTER TABLE [Service Calendar] ADD CONSTRAINT [FK_Service_Calendar_Schedule_Version] FOREIGN KEY ([Schedule Version ID])
    REFERENCES [Schedule Version] ([Schedule Version ID]);
/* Service Calendar has Service Calendar Exception */
ALTER TABLE [Service Calendar Exception] ADD CONSTRAINT [FK_Service_Calendar_Exception_Service_Calendar] FOREIGN KEY ([Schedule Version ID], [Service Code])
    REFERENCES [Service Calendar] ([Schedule Version ID], [Service Code]);
/* Calendar Date is the date of Service Calendar Exception */
ALTER TABLE [Service Calendar Exception] ADD CONSTRAINT [FK_Service_Calendar_Exception_Calendar_Date] FOREIGN KEY ([Exception Date])
    REFERENCES [Calendar Date] ([Calendar Date]);
/* Stop contains Stop */
ALTER TABLE [Stop] ADD CONSTRAINT [FK_Stop_Stop] FOREIGN KEY ([Parent Stop Asset ID])
    REFERENCES [Stop] ([Asset ID]);
/* Stop starts Route Segment */
ALTER TABLE [Route Segment] ADD CONSTRAINT [FK_Route_Segment_Stop] FOREIGN KEY ([From Stop Asset ID])
    REFERENCES [Stop] ([Asset ID]);
/* Stop ends Route Segment */
ALTER TABLE [Route Segment] ADD CONSTRAINT [FK_Route_Segment_Stop_2] FOREIGN KEY ([To Stop Asset ID])
    REFERENCES [Stop] ([Asset ID]);
/* Schedule Version orders Route Segment Sequence */
ALTER TABLE [Route Segment Sequence] ADD CONSTRAINT [FK_Route_Segment_Sequence_Schedule_Version] FOREIGN KEY ([Schedule Version ID])
    REFERENCES [Schedule Version] ([Schedule Version ID]);
/* Route is made of Route Segment Sequence */
ALTER TABLE [Route Segment Sequence] ADD CONSTRAINT [FK_Route_Segment_Sequence_Route] FOREIGN KEY ([Route Asset ID])
    REFERENCES [Route] ([Asset ID]);
/* Route Segment appears in Route Segment Sequence */
ALTER TABLE [Route Segment Sequence] ADD CONSTRAINT [FK_Route_Segment_Sequence_Route_Segment] FOREIGN KEY ([Route Segment Asset ID])
    REFERENCES [Route Segment] ([Asset ID]);
/* Route Segment runs along Route Segment Street Segment */
ALTER TABLE [Route Segment Street Segment] ADD CONSTRAINT [FK_Route_Segment_Street_Segment_Route_Segment] FOREIGN KEY ([Route Segment Asset ID])
    REFERENCES [Route Segment] ([Asset ID]);
/* Street Segment carries Route Segment Street Segment */
ALTER TABLE [Route Segment Street Segment] ADD CONSTRAINT [FK_Route_Segment_Street_Segment_Street_Segment] FOREIGN KEY ([Street Segment Location ID])
    REFERENCES [Street Segment] ([Location ID]);
/* Service Calendar governs Scheduled Trip */
ALTER TABLE [Scheduled Trip] ADD CONSTRAINT [FK_Scheduled_Trip_Service_Calendar] FOREIGN KEY ([Schedule Version ID], [Service Code])
    REFERENCES [Service Calendar] ([Schedule Version ID], [Service Code]);
/* Route has Scheduled Trip */
ALTER TABLE [Scheduled Trip] ADD CONSTRAINT [FK_Scheduled_Trip_Route] FOREIGN KEY ([Route Asset ID])
    REFERENCES [Route] ([Asset ID]);
/* Scheduled Trip has Scheduled Stop Time */
ALTER TABLE [Scheduled Stop Time] ADD CONSTRAINT [FK_Scheduled_Stop_Time_Scheduled_Trip] FOREIGN KEY ([Scheduled Trip ID])
    REFERENCES [Scheduled Trip] ([Scheduled Trip ID]);
/* Stop has Scheduled Stop Time */
ALTER TABLE [Scheduled Stop Time] ADD CONSTRAINT [FK_Scheduled_Stop_Time_Stop] FOREIGN KEY ([Stop Asset ID])
    REFERENCES [Stop] ([Asset ID]);
/* Scheduled Trip runs as Trip */
ALTER TABLE [Trip] ADD CONSTRAINT [FK_Trip_Scheduled_Trip] FOREIGN KEY ([Scheduled Trip ID])
    REFERENCES [Scheduled Trip] ([Scheduled Trip ID]);
/* Route has Trip */
ALTER TABLE [Trip] ADD CONSTRAINT [FK_Trip_Route] FOREIGN KEY ([Route Asset ID])
    REFERENCES [Route] ([Asset ID]);
/* Vehicle operates Trip */
ALTER TABLE [Trip] ADD CONSTRAINT [FK_Trip_Vehicle] FOREIGN KEY ([Vehicle Asset ID])
    REFERENCES [Vehicle] ([Asset ID]);
/* Trip reaches Stop Arrival */
ALTER TABLE [Stop Arrival] ADD CONSTRAINT [FK_Stop_Arrival_Trip] FOREIGN KEY ([Trip Event ID])
    REFERENCES [Trip] ([Event ID]);
/* Stop receives Stop Arrival */
ALTER TABLE [Stop Arrival] ADD CONSTRAINT [FK_Stop_Arrival_Stop] FOREIGN KEY ([Stop Asset ID])
    REFERENCES [Stop] ([Asset ID]);
/* Vehicle records Vehicle Position */
ALTER TABLE [Vehicle Position] ADD CONSTRAINT [FK_Vehicle_Position_Vehicle] FOREIGN KEY ([Vehicle Asset ID])
    REFERENCES [Vehicle] ([Asset ID]);
/* Trip is tracked by Vehicle Position */
ALTER TABLE [Vehicle Position] ADD CONSTRAINT [FK_Vehicle_Position_Trip] FOREIGN KEY ([Trip Event ID])
    REFERENCES [Trip] ([Event ID]);
/* Service Request results in Work Order */
ALTER TABLE [Work Order] ADD CONSTRAINT [FK_Work_Order_Service_Request] FOREIGN KEY ([Service Request Event ID])
    REFERENCES [Service Request] ([Event ID]);
/* Capital Project includes Work Order */
ALTER TABLE [Work Order] ADD CONSTRAINT [FK_Work_Order_Capital_Project] FOREIGN KEY ([Capital Project Event ID])
    REFERENCES [Capital Project] ([Event ID]);
/* Infrastructure Asset is repaired by Work Order */
ALTER TABLE [Work Order] ADD CONSTRAINT [FK_Work_Order_Infrastructure_Asset] FOREIGN KEY ([Infrastructure Asset ID])
    REFERENCES [Infrastructure Asset] ([Asset ID]);
/* Capital Project causes Road Closure */
ALTER TABLE [Road Closure] ADD CONSTRAINT [FK_Road_Closure_Capital_Project] FOREIGN KEY ([Capital Project Event ID])
    REFERENCES [Capital Project] ([Event ID]);
/* Development Project causes Road Closure */
ALTER TABLE [Road Closure] ADD CONSTRAINT [FK_Road_Closure_Development_Project] FOREIGN KEY ([Development Project Event ID])
    REFERENCES [Development Project] ([Event ID]);
/* Calendar Date schedules Waste Collection */
ALTER TABLE [Waste Collection] ADD CONSTRAINT [FK_Waste_Collection_Calendar_Date] FOREIGN KEY ([Scheduled Collection Date])
    REFERENCES [Calendar Date] ([Calendar Date]);
/* Facility records Waste Tonnage Record */
ALTER TABLE [Waste Tonnage Record] ADD CONSTRAINT [FK_Waste_Tonnage_Record_Facility] FOREIGN KEY ([Facility Asset ID])
    REFERENCES [Facility] ([Asset ID]);
/* Infrastructure Asset is sampled by Water Quality Reading */
ALTER TABLE [Water Quality Reading] ADD CONSTRAINT [FK_Water_Quality_Reading_Infrastructure_Asset] FOREIGN KEY ([Infrastructure Asset ID])
    REFERENCES [Infrastructure Asset] ([Asset ID]);
/* Measure is measured by Water Quality Reading */
ALTER TABLE [Water Quality Reading] ADD CONSTRAINT [FK_Water_Quality_Reading_Measure] FOREIGN KEY ([Measure Code])
    REFERENCES [Measure] ([Measure Code]);
/* Building contains Dwelling Unit */
ALTER TABLE [Dwelling Unit] ADD CONSTRAINT [FK_Dwelling_Unit_Building] FOREIGN KEY ([Building Asset ID])
    REFERENCES [Building] ([Asset ID]);
/* Dwelling Unit is registered by Short-Term Rental Registration */
ALTER TABLE [Short-Term Rental Registration] ADD CONSTRAINT [FK_Short_Term_Rental_Registration_Dwelling_Unit] FOREIGN KEY ([Dwelling Unit Asset ID])
    REFERENCES [Dwelling Unit] ([Asset ID]);
/* Development Project has Building Permit */
ALTER TABLE [Building Permit] ADD CONSTRAINT [FK_Building_Permit_Development_Project] FOREIGN KEY ([Development Project Event ID])
    REFERENCES [Development Project] ([Event ID]);
/* Building is authorized by Building Permit */
ALTER TABLE [Building Permit] ADD CONSTRAINT [FK_Building_Permit_Building] FOREIGN KEY ([Building Asset ID])
    REFERENCES [Building] ([Asset ID]);
