# Halifax Digital Twin – Logical Model V1

Drive copy exported Nov 15, 2026\. The live, editable version is the Claude doc at [https\://claude.ai/artifact/LDAxLKkDAGVtMeSmtsV39r](https://claude.ai/artifact/LDAxLKkDAGVtMeSmtsV39r); if the two differ, the live doc wins.

Logical Model V1 turns the 48 boxes of Conceptual Model V1 into 63 entities and 371 attributes in third normal form, across four subject areas: Core, Transportation, Public Works, and Housing & Real Estate. It keeps every conceptual entity except three later-phase ones, adds 15 to resolve many-to-many lines and GTFS scheduling, and makes 20 changes, all accepted on Nov 15\.

## How it gets into erwin

Built by reverse engineering `Halifax_Twin_Logical_V1_RE.sql` (same folder): SQL Server dialect, 63 tables, 371 columns, 108 foreign keys. Names are in brackets with spaces, so erwin's logical names match this doc. After the import, the modeler restores what a script cannot carry:

1. Subtype symbols for Location (6 subtypes, incomplete), Party (1, incomplete), Asset (8, incomplete) and Event (26, complete). The script holds them as 1-to-0..1 identifying relationships.  
2. The 24 domains, assigned by attribute class word (Code, Name, Date …).  
3. Four subject areas with their own diagrams.  
4. Entity definitions from the tables below.

## Subject areas

| Subject area | Entities | Reference | Supertype | Subtype | Associative | Attributes | Relationships |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Core | 25 | 5 | 4 | 10 | 6 | 145 | 31 \+ 3 subtype groups |
| Transportation | 17 | 5 | 0 | 10 | 2 | 112 | 23 |
| Public Works | 13 | 0 | 0 | 13 | 0 | 64 | 9 |
| Housing & Real Estate | 8 | 0 | 0 | 8 | 0 | 50 | 4 |
| Total | 63 | 10 | 4 | 41 | 8 | 371 | 67 \+ 3 subtype groups |

## Modeling rules

The logical model is third normal form and technology-neutral; Data Vault or star schemas are physical choices per layer (step 7). Suggested step 7: Bronze stays shaped like each source, Silver implements this 3NF model with SCD Type 2 history, and Gold is Kimball star schemas per group of business questions.

1. **Names.** Singular, Title Case, spaces. Every attribute ends in a class word that matches its domain: ID, Code, Name, Date, Timestamp, Amount, Count, Flag, Percent. erwin's naming standards turn these into snake\_case in step 9\.  
2. **Keys.** Kernel entities get a surrogate PK (Location ID, Event ID). The source's own key is alternate key AK1 (Source ID \+ Source … Key), so two sources can feed one entity without clashing. Reference entities with stable codes use the code as the PK (S04, TRN-01, SRC-001).  
3. **Supertypes.** Location, Party, Asset and Event are supertypes; subtypes share the supertype's key. Location, Party and Asset are incomplete; Event is complete.  
4. **Associations.** A many-to-many line that touches a core supertype becomes a generic associative entity: Event Asset Involvement, Event Party Involvement, Event Coverage, Party Asset Role, Location Containment. A many-to-many inside a sector gets its own associative entity with a sequence where order matters.  
5. **Codes.** Code lists live as valid values on domains, not lookup entities, unless the code carries attributes (Sector, Subsector, Source, Measure).  
6. **Time.** Timestamps are UTC. Lifecycle dates are logical; SCD Type 2 history and load audit columns are added in the physical model.  
7. **Provenance.** Location, Asset and Event must name their Source. Party may, because a source's publisher is itself a Party.  
8. **No derived values.** On-time percentage, delay minutes and counts per area are Gold measures. Exception: Reported Delay Seconds, which the feed publishes.  
9. **No personal data.** Party has only an Organization subtype; buyers, sellers, short-term rental hosts and 311 callers are not modeled.

## Changes from the conceptual model (all accepted Nov 15\)

| \# | Conceptual model | Logical model | Why |
| :---- | :---- | :---- | :---- |
| 1 | Trip is one Event | Split into Scheduled Trip (the plan, per schedule version) and Trip (one run on one service date) | A GTFS trip\_id repeats every day; TRN-Q05 needs a dated trip |
| 2 | Scheduled Stop Time is an Event, fulfilled by 0..1 Stop Arrival | Scheduled Stop Time is schedule reference data; Stop Arrival belongs to a dated Trip | One planned stop time is fulfilled once per service date |
| 3 | No schedule history | Added Schedule Version, Service Calendar, Service Calendar Exception | Old schedules are needed to judge past trips |
| 4 | Vehicle operates Trip: exactly one | Optional (0..1) | Cancelled trips have no vehicle |
| 5 | Event occurs at exactly one Location | Optional, with location rules | Vehicle Position carries its own coordinates |
| 6 | Asset located at exactly one Location | Optional | Buses and ferries have no fixed location |
| 7 | Separate lines from events to Street Segment, Parcel, Civic Address, Area, Intersection | One Location ID on Event and Asset plus a rule table | One foreign key per supertype instead of 12 lines |
| 8 | Event involves Asset / Party; Service Alert affects Route and Stop | Event Asset Involvement and Event Party Involvement with role codes | Resolves many-to-many and records the role |
| 9 | Road Closure, Utility Outage, Public Advisory cover many locations | Event Coverage | One pattern for every multi-location event |
| 10 | Street Segment connects Intersection (M:N) | From and To Intersection on Street Segment | A segment has exactly two ends |
| 11 | Street Segment within Area; Area contains Parcel | Location Containment | Any location inside any area |
| 12 | Route made of Route Segment; Route Segment runs along Street Segment | Route Segment Sequence and Route Segment Street Segment | Order of segments is the route |
| 13 | Party owns or operates Asset | Party Asset Role with role and start date | Ownership changes over time |
| 14 | Sector classifies Party | Subsector, Party Sector Classification, Subsector ID on Event and Asset | Sectors stored as data |
| 15 | Statistics hold their own measure | Shared Measure reference | One list of measures and units |
| 16 | Party has no subtypes | Organization subtype only | No personal data in Phase 1 |
| 17 | Building Permit authorizes 0..M Buildings | Building has 0..M permits | A building collects many permits |
| 18 | Work Order needs a Service Request; Development Project needs permits | Both links optional | Routine work and small permits stand alone |
| 19 | Capital Project causes Road Closure | Optional, plus optional link from Development Project | Development closures are their own source (SRC-015) |
| 20 | Rail Service, Freight Movement, Flight Movement | Left out of V1 | Later-phase sectors |

## Open questions

- Route patterns: one main pattern per route and direction, or a Route Pattern entity per GTFS shape?  
- Shared core events: add a CORE-00 subsector, or make Subsector ID optional on Event?  
- Merge Area Statistic and Economic Indicator into one Statistic Observation?  
- PVSC account number (AAN) vs parcel (PID): add an Assessment Account entity if they don't match one-to-one.  
- Do HRM stop numbers match GTFS stop\_id? If so, drop Stop Code.  
- Waste Collection by civic address relies on Mixed/Partner data: keep in V1 or park?  
- Record the step 7 decision note before the physical model.

## Domains

| Domain | erwin parent | Logical type | Used for | Rule |
| :---- | :---- | :---- | :---- | :---- |
| Identifier | Number | Integer | Every surrogate key | Positive, never reused |
| Reference Code | String | Text, 30 | Codes that are their own keys: S04, TRN-01, SRC-001, PID | Upper case |
| Source Key | String | Text, 100 | A key as the source gives it | Stored exactly as received |
| Code | String | Text, 30 | Every attribute ending in Code | Valid values in the data dictionary |
| Name | String | Text, 200 | Names and labels |  |
| Description | String | Text, 2000 | Descriptions |  |
| Text | String | Text, 500 | Short free text |  |
| Long Text | String | Text, unlimited | Long free text |  |
| URL | String | Text, 500 | Web links | Starts with http |
| Flag | Boolean | Yes/No | Every attribute ending in Flag |  |
| Date | Datetime | Date | Calendar dates |  |
| Timestamp | Datetime | Timestamp, UTC | Every attribute ending in Timestamp | UTC |
| Service Day Time | String | Text, 8 (HH:MM:SS) | GTFS scheduled times | May pass 24:00:00 |
| Year | Number | Integer, 4 | Years |  |
| Count | Number | Integer | Counts and sequence numbers | 0 or more |
| Amount | Number | Decimal 15,2 | Money | CAD |
| Percent | Number | Decimal 5,2 | Percentages | 0 to 100 |
| Measure Value | Number | Decimal 18,6 | Measured values |  |
| Latitude | Number | Decimal 9,6 | Latitude | WGS 84 |
| Longitude | Number | Decimal 9,6 | Longitude | WGS 84 |
| Length Metres | Number | Decimal 12,2 | Lengths | 0 or more |
| Area Square Metres | Number | Decimal 12,2 | Areas | 0 or more |
| Area Square Km | Number | Decimal 12,2 | Areas | 0 or more |
| Geometry | String | Geometry (WKT) | Location Geometry | WGS 84 |

## Location rules

| Entity | Location ID must point to |
| :---- | :---- |
| Vehicle Position | Nothing: uses Position Latitude and Longitude |
| Trip | Nothing: placed by its route |
| Stop Arrival | Nothing: placed by Stop Asset ID |
| Collision | Intersection or Street Segment |
| Traffic Count | Street Segment or Intersection |
| Snow Clearing, Pavement Condition Assessment | Street Segment |
| Road Closure | Street Segment; more in Event Coverage |
| Waste Collection | Civic Address |
| Utility Outage, Public Advisory | Area; more in Event Coverage |
| Property Sale, Property Assessment, Building Permit | Parcel |
| Development Project | Parcel; more in Event Coverage |
| Rental Market Observation, Area Statistic, Weather Observation, Economic Indicator | Area |
| Building (asset) | Parcel it sits on |
| Stop, Facility, Infrastructure Asset (assets) | A point location or Civic Address |
| Vehicle (asset) | Nothing |

# Core subject area

### Entities

| Entity | Kind | Subtype of | Definition |
| :---- | :---- | :---- | :---- |
| Sector | Reference |  | One of the 17 city sectors from the Domain Map (S01 to S17). |
| Subsector | Reference |  | One subsector from the Domain Map, such as TRN-01 Passenger Transportation. |
| Source | Reference |  | One dataset or feed the twin loads, from the Source Inventory. |
| Calendar Date | Reference |  | One calendar day, used for the date an event occurs on. |
| Measure | Reference |  | Something that is counted or measured, with its unit, such as median household income or E. coli count. |
| Location | Supertype |  | Any place in the city: a point, line, area, service area or citywide. |
| Street | Subtype | Location | A named street, made up of street segments. |
| Street Segment | Subtype | Location | The stretch of one street between two intersections. |
| Intersection | Subtype | Location | A point where two or more street segments meet. |
| Area | Subtype | Location | A bounded area: neighbourhood, census tract, council district, CMHC zone, snow or waste zone, zoning zone. |
| Civic Address | Subtype | Location | A civic number on a street, located on one parcel. |
| Parcel | Subtype | Location | A legal land parcel, identified by its Nova Scotia PID. |
| Location Containment | Associative |  | One location lying inside or overlapping another, such as a parcel inside a neighbourhood. Resolves the Street Segment–Area and Area–Parcel many-to-many lines. |
| Party | Supertype |  | An organization that owns, operates, publishes or takes part in something. People are reserved for a later phase. |
| Organization | Subtype | Party | A government body, agency, utility, company or non-profit. |
| Party Sector Classification | Associative |  | The subsectors a party works in. Replaces Sector classifies Party. |
| Asset | Supertype |  | A physical thing the city depends on: route, stop, vehicle, road asset, facility, building, dwelling unit. |
| Party Asset Role | Associative |  | A party owning, operating or maintaining an asset for a period. Replaces Party owns/operates Asset. |
| Event | Supertype |  | Something that happens at a place and time and is reported by a source: a trip, a repair, a sale, a reading. |
| Event Asset Involvement | Associative |  | An asset taking part in an event in a named role, such as a route affected by a service alert. Replaces Event involves Asset and Service Alert affects Route/Stop. |
| Event Party Involvement | Associative |  | A party taking part in an event in a named role, such as the contractor on a work order. Replaces Event involves Party. |
| Event Coverage | Associative |  | Extra locations an event covers beyond its main one, such as every street segment in a road closure. Replaces Road Closure on Street Segment, Utility Outage affects Area, Public Advisory covers Area. |
| Weather Observation | Subtype | Event | Weather recorded for an area over one hour or one day. |
| Area Statistic | Subtype | Event | One published statistic for one area and period, such as population of a census tract in 2021\. |
| Economic Indicator | Subtype | Event | One value of an economic series for a period, such as the Bank of Canada policy rate. |

### Attributes

Key: PK primary key, FK foreign key, AK alternate key group. Null \= whether erwin should allow nulls.

| Entity | Attribute | Key | Domain | Null | Note |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Sector | Sector ID | PK | Reference Code | No | S04 |
|  | Sector Name |  | Name | No |  |
|  | Sector Description |  | Description | Yes |  |
|  | Phase Number |  | Count | Yes | 1 \= Phase 1 sector |
| Subsector | Subsector ID | PK | Reference Code | No | TRN-01; CORE-00 for shared core data |
|  | Sector ID | FK | Reference Code | No |  |
|  | Subsector Name |  | Name | No |  |
| Source | Source ID | PK | Reference Code | No | SRC-001 |
|  | Publisher Party ID | FK | Identifier | No | Role name of Party ID |
|  | Dataset Name |  | Name | No |  |
|  | Source Format Code |  | Code | No | GTFS, GTFS-RT, ArcGIS REST API, CSV … |
|  | Access Method Code |  | Code | No | Live feed, API, File download … |
|  | Cadence Code |  | Code | Yes | Real-time, Daily … Irregular |
|  | Availability Code |  | Code | No | Open, Mixed, Partner, Private |
|  | Licence Name |  | Name | No |  |
|  | Attribution Required Flag |  | Flag | No |  |
|  | Record Grain Description |  | Description | No | What one record is |
|  | Source URL |  | URL | No |  |
|  | Reliability Tier Code |  | Code | No | Tier 1 to Tier 3 |
|  | Source Status Code |  | Code | No | Verified, Not checked … |
|  | Last Checked Date |  | Date | Yes |  |
| Calendar Date | Calendar Date | PK | Date | No |  |
|  | Calendar Year |  | Year | No |  |
|  | Quarter Number |  | Count | No |  |
|  | Month Number |  | Count | No |  |
|  | Week Of Year Number |  | Count | No | ISO week |
|  | Day Of Week Name |  | Name | No |  |
|  | Weekend Flag |  | Flag | No |  |
|  | Statutory Holiday Flag |  | Flag | No | Nova Scotia |
|  | Holiday Name |  | Name | Yes |  |
|  | Season Name |  | Name | No |  |
| Measure | Measure Code | PK | Reference Code | No |  |
|  | Measure Name |  | Name | No |  |
|  | Unit Of Measure Code |  | Code | No | CAD, %, mg/L, count … |
|  | Measure Description |  | Description | Yes |  |
| Location | Location ID | PK | Identifier | No |  |
|  | Location Type Code |  | Code | No | Discriminator |
|  | Location Name |  | Name | Yes |  |
|  | Geometry Type Code |  | Code | No | Point, Line, Polygon, None |
|  | Location Geometry |  | Geometry | Yes | None for Citywide |
|  | Centroid Latitude |  | Latitude | Yes |  |
|  | Centroid Longitude |  | Longitude | Yes |  |
|  | Source ID | FK AK1 | Reference Code | No |  |
|  | Source Location Key | AK1 | Source Key | No | Key as the source gives it |
|  | Start Date |  | Date | Yes | Lifecycle: created |
|  | End Date |  | Date | Yes | Lifecycle: retired |
| Street | Location ID | PK/FK | Identifier | No |  |
|  | Street Name |  | Name | No |  |
|  | Street Type Code |  | Code | Yes | St, Ave, Rd … |
|  | Street Direction Code |  | Code | Yes |  |
|  | Road Jurisdiction Code |  | Code | No | Municipal, Provincial, Private |
| Street Segment | Location ID | PK/FK | Identifier | No |  |
|  | Street Location ID | FK | Identifier | No | Role name: the street |
|  | From Intersection Location ID | FK | Identifier | Yes | Role name |
|  | To Intersection Location ID | FK | Identifier | Yes | Role name |
|  | Segment Length Metres |  | Length Metres | Yes |  |
|  | Road Class Code |  | Code | Yes | Arterial, Collector, Local … |
|  | Speed Limit Kph |  | Count | Yes |  |
|  | Lane Count |  | Count | Yes |  |
|  | One Way Flag |  | Flag | Yes |  |
| Intersection | Location ID | PK/FK | Identifier | No |  |
|  | Intersection Name |  | Name | Yes | Barrington St & Spring Garden Rd |
|  | Traffic Control Code |  | Code | Yes | Signal, Stop, Roundabout, None |
| Area | Location ID | PK/FK | Identifier | No |  |
|  | Area Type Code |  | Code | No |  |
|  | Area Code |  | Code | Yes | Official code, e.g. census DGUID |
|  | Parent Area Location ID | FK | Identifier | Yes | Recursive; role name |
|  | Area Square Km |  | Area Square Km | Yes |  |
| Civic Address | Location ID | PK/FK | Identifier | No |  |
|  | Street Location ID | FK | Identifier | No | Role name: the street |
|  | Parcel Location ID | FK | Identifier | No | Role name: the parcel |
|  | Civic Number |  | Count | No |  |
|  | Civic Number Suffix |  | Code | Yes | A, B, ½ |
|  | Postal Code |  | Code | Yes |  |
| Parcel | Location ID | PK/FK | Identifier | No |  |
|  | Parcel PID | AK2 | Reference Code | No | Property Identification Number |
|  | Parcel Area Square Metres |  | Area Square Metres | Yes |  |
|  | Land Use Code |  | Code | Yes |  |
| Location Containment | Containing Location ID | PK/FK | Identifier | No | Role name; usually an Area |
|  | Contained Location ID | PK/FK | Identifier | No | Role name |
|  | Overlap Percent |  | Percent | Yes | Share of the contained location inside |
|  | Containment Method Code |  | Code | No | Spatial join, Published by source |
| Party | Party ID | PK | Identifier | No |  |
|  | Party Type Code |  | Code | No | Discriminator: Organization (Person reserved) |
|  | Party Name |  | Name | No |  |
|  | Source ID | FK AK1 | Reference Code | Yes | Optional: avoids a loop with Source |
|  | Source Party Key | AK1 | Source Key | Yes |  |
| Organization | Party ID | PK/FK | Identifier | No |  |
|  | Organization Type Code |  | Code | No |  |
|  | Legal Name |  | Name | Yes |  |
|  | Business Number |  | Reference Code | Yes | CRA business number |
|  | Website URL |  | URL | Yes |  |
| Party Sector Classification | Party ID | PK/FK | Identifier | No |  |
|  | Subsector ID | PK/FK | Reference Code | No |  |
|  | Primary Classification Flag |  | Flag | No |  |
| Asset | Asset ID | PK | Identifier | No |  |
|  | Asset Type Code |  | Code | No | Discriminator |
|  | Asset Name |  | Name | Yes |  |
|  | Location ID | FK | Identifier | Yes | Located at; empty for vehicles |
|  | Subsector ID | FK | Reference Code | No |  |
|  | Source ID | FK AK1 | Reference Code | No |  |
|  | Source Asset Key | AK1 | Source Key | No | e.g. GTFS route\_id, stop\_id |
|  | Asset Status Code |  | Code | No | Active, Planned, Retired |
|  | In Service Date |  | Date | Yes |  |
|  | Out Of Service Date |  | Date | Yes |  |
| Party Asset Role | Party ID | PK/FK | Identifier | No |  |
|  | Asset ID | PK/FK | Identifier | No |  |
|  | Asset Role Code | PK | Code | No | Owner, Operator, Maintainer |
|  | Role Start Date | PK | Date | No |  |
|  | Role End Date |  | Date | Yes |  |
| Event | Event ID | PK | Identifier | No |  |
|  | Event Type Code |  | Code | No | Discriminator |
|  | Event Start Timestamp |  | Timestamp | No | UTC |
|  | Event End Timestamp |  | Timestamp | Yes | UTC |
|  | Event Date | FK | Date | No | Role name of Calendar Date; occurs on |
|  | Location ID | FK | Identifier | Yes | Occurs at; see the location rules |
|  | Subsector ID | FK | Reference Code | No |  |
|  | Source ID | FK AK1 | Reference Code | No | Reported by |
|  | Source Event Key | AK1 | Source Key | No | Permit no., request no. … |
|  | Event Status Code |  | Code | Yes |  |
| Event Asset Involvement | Event ID | PK/FK | Identifier | No |  |
|  | Asset ID | PK/FK | Identifier | No |  |
|  | Involvement Role Code | PK | Code | No | Affected, Measured, Used … |
| Event Party Involvement | Event ID | PK/FK | Identifier | No |  |
|  | Party ID | PK/FK | Identifier | No |  |
|  | Involvement Role Code | PK | Code | No | Reporter, Responsible, Contractor, Applicant |
| Event Coverage | Event ID | PK/FK | Identifier | No |  |
|  | Location ID | PK/FK | Identifier | No |  |
|  | Coverage Role Code | PK | Code | No | Affected, Closed, Detour |
| Weather Observation | Event ID | PK/FK | Identifier | No |  |
|  | Observation Interval Code |  | Code | No | Hourly, Daily |
|  | Air Temperature Celsius |  | Measure Value | Yes |  |
|  | Precipitation Mm |  | Measure Value | Yes |  |
|  | Snowfall Cm |  | Measure Value | Yes |  |
|  | Snow On Ground Cm |  | Measure Value | Yes |  |
|  | Mean Wind Speed Kph |  | Measure Value | Yes |  |
|  | Max Gust Kph |  | Measure Value | Yes |  |
|  | Weather Condition Code |  | Code | Yes |  |
| Area Statistic | Event ID | PK/FK | Identifier | No |  |
|  | Measure Code | FK | Reference Code | No |  |
|  | Statistic Value |  | Measure Value | No |  |
| Economic Indicator | Event ID | PK/FK | Identifier | No |  |
|  | Measure Code | FK | Reference Code | No |  |
|  | Indicator Value |  | Measure Value | No |  |
|  | Period Type Code |  | Code | No | Monthly, Quarterly, Annual |

### Relationships

| Parent | Verb phrase | Child | Type | Cardinality | Child FK (role name) | Note |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Sector | contains | Subsector | Non-identifying | 1 : 0..M | Sector ID |  |
| Party | publishes | Source | Non-identifying | 1 : 0..M | Publisher Party ID |  |
| Location | is a | Street, Street Segment, Intersection, Area, Civic Address, Parcel | Subtype | Exclusive, incomplete | Location Type Code | Points, lines, service areas and Citywide need no subtype |
| Source | provides | Location | Non-identifying | 1 : 0..M | Source ID |  |
| Street | has | Street Segment | Non-identifying | 1 : 1..M | Street Location ID |  |
| Intersection | starts | Street Segment | Non-identifying | 0..1 : 0..M | From Intersection Location ID | Replaces Street Segment connects Intersection (M:N) |
| Intersection | ends | Street Segment | Non-identifying | 0..1 : 0..M | To Intersection Location ID |  |
| Area | contains | Area | Non-identifying | 0..1 : 0..M | Parent Area Location ID | Recursive |
| Street | has | Civic Address | Non-identifying | 1 : 0..M | Street Location ID |  |
| Parcel | has | Civic Address | Non-identifying | 1 : 0..M | Parcel Location ID | Civic Address located on Parcel |
| Location | contains | Location Containment | Identifying | 1 : 0..M | Containing Location ID |  |
| Location | is contained in | Location Containment | Identifying | 1 : 0..M | Contained Location ID |  |
| Party | is a | Organization | Subtype | Exclusive, incomplete | Party Type Code | Person reserved |
| Source | provides | Party | Non-identifying | 0..1 : 0..M | Source ID |  |
| Party | is classified by | Party Sector Classification | Identifying | 1 : 0..M | Party ID |  |
| Subsector | classifies | Party Sector Classification | Identifying | 1 : 0..M | Subsector ID |  |
| Asset | is a | Route, Stop, Vehicle, Route Segment, Infrastructure Asset, Facility, Building, Dwelling Unit | Subtype | Exclusive, incomplete | Asset Type Code | Counter sites and weather stations stay generic Assets |
| Location | locates | Asset | Non-identifying | 0..1 : 0..M | Location ID | Located at |
| Subsector | classifies | Asset | Non-identifying | 1 : 0..M | Subsector ID |  |
| Source | provides | Asset | Non-identifying | 1 : 0..M | Source ID |  |
| Party | plays | Party Asset Role | Identifying | 1 : 0..M | Party ID |  |
| Asset | has | Party Asset Role | Identifying | 1 : 0..M | Asset ID |  |
| Event | is a | all event subtypes | Subtype | Exclusive, complete | Event Type Code |  |
| Calendar Date | is the date of | Event | Non-identifying | 1 : 0..M | Event Date | Occurs on |
| Location | is the place of | Event | Non-identifying | 0..1 : 0..M | Location ID | Occurs at |
| Subsector | classifies | Event | Non-identifying | 1 : 0..M | Subsector ID |  |
| Source | reports | Event | Non-identifying | 1 : 0..M | Source ID |  |
| Event | involves | Event Asset Involvement | Identifying | 1 : 0..M | Event ID |  |
| Asset | is involved in | Event Asset Involvement | Identifying | 1 : 0..M | Asset ID |  |
| Event | involves | Event Party Involvement | Identifying | 1 : 0..M | Event ID |  |
| Party | is involved in | Event Party Involvement | Identifying | 1 : 0..M | Party ID |  |
| Event | covers | Event Coverage | Identifying | 1 : 0..M | Event ID |  |
| Location | is covered by | Event Coverage | Identifying | 1 : 0..M | Location ID |  |
| Measure | is measured by | Area Statistic | Non-identifying | 1 : 0..M | Measure Code |  |
| Measure | is measured by | Economic Indicator | Non-identifying | 1 : 0..M | Measure Code |  |

# Transportation subject area

### Entities

| Entity | Kind | Subtype of | Definition |
| :---- | :---- | :---- | :---- |
| Schedule Version | Reference |  | One published GTFS schedule file. Every version is kept to judge past trips. |
| Service Calendar | Reference |  | A GTFS service pattern: the weekdays a set of trips runs within a version (calendar.txt). |
| Service Calendar Exception | Reference |  | A date a service pattern is added or removed, such as a holiday (calendar\_dates.txt). |
| Route | Subtype | Asset | A public bus or ferry route. |
| Stop | Subtype | Asset | A bus stop, ferry terminal or station where riders board. |
| Vehicle | Subtype | Asset | A bus or ferry in the transit fleet. |
| Route Segment | Subtype | Asset | The path between two consecutive stops, shared by every route that uses it. |
| Route Segment Sequence | Associative |  | The ordered segments a route runs through in one direction, per schedule version. Resolves Route made of Route Segment. |
| Route Segment Street Segment | Associative |  | The street segments a route segment runs along, in order. Resolves Route Segment runs along Street Segment. |
| Scheduled Trip | Reference |  | One trip as planned in a schedule version (GTFS trips.txt). It repeats on every day its service runs. |
| Scheduled Stop Time | Reference |  | When a scheduled trip is planned to reach one stop (GTFS stop\_times.txt). |
| Trip | Subtype | Event | One run of a trip on one service date, whether it ran, was cancelled or was added. |
| Stop Arrival | Subtype | Event | A trip actually reaching a stop on one service date. |
| Vehicle Position | Subtype | Event | Where one vehicle was at one moment (GTFS-RT). |
| Service Alert | Subtype | Event | A published detour, stop closure or service change (GTFS-RT). |
| Collision | Subtype | Event | One reported traffic collision. |
| Traffic Count | Subtype | Event | One traffic or bicycle count at one location over a study period. |

### Attributes

Key: PK primary key, FK foreign key, AK alternate key group. Null \= whether erwin should allow nulls.

| Entity | Attribute | Key | Domain | Null | Note |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Schedule Version | Schedule Version ID | PK | Identifier | No |  |
|  | Source ID | FK | Reference Code | No | SRC-004 |
|  | Feed Version Label |  | Name | Yes | feed\_info.feed\_version |
|  | Feed Published Date |  | Date | No |  |
|  | Service Period Start Date |  | Date | No |  |
|  | Service Period End Date |  | Date | No |  |
| Service Calendar | Schedule Version ID | PK/FK | Identifier | No |  |
|  | Service Code | PK | Source Key | No | GTFS service\_id |
|  | Monday Flag |  | Flag | No | Same for Tuesday to Sunday: 7 flags |
|  | Start Date |  | Date | No |  |
|  | End Date |  | Date | No |  |
| Service Calendar Exception | Schedule Version ID | PK/FK | Identifier | No |  |
|  | Service Code | PK/FK | Source Key | No |  |
|  | Exception Date | PK/FK | Date | No | Role name of Calendar Date |
|  | Exception Type Code |  | Code | No | Added, Removed |
| Route | Asset ID | PK/FK | Identifier | No |  |
|  | Route Short Name |  | Name | No | 1, 9A, Alderney Ferry |
|  | Route Long Name |  | Name | Yes |  |
|  | Route Mode Code |  | Code | No | Bus, Ferry |
| Stop | Asset ID | PK/FK | Identifier | No |  |
|  | Stop Code | AK2 | Reference Code | Yes | Public stop number |
|  | Stop Name |  | Name | No |  |
|  | Stop Kind Code |  | Code | No | Stop, Station, Ferry terminal |
|  | Parent Stop Asset ID | FK | Identifier | Yes | Recursive; role name |
|  | Wheelchair Boarding Code |  | Code | Yes |  |
|  | Shelter Flag |  | Flag | Yes | From Transit Shelters layer |
| Vehicle | Asset ID | PK/FK | Identifier | No |  |
|  | Vehicle Label |  | Name | Yes | Fleet number |
|  | Vehicle Mode Code |  | Code | No | Bus, Ferry |
| Route Segment | Asset ID | PK/FK | Identifier | No |  |
|  | From Stop Asset ID | FK AK2 | Identifier | No | Starts at; role name |
|  | To Stop Asset ID | FK AK2 | Identifier | No | Ends at; role name |
|  | Segment Length Metres |  | Length Metres | Yes |  |
| Route Segment Sequence | Schedule Version ID | PK/FK | Identifier | No |  |
|  | Route Asset ID | PK/FK | Identifier | No | Role name |
|  | Direction Code | PK | Code | No | 0, 1 |
|  | Segment Sequence Number | PK | Count | No |  |
|  | Route Segment Asset ID | FK | Identifier | No | Role name |
| Route Segment Street Segment | Route Segment Asset ID | PK/FK | Identifier | No | Role name |
|  | Street Segment Location ID | PK/FK | Identifier | No | Role name |
|  | Path Sequence Number |  | Count | No |  |
|  | Overlap Length Metres |  | Length Metres | Yes |  |
| Scheduled Trip | Scheduled Trip ID | PK | Identifier | No |  |
|  | Schedule Version ID | FK AK1 | Identifier | No | Part of the FK to Service Calendar |
|  | Service Code | FK | Source Key | No | Part of the FK to Service Calendar |
|  | Source Trip Key | AK1 | Source Key | No | GTFS trip\_id |
|  | Route Asset ID | FK | Identifier | No | Role name |
|  | Direction Code |  | Code | No | 0, 1 |
|  | Trip Headsign |  | Name | Yes |  |
|  | Block Code |  | Source Key | Yes | Vehicle duty |
|  | Shape Key |  | Source Key | Yes | GTFS shape\_id |
|  | Wheelchair Accessible Code |  | Code | Yes |  |
| Scheduled Stop Time | Scheduled Trip ID | PK/FK | Identifier | No |  |
|  | Stop Sequence Number | PK | Count | No |  |
|  | Stop Asset ID | FK | Identifier | No | Role name |
|  | Scheduled Arrival Time |  | Service Day Time | Yes | Can pass 24:00:00 |
|  | Scheduled Departure Time |  | Service Day Time | Yes |  |
|  | Timepoint Flag |  | Flag | Yes |  |
|  | Pickup Type Code |  | Code | Yes |  |
|  | Drop Off Type Code |  | Code | Yes |  |
| Trip | Event ID | PK/FK | Identifier | No | Event Date \= service date |
|  | Scheduled Trip ID | FK AK2 | Identifier | Yes | Empty for added trips |
|  | Route Asset ID | FK | Identifier | No | Role name; must match the scheduled trip's route |
|  | Vehicle Asset ID | FK | Identifier | Yes | Operates; role name |
|  | Trip Schedule Status Code |  | Code | No | Scheduled, Added, Cancelled |
|  | Actual Start Timestamp |  | Timestamp | Yes | Event Start \= planned start |
|  | Actual End Timestamp |  | Timestamp | Yes |  |
| Stop Arrival | Event ID | PK/FK | Identifier | No | Event Start \= actual arrival |
|  | Trip Event ID | FK AK2 | Identifier | No | Role name |
|  | Stop Sequence Number | AK2 | Count | No |  |
|  | Stop Asset ID | FK | Identifier | No | Role name |
|  | Actual Departure Timestamp |  | Timestamp | Yes |  |
|  | Reported Delay Seconds |  | Count | Yes | As the feed reports it; signed |
|  | Arrival Observation Method Code |  | Code | No | Reported, Inferred from positions |
| Vehicle Position | Event ID | PK/FK | Identifier | No | Event Start \= position time |
|  | Vehicle Asset ID | FK | Identifier | No | Records; role name |
|  | Trip Event ID | FK | Identifier | Yes | Tracked by; empty when not in service |
|  | Position Latitude |  | Latitude | No |  |
|  | Position Longitude |  | Longitude | No |  |
|  | Bearing Degrees |  | Measure Value | Yes |  |
|  | Speed Metres Per Second |  | Measure Value | Yes |  |
|  | Current Stop Sequence Number |  | Count | Yes |  |
|  | Vehicle Stop Status Code |  | Code | Yes | Incoming, Stopped, In transit |
|  | Occupancy Status Code |  | Code | Yes |  |
| Service Alert | Event ID | PK/FK | Identifier | No | Start/End \= active period |
|  | Alert Cause Code |  | Code | Yes |  |
|  | Alert Effect Code |  | Code | Yes | Detour, No service, Stop moved … |
|  | Alert Header Text |  | Text | No |  |
|  | Alert Description Text |  | Long Text | Yes |  |
|  | Alert URL |  | URL | Yes |  |
| Collision | Event ID | PK/FK | Identifier | No |  |
|  | Collision Severity Code |  | Code | No | Fatal, Injury, Property damage |
|  | Vehicle Count |  | Count | Yes |  |
|  | Pedestrian Involved Flag |  | Flag | Yes |  |
|  | Bicycle Involved Flag |  | Flag | Yes |  |
|  | Road Surface Condition Code |  | Code | Yes |  |
|  | Light Condition Code |  | Code | Yes |  |
|  | Weather Condition Code |  | Code | Yes |  |
| Traffic Count | Event ID | PK/FK | Identifier | No |  |
|  | Count Type Code |  | Code | No | Volume, Turning movement, Speed, Classification, Bicycle |
|  | Count Direction Code |  | Code | Yes |  |
|  | Total Volume Count |  | Count | Yes |  |
|  | AADT Count |  | Count | Yes | Annual average daily traffic |
|  | AAWT Count |  | Count | Yes | Annual average weekday traffic |
|  | Speed 85th Percentile Kph |  | Measure Value | Yes |  |
|  | Heavy Vehicle Percent |  | Percent | Yes |  |

### Relationships

| Parent | Verb phrase | Child | Type | Cardinality | Child FK (role name) | Note |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Source | publishes | Schedule Version | Non-identifying | 1 : 0..M | Source ID |  |
| Schedule Version | defines | Service Calendar | Identifying | 1 : 1..M | Schedule Version ID |  |
| Service Calendar | has | Service Calendar Exception | Identifying | 1 : 0..M | Schedule Version ID, Service Code |  |
| Calendar Date | is the date of | Service Calendar Exception | Identifying | 1 : 0..M | Exception Date |  |
| Stop | contains | Stop | Non-identifying | 0..1 : 0..M | Parent Stop Asset ID | Recursive: station and its platforms |
| Stop | starts | Route Segment | Non-identifying | 1 : 0..M | From Stop Asset ID | Starts at |
| Stop | ends | Route Segment | Non-identifying | 1 : 0..M | To Stop Asset ID | Ends at |
| Schedule Version | orders | Route Segment Sequence | Identifying | 1 : 0..M | Schedule Version ID |  |
| Route | is made of | Route Segment Sequence | Identifying | 1 : 0..M | Route Asset ID |  |
| Route Segment | appears in | Route Segment Sequence | Non-identifying | 1 : 0..M | Route Segment Asset ID |  |
| Route Segment | runs along | Route Segment Street Segment | Identifying | 1 : 1..M | Route Segment Asset ID |  |
| Street Segment | carries | Route Segment Street Segment | Identifying | 1 : 0..M | Street Segment Location ID |  |
| Service Calendar | governs | Scheduled Trip | Non-identifying | 1 : 0..M | Schedule Version ID, Service Code |  |
| Route | has | Scheduled Trip | Non-identifying | 1 : 0..M | Route Asset ID |  |
| Scheduled Trip | has | Scheduled Stop Time | Identifying | 1 : 1..M | Scheduled Trip ID |  |
| Stop | has | Scheduled Stop Time | Non-identifying | 1 : 0..M | Stop Asset ID |  |
| Scheduled Trip | runs as | Trip | Non-identifying | 0..1 : 0..M | Scheduled Trip ID | One Trip per service date |
| Route | has | Trip | Non-identifying | 1 : 0..M | Route Asset ID |  |
| Vehicle | operates | Trip | Non-identifying | 0..1 : 0..M | Vehicle Asset ID |  |
| Trip | reaches | Stop Arrival | Non-identifying | 1 : 0..M | Trip Event ID | Fulfils Scheduled Stop Time via Scheduled Trip \+ Stop Sequence |
| Stop | receives | Stop Arrival | Non-identifying | 1 : 0..M | Stop Asset ID |  |
| Vehicle | records | Vehicle Position | Non-identifying | 1 : 0..M | Vehicle Asset ID |  |
| Trip | is tracked by | Vehicle Position | Non-identifying | 0..1 : 0..M | Trip Event ID |  |

# Public Works subject area

### Entities

| Entity | Kind | Subtype of | Definition |
| :---- | :---- | :---- | :---- |
| Infrastructure Asset | Subtype | Asset | A piece of public infrastructure: road surface, sidewalk, streetlight, sign, hydrant, pipe, tree, park amenity, sampling point. |
| Facility | Subtype | Asset | A building or site the city runs: depot, waste facility, treatment plant, terminal, recreation centre. |
| Service Request | Subtype | Event | A 311 request from the public. Event End \= closed. |
| Work Order | Subtype | Event | A job to inspect, repair or maintain an infrastructure asset. |
| Capital Project | Subtype | Event | A funded construction or renewal project. Event Start/End \= actual dates. |
| Road Closure | Subtype | Event | A full or partial closure of streets for a period. Closed segments are in Event Coverage. |
| Snow Clearing | Subtype | Event | One plowing, salting or sidewalk-clearing pass on a street segment. |
| Pavement Condition Assessment | Subtype | Event | A rating of one street segment's pavement. |
| Waste Collection | Subtype | Event | One scheduled garbage, recycling or organics pickup at a civic address. |
| Waste Tonnage Record | Subtype | Event | Tonnes of one waste stream received at a facility in a period. |
| Water Quality Reading | Subtype | Event | One lab or sensor reading of one water quality measure at a sampling point. |
| Utility Outage | Subtype | Event | A loss of electricity, water or wastewater service. Affected areas are in Event Coverage. |
| Public Advisory | Subtype | Event | A public notice such as a boil-water advisory or winter parking ban. Covered areas are in Event Coverage. |

### Attributes

Key: PK primary key, FK foreign key, AK alternate key group. Null \= whether erwin should allow nulls.

| Entity | Attribute | Key | Domain | Null | Note |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Infrastructure Asset | Asset ID | PK/FK | Identifier | No |  |
|  | Infrastructure Class Code |  | Code | No |  |
|  | Material Code |  | Code | Yes |  |
|  | Condition Rating Code |  | Code | Yes | As last reported |
| Facility | Asset ID | PK/FK | Identifier | No |  |
|  | Facility Type Code |  | Code | No |  |
|  | Capacity Quantity |  | Measure Value | Yes |  |
|  | Capacity Unit Code |  | Code | Yes |  |
|  | Public Access Flag |  | Flag | Yes |  |
| Service Request | Event ID | PK/FK | Identifier | No |  |
|  | Request Type Code |  | Code | No |  |
|  | Request Category Code |  | Code | Yes |  |
|  | Request Channel Code |  | Code | Yes | Phone, Web, App |
| Work Order | Event ID | PK/FK | Identifier | No |  |
|  | Service Request Event ID | FK | Identifier | Yes | Results in; role name |
|  | Capital Project Event ID | FK | Identifier | Yes | Includes; role name |
|  | Infrastructure Asset ID | FK | Identifier | No | Repairs; role name |
|  | Work Type Code |  | Code | No |  |
|  | Work Priority Code |  | Code | Yes |  |
|  | Planned Date |  | Date | Yes |  |
| Capital Project | Event ID | PK/FK | Identifier | No |  |
|  | Project Name |  | Name | No |  |
|  | Capital Project Type Code |  | Code | Yes |  |
|  | Budget Amount |  | Amount | Yes | CAD |
|  | Actual Cost Amount |  | Amount | Yes | CAD |
|  | Planned Start Date |  | Date | Yes |  |
|  | Planned End Date |  | Date | Yes |  |
| Road Closure | Event ID | PK/FK | Identifier | No |  |
|  | Capital Project Event ID | FK | Identifier | Yes | Causes; role name |
|  | Development Project Event ID | FK | Identifier | Yes | Causes; role name (new) |
|  | Closure Type Code |  | Code | No | Full, Partial, Lane, Sidewalk |
|  | Closure Reason Code |  | Code | Yes |  |
|  | Detour Description |  | Description | Yes |  |
| Snow Clearing | Event ID | PK/FK | Identifier | No |  |
|  | Clearing Activity Code |  | Code | No | Plow, Salt, Sand, Sidewalk |
|  | Clearing Priority Code |  | Code | Yes |  |
| Pavement Condition Assessment | Event ID | PK/FK | Identifier | No |  |
|  | Pavement Condition Index |  | Measure Value | Yes | 0 to 100 |
|  | Condition Rating Code |  | Code | Yes |  |
|  | Assessment Method Code |  | Code | Yes |  |
| Waste Collection | Event ID | PK/FK | Identifier | No |  |
|  | Waste Stream Code |  | Code | No | Garbage, Recycling, Organics |
|  | Scheduled Collection Date | FK | Date | No | Role name of Calendar Date |
|  | Collection Outcome Code |  | Code | No | Collected, Missed, Late |
| Waste Tonnage Record | Event ID | PK/FK | Identifier | No |  |
|  | Facility Asset ID | FK | Identifier | No | Recorded at; role name |
|  | Waste Stream Code |  | Code | No |  |
|  | Disposal Destination Code |  | Code | No | Landfill, Recycling, Compost |
|  | Tonnage Quantity |  | Measure Value | No | Tonnes |
| Water Quality Reading | Event ID | PK/FK | Identifier | No |  |
|  | Infrastructure Asset ID | FK | Identifier | No | Sampled at; role name |
|  | Measure Code | FK | Reference Code | No |  |
|  | Reading Value |  | Measure Value | No |  |
|  | Exceedance Flag |  | Flag | Yes | Above guideline |
| Utility Outage | Event ID | PK/FK | Identifier | No |  |
|  | Utility Type Code |  | Code | No | Electricity, Water, Wastewater, Gas |
|  | Customers Affected Count |  | Count | Yes |  |
|  | Outage Cause Code |  | Code | Yes |  |
|  | Estimated Restoration Timestamp |  | Timestamp | Yes |  |
| Public Advisory | Event ID | PK/FK | Identifier | No |  |
|  | Advisory Type Code |  | Code | No |  |
|  | Advisory Severity Code |  | Code | Yes |  |
|  | Advisory Text |  | Long Text | Yes |  |
|  | Advisory URL |  | URL | Yes |  |

### Relationships

| Parent | Verb phrase | Child | Type | Cardinality | Child FK (role name) | Note |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Service Request | results in | Work Order | Non-identifying | 0..1 : 0..M | Service Request Event ID |  |
| Capital Project | includes | Work Order | Non-identifying | 0..1 : 0..M | Capital Project Event ID |  |
| Infrastructure Asset | is repaired by | Work Order | Non-identifying | 1 : 0..M | Infrastructure Asset ID |  |
| Capital Project | causes | Road Closure | Non-identifying | 0..1 : 0..M | Capital Project Event ID |  |
| Development Project | causes | Road Closure | Non-identifying | 0..1 : 0..M | Development Project Event ID | New |
| Calendar Date | schedules | Waste Collection | Non-identifying | 1 : 0..M | Scheduled Collection Date |  |
| Facility | records | Waste Tonnage Record | Non-identifying | 1 : 0..M | Facility Asset ID |  |
| Infrastructure Asset | is sampled by | Water Quality Reading | Non-identifying | 1 : 0..M | Infrastructure Asset ID |  |
| Measure | is measured by | Water Quality Reading | Non-identifying | 1 : 0..M | Measure Code |  |

# Housing & Real Estate subject area

### Entities

| Entity | Kind | Subtype of | Definition |
| :---- | :---- | :---- | :---- |
| Building | Subtype | Asset | A structure on a parcel. Its Asset Location is the parcel it sits on. |
| Dwelling Unit | Subtype | Asset | One home inside a building: a house, apartment or suite. |
| Property Sale | Subtype | Event | A recorded sale of a parcel. Buyer and seller are not kept. |
| Property Assessment | Subtype | Event | The PVSC assessed value of a property for one assessment year. |
| Building Permit | Subtype | Event | A permit issued for new construction, alteration or demolition on a parcel. |
| Rental Market Observation | Subtype | Event | CMHC rental survey results for one zone, unit type and survey date. |
| Short-Term Rental Registration | Subtype | Event | A dwelling unit registered for short-term rental for a period. The host is not kept. |
| Development Project | Subtype | Event | A planning application or development on one or more parcels. Extra parcels are in Event Coverage. |

### Attributes

Key: PK primary key, FK foreign key, AK alternate key group. Null \= whether erwin should allow nulls.

| Entity | Attribute | Key | Domain | Null | Note |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Building | Asset ID | PK/FK | Identifier | No |  |
|  | Building Use Code |  | Code | Yes | Residential, Commercial, Mixed … |
|  | Building Type Code |  | Code | Yes | Detached, Row, Apartment … |
|  | Year Built |  | Year | Yes |  |
|  | Storey Count |  | Count | Yes |  |
|  | Gross Floor Area Square Metres |  | Area Square Metres | Yes |  |
|  | Reported Unit Count |  | Count | Yes | As the source states it |
| Dwelling Unit | Asset ID | PK/FK | Identifier | No |  |
|  | Building Asset ID | FK | Identifier | No | Contains; role name |
|  | Unit Number |  | Reference Code | Yes |  |
|  | Dwelling Type Code |  | Code | Yes |  |
|  | Bedroom Count |  | Count | Yes |  |
|  | Tenure Code |  | Code | Yes | Owner, Rental, Social, Student |
|  | Floor Area Square Metres |  | Area Square Metres | Yes |  |
| Property Sale | Event ID | PK/FK | Identifier | No |  |
|  | Sale Price Amount |  | Amount | No | CAD |
|  | Sale Type Code |  | Code | Yes | Arm's length, Non arm's length |
| Property Assessment | Event ID | PK/FK | Identifier | No |  |
|  | Assessment Year |  | Year | No |  |
|  | Assessment Account Number |  | Reference Code | No | PVSC AAN |
|  | Assessment Class Code |  | Code | No | Residential, Commercial, Resource |
|  | Land Value Amount |  | Amount | Yes | CAD |
|  | Building Value Amount |  | Amount | Yes | CAD |
|  | Assessed Value Amount |  | Amount | No | CAD, as published |
|  | Capped Assessed Value Amount |  | Amount | Yes | CAD, Nova Scotia CAP |
| Building Permit | Event ID | PK/FK | Identifier | No | Event Start \= issued |
|  | Development Project Event ID | FK | Identifier | Yes | Has; role name |
|  | Building Asset ID | FK | Identifier | Yes | Authorizes; role name |
|  | Permit Type Code |  | Code | No | New, Alteration, Demolition |
|  | Work Description |  | Description | Yes |  |
|  | Construction Value Amount |  | Amount | Yes | CAD |
|  | Units Created Count |  | Count | Yes |  |
|  | Units Removed Count |  | Count | Yes |  |
| Rental Market Observation | Event ID | PK/FK | Identifier | No |  |
|  | Bedroom Type Code |  | Code | No | Bachelor, 1, 2, 3+, Total |
|  | Structure Type Code |  | Code | No | Row, Apartment |
|  | Vacancy Rate Percent |  | Percent | Yes |  |
|  | Average Rent Amount |  | Amount | Yes | CAD per month |
|  | Median Rent Amount |  | Amount | Yes | CAD per month |
|  | Universe Unit Count |  | Count | Yes |  |
|  | Data Reliability Code |  | Code | Yes | CMHC a to d |
| Short-Term Rental Registration | Event ID | PK/FK | Identifier | No | Start/End \= valid period |
|  | Dwelling Unit Asset ID | FK | Identifier | No | Registers; role name |
|  | Registration Type Code |  | Code | No | Primary residence, Commercial |
| Development Project | Event ID | PK/FK | Identifier | No |  |
|  | Project Name |  | Name | Yes |  |
|  | Development Type Code |  | Code | Yes |  |
|  | Proposed Unit Count |  | Count | Yes |  |
|  | Affordable Unit Count |  | Count | Yes |  |
|  | Approval Date |  | Date | Yes |  |

### Relationships

| Parent | Verb phrase | Child | Type | Cardinality | Child FK (role name) | Note |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Building | contains | Dwelling Unit | Non-identifying | 1 : 0..M | Building Asset ID |  |
| Dwelling Unit | is registered by | Short-Term Rental Registration | Non-identifying | 1 : 0..M | Dwelling Unit Asset ID |  |
| Development Project | has | Building Permit | Non-identifying | 0..1 : 0..M | Development Project Event ID |  |
| Building | is authorized by | Building Permit | Non-identifying | 0..1 : 0..M | Building Asset ID | Reversed from conceptual |

