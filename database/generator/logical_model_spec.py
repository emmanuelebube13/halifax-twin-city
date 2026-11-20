# Logical model spec: entity -> (subject area, kind, supertype, definition, [attributes])
# attribute: (name, key, domain, null, note)   key: PK, FK, PK/FK, AK1, FK AK1 ...
E = {}
R = []  # (parent, verb, child, type, cardinality, fk/role, note)

def ent(name, area, kind, sup, defn, attrs):
    E[name] = dict(area=area, kind=kind, sup=sup, defn=defn, attrs=attrs)

def rel(parent, verb, child, typ, card, fk, note=""):
    R.append((parent, verb, child, typ, card, fk, note))

C, T, P, H = "Core", "Transportation", "Public Works", "Housing & Real Estate"

# ---------------- CORE ----------------
ent("Sector", C, "Reference", "", "One of the 17 city sectors from the Domain Map (S01 to S17).", [
    ("Sector ID", "PK", "Reference Code", "No", "S04"),
    ("Sector Name", "", "Name", "No", ""),
    ("Sector Description", "", "Description", "Yes", ""),
    ("Phase Number", "", "Count", "Yes", "1 = Phase 1 sector"),
])
ent("Subsector", C, "Reference", "", "One subsector from the Domain Map, such as TRN-01 Passenger Transportation.", [
    ("Subsector ID", "PK", "Reference Code", "No", "TRN-01; CORE-00 for shared core data"),
    ("Sector ID", "FK", "Reference Code", "No", ""),
    ("Subsector Name", "", "Name", "No", ""),
])
ent("Source", C, "Reference", "", "One dataset or feed the twin loads, from the Source Inventory.", [
    ("Source ID", "PK", "Reference Code", "No", "SRC-001"),
    ("Publisher Party ID", "FK", "Identifier", "No", "Role name of Party ID"),
    ("Dataset Name", "", "Name", "No", ""),
    ("Source Format Code", "", "Code", "No", "GTFS, GTFS-RT, ArcGIS REST API, CSV …"),
    ("Access Method Code", "", "Code", "No", "Live feed, API, File download …"),
    ("Cadence Code", "", "Code", "Yes", "Real-time, Daily … Irregular"),
    ("Availability Code", "", "Code", "No", "Open, Mixed, Partner, Private"),
    ("Licence Name", "", "Name", "No", ""),
    ("Attribution Required Flag", "", "Flag", "No", ""),
    ("Record Grain Description", "", "Description", "No", "What one record is"),
    ("Source URL", "", "URL", "No", ""),
    ("Reliability Tier Code", "", "Code", "No", "Tier 1 to Tier 3"),
    ("Source Status Code", "", "Code", "No", "Verified, Not checked …"),
    ("Last Checked Date", "", "Date", "Yes", ""),
])
ent("Calendar Date", C, "Reference", "", "One calendar day, used for the date an event occurs on.", [
    ("Calendar Date", "PK", "Date", "No", ""),
    ("Calendar Year", "", "Year", "No", ""),
    ("Quarter Number", "", "Count", "No", ""),
    ("Month Number", "", "Count", "No", ""),
    ("Week Of Year Number", "", "Count", "No", "ISO week"),
    ("Day Of Week Name", "", "Name", "No", ""),
    ("Weekend Flag", "", "Flag", "No", ""),
    ("Statutory Holiday Flag", "", "Flag", "No", "Nova Scotia"),
    ("Holiday Name", "", "Name", "Yes", ""),
    ("Season Name", "", "Name", "No", ""),
])
ent("Measure", C, "Reference", "", "Something that is counted or measured, with its unit, such as median household income or E. coli count.", [
    ("Measure Code", "PK", "Reference Code", "No", ""),
    ("Measure Name", "", "Name", "No", ""),
    ("Unit Of Measure Code", "", "Code", "No", "CAD, %, mg/L, count …"),
    ("Measure Description", "", "Description", "Yes", ""),
])
ent("Location", C, "Supertype", "", "Any place in the city: a point, line, area, service area or citywide.", [
    ("Location ID", "PK", "Identifier", "No", ""),
    ("Location Type Code", "", "Code", "No", "Discriminator"),
    ("Location Name", "", "Name", "Yes", ""),
    ("Geometry Type Code", "", "Code", "No", "Point, Line, Polygon, None"),
    ("Location Geometry", "", "Geometry", "Yes", "None for Citywide"),
    ("Centroid Latitude", "", "Latitude", "Yes", ""),
    ("Centroid Longitude", "", "Longitude", "Yes", ""),
    ("Source ID", "FK AK1", "Reference Code", "No", ""),
    ("Source Location Key", "AK1", "Source Key", "No", "Key as the source gives it"),
    ("Start Date", "", "Date", "Yes", "Lifecycle: created"),
    ("End Date", "", "Date", "Yes", "Lifecycle: retired"),
])
ent("Street", C, "Subtype", "Location", "A named street, made up of street segments.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Street Name", "", "Name", "No", ""),
    ("Street Type Code", "", "Code", "Yes", "St, Ave, Rd …"),
    ("Street Direction Code", "", "Code", "Yes", ""),
    ("Road Jurisdiction Code", "", "Code", "No", "Municipal, Provincial, Private"),
])
ent("Street Segment", C, "Subtype", "Location", "The stretch of one street between two intersections.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Street Location ID", "FK", "Identifier", "No", "Role name: the street"),
    ("From Intersection Location ID", "FK", "Identifier", "Yes", "Role name"),
    ("To Intersection Location ID", "FK", "Identifier", "Yes", "Role name"),
    ("Segment Length Metres", "", "Length Metres", "Yes", ""),
    ("Road Class Code", "", "Code", "Yes", "Arterial, Collector, Local …"),
    ("Speed Limit Kph", "", "Count", "Yes", ""),
    ("Lane Count", "", "Count", "Yes", ""),
    ("One Way Flag", "", "Flag", "Yes", ""),
])
ent("Intersection", C, "Subtype", "Location", "A point where two or more street segments meet.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Intersection Name", "", "Name", "Yes", "Barrington St & Spring Garden Rd"),
    ("Traffic Control Code", "", "Code", "Yes", "Signal, Stop, Roundabout, None"),
])
ent("Area", C, "Subtype", "Location", "A bounded area: neighbourhood, census tract, council district, CMHC zone, snow or waste zone, zoning zone.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Area Type Code", "", "Code", "No", ""),
    ("Area Code", "", "Code", "Yes", "Official code, e.g. census DGUID"),
    ("Parent Area Location ID", "FK", "Identifier", "Yes", "Recursive; role name"),
    ("Area Square Km", "", "Area Square Km", "Yes", ""),
])
ent("Civic Address", C, "Subtype", "Location", "A civic number on a street, located on one parcel.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Street Location ID", "FK", "Identifier", "No", "Role name: the street"),
    ("Parcel Location ID", "FK", "Identifier", "No", "Role name: the parcel"),
    ("Civic Number", "", "Count", "No", ""),
    ("Civic Number Suffix", "", "Code", "Yes", "A, B, ½"),
    ("Postal Code", "", "Code", "Yes", ""),
])
ent("Parcel", C, "Subtype", "Location", "A legal land parcel, identified by its Nova Scotia PID.", [
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Parcel PID", "AK2", "Reference Code", "No", "Property Identification Number"),
    ("Parcel Area Square Metres", "", "Area Square Metres", "Yes", ""),
    ("Land Use Code", "", "Code", "Yes", ""),
])
ent("Location Containment", C, "Associative", "", "One location lying inside or overlapping another, such as a parcel inside a neighbourhood. Resolves the Street Segment–Area and Area–Parcel many-to-many lines.", [
    ("Containing Location ID", "PK/FK", "Identifier", "No", "Role name; usually an Area"),
    ("Contained Location ID", "PK/FK", "Identifier", "No", "Role name"),
    ("Overlap Percent", "", "Percent", "Yes", "Share of the contained location inside"),
    ("Containment Method Code", "", "Code", "No", "Spatial join, Published by source"),
])
ent("Party", C, "Supertype", "", "An organization that owns, operates, publishes or takes part in something. People are reserved for a later phase.", [
    ("Party ID", "PK", "Identifier", "No", ""),
    ("Party Type Code", "", "Code", "No", "Discriminator: Organization (Person reserved)"),
    ("Party Name", "", "Name", "No", ""),
    ("Source ID", "FK AK1", "Reference Code", "Yes", "Optional: avoids a loop with Source"),
    ("Source Party Key", "AK1", "Source Key", "Yes", ""),
])
ent("Organization", C, "Subtype", "Party", "A government body, agency, utility, company or non-profit.", [
    ("Party ID", "PK/FK", "Identifier", "No", ""),
    ("Organization Type Code", "", "Code", "No", ""),
    ("Legal Name", "", "Name", "Yes", ""),
    ("Business Number", "", "Reference Code", "Yes", "CRA business number"),
    ("Website URL", "", "URL", "Yes", ""),
])
ent("Party Sector Classification", C, "Associative", "", "The subsectors a party works in. Replaces Sector classifies Party.", [
    ("Party ID", "PK/FK", "Identifier", "No", ""),
    ("Subsector ID", "PK/FK", "Reference Code", "No", ""),
    ("Primary Classification Flag", "", "Flag", "No", ""),
])
ent("Asset", C, "Supertype", "", "A physical thing the city depends on: route, stop, vehicle, road asset, facility, building, dwelling unit.", [
    ("Asset ID", "PK", "Identifier", "No", ""),
    ("Asset Type Code", "", "Code", "No", "Discriminator"),
    ("Asset Name", "", "Name", "Yes", ""),
    ("Location ID", "FK", "Identifier", "Yes", "Located at; empty for vehicles"),
    ("Subsector ID", "FK", "Reference Code", "No", ""),
    ("Source ID", "FK AK1", "Reference Code", "No", ""),
    ("Source Asset Key", "AK1", "Source Key", "No", "e.g. GTFS route_id, stop_id"),
    ("Asset Status Code", "", "Code", "No", "Active, Planned, Retired"),
    ("In Service Date", "", "Date", "Yes", ""),
    ("Out Of Service Date", "", "Date", "Yes", ""),
])
ent("Party Asset Role", C, "Associative", "", "A party owning, operating or maintaining an asset for a period. Replaces Party owns/operates Asset.", [
    ("Party ID", "PK/FK", "Identifier", "No", ""),
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Asset Role Code", "PK", "Code", "No", "Owner, Operator, Maintainer"),
    ("Role Start Date", "PK", "Date", "No", ""),
    ("Role End Date", "", "Date", "Yes", ""),
])
ent("Event", C, "Supertype", "", "Something that happens at a place and time and is reported by a source: a trip, a repair, a sale, a reading.", [
    ("Event ID", "PK", "Identifier", "No", ""),
    ("Event Type Code", "", "Code", "No", "Discriminator"),
    ("Event Start Timestamp", "", "Timestamp", "No", "UTC"),
    ("Event End Timestamp", "", "Timestamp", "Yes", "UTC"),
    ("Event Date", "FK", "Date", "No", "Role name of Calendar Date; occurs on"),
    ("Location ID", "FK", "Identifier", "Yes", "Occurs at; see the location rules"),
    ("Subsector ID", "FK", "Reference Code", "No", ""),
    ("Source ID", "FK AK1", "Reference Code", "No", "Reported by"),
    ("Source Event Key", "AK1", "Source Key", "No", "Permit no., request no. …"),
    ("Event Status Code", "", "Code", "Yes", ""),
])
ent("Event Asset Involvement", C, "Associative", "", "An asset taking part in an event in a named role, such as a route affected by a service alert. Replaces Event involves Asset and Service Alert affects Route/Stop.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Involvement Role Code", "PK", "Code", "No", "Affected, Measured, Used …"),
])
ent("Event Party Involvement", C, "Associative", "", "A party taking part in an event in a named role, such as the contractor on a work order. Replaces Event involves Party.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Party ID", "PK/FK", "Identifier", "No", ""),
    ("Involvement Role Code", "PK", "Code", "No", "Reporter, Responsible, Contractor, Applicant"),
])
ent("Event Coverage", C, "Associative", "", "Extra locations an event covers beyond its main one, such as every street segment in a road closure. Replaces Road Closure on Street Segment, Utility Outage affects Area, Public Advisory covers Area.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Location ID", "PK/FK", "Identifier", "No", ""),
    ("Coverage Role Code", "PK", "Code", "No", "Affected, Closed, Detour"),
])
ent("Weather Observation", C, "Subtype", "Event", "Weather recorded for an area over one hour or one day.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Observation Interval Code", "", "Code", "No", "Hourly, Daily"),
    ("Air Temperature Celsius", "", "Measure Value", "Yes", ""),
    ("Precipitation Mm", "", "Measure Value", "Yes", ""),
    ("Snowfall Cm", "", "Measure Value", "Yes", ""),
    ("Snow On Ground Cm", "", "Measure Value", "Yes", ""),
    ("Mean Wind Speed Kph", "", "Measure Value", "Yes", ""),
    ("Max Gust Kph", "", "Measure Value", "Yes", ""),
    ("Weather Condition Code", "", "Code", "Yes", ""),
])
ent("Area Statistic", C, "Subtype", "Event", "One published statistic for one area and period, such as population of a census tract in 2021.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Measure Code", "FK", "Reference Code", "No", ""),
    ("Statistic Value", "", "Measure Value", "No", ""),
])
ent("Economic Indicator", C, "Subtype", "Event", "One value of an economic series for a period, such as the Bank of Canada policy rate.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Measure Code", "FK", "Reference Code", "No", ""),
    ("Indicator Value", "", "Measure Value", "No", ""),
    ("Period Type Code", "", "Code", "No", "Monthly, Quarterly, Annual"),
])

# ---------------- TRANSPORTATION ----------------
ent("Schedule Version", T, "Reference", "", "One published GTFS schedule file. Every version is kept to judge past trips.", [
    ("Schedule Version ID", "PK", "Identifier", "No", ""),
    ("Source ID", "FK", "Reference Code", "No", "SRC-004"),
    ("Feed Version Label", "", "Name", "Yes", "feed_info.feed_version"),
    ("Feed Published Date", "", "Date", "No", ""),
    ("Service Period Start Date", "", "Date", "No", ""),
    ("Service Period End Date", "", "Date", "No", ""),
])
ent("Service Calendar", T, "Reference", "", "A GTFS service pattern: the weekdays a set of trips runs within a version (calendar.txt).", [
    ("Schedule Version ID", "PK/FK", "Identifier", "No", ""),
    ("Service Code", "PK", "Source Key", "No", "GTFS service_id"),
    ("Monday Flag", "", "Flag", "No", "Same for Tuesday to Sunday: 7 flags"),
    ("Start Date", "", "Date", "No", ""),
    ("End Date", "", "Date", "No", ""),
])
ent("Service Calendar Exception", T, "Reference", "", "A date a service pattern is added or removed, such as a holiday (calendar_dates.txt).", [
    ("Schedule Version ID", "PK/FK", "Identifier", "No", ""),
    ("Service Code", "PK/FK", "Source Key", "No", ""),
    ("Exception Date", "PK/FK", "Date", "No", "Role name of Calendar Date"),
    ("Exception Type Code", "", "Code", "No", "Added, Removed"),
])
ent("Route", T, "Subtype", "Asset", "A public bus or ferry route.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Route Short Name", "", "Name", "No", "1, 9A, Alderney Ferry"),
    ("Route Long Name", "", "Name", "Yes", ""),
    ("Route Mode Code", "", "Code", "No", "Bus, Ferry"),
])
ent("Stop", T, "Subtype", "Asset", "A bus stop, ferry terminal or station where riders board.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Stop Code", "AK2", "Reference Code", "Yes", "Public stop number"),
    ("Stop Name", "", "Name", "No", ""),
    ("Stop Kind Code", "", "Code", "No", "Stop, Station, Ferry terminal"),
    ("Parent Stop Asset ID", "FK", "Identifier", "Yes", "Recursive; role name"),
    ("Wheelchair Boarding Code", "", "Code", "Yes", ""),
    ("Shelter Flag", "", "Flag", "Yes", "From Transit Shelters layer"),
])
ent("Vehicle", T, "Subtype", "Asset", "A bus or ferry in the transit fleet.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Vehicle Label", "", "Name", "Yes", "Fleet number"),
    ("Vehicle Mode Code", "", "Code", "No", "Bus, Ferry"),
])
ent("Route Segment", T, "Subtype", "Asset", "The path between two consecutive stops, shared by every route that uses it.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("From Stop Asset ID", "FK AK2", "Identifier", "No", "Starts at; role name"),
    ("To Stop Asset ID", "FK AK2", "Identifier", "No", "Ends at; role name"),
    ("Segment Length Metres", "", "Length Metres", "Yes", ""),
])
ent("Route Segment Sequence", T, "Associative", "", "The ordered segments a route runs through in one direction, per schedule version. Resolves Route made of Route Segment.", [
    ("Schedule Version ID", "PK/FK", "Identifier", "No", ""),
    ("Route Asset ID", "PK/FK", "Identifier", "No", "Role name"),
    ("Direction Code", "PK", "Code", "No", "0, 1"),
    ("Segment Sequence Number", "PK", "Count", "No", ""),
    ("Route Segment Asset ID", "FK", "Identifier", "No", "Role name"),
])
ent("Route Segment Street Segment", T, "Associative", "", "The street segments a route segment runs along, in order. Resolves Route Segment runs along Street Segment.", [
    ("Route Segment Asset ID", "PK/FK", "Identifier", "No", "Role name"),
    ("Street Segment Location ID", "PK/FK", "Identifier", "No", "Role name"),
    ("Path Sequence Number", "", "Count", "No", ""),
    ("Overlap Length Metres", "", "Length Metres", "Yes", ""),
])
ent("Scheduled Trip", T, "Reference", "", "One trip as planned in a schedule version (GTFS trips.txt). It repeats on every day its service runs.", [
    ("Scheduled Trip ID", "PK", "Identifier", "No", ""),
    ("Schedule Version ID", "FK AK1", "Identifier", "No", "Part of the FK to Service Calendar"),
    ("Service Code", "FK", "Source Key", "No", "Part of the FK to Service Calendar"),
    ("Source Trip Key", "AK1", "Source Key", "No", "GTFS trip_id"),
    ("Route Asset ID", "FK", "Identifier", "No", "Role name"),
    ("Direction Code", "", "Code", "No", "0, 1"),
    ("Trip Headsign", "", "Name", "Yes", ""),
    ("Block Code", "", "Source Key", "Yes", "Vehicle duty"),
    ("Shape Key", "", "Source Key", "Yes", "GTFS shape_id"),
    ("Wheelchair Accessible Code", "", "Code", "Yes", ""),
])
ent("Scheduled Stop Time", T, "Reference", "", "When a scheduled trip is planned to reach one stop (GTFS stop_times.txt).", [
    ("Scheduled Trip ID", "PK/FK", "Identifier", "No", ""),
    ("Stop Sequence Number", "PK", "Count", "No", ""),
    ("Stop Asset ID", "FK", "Identifier", "No", "Role name"),
    ("Scheduled Arrival Time", "", "Service Day Time", "Yes", "Can pass 24:00:00"),
    ("Scheduled Departure Time", "", "Service Day Time", "Yes", ""),
    ("Timepoint Flag", "", "Flag", "Yes", ""),
    ("Pickup Type Code", "", "Code", "Yes", ""),
    ("Drop Off Type Code", "", "Code", "Yes", ""),
])
ent("Trip", T, "Subtype", "Event", "One run of a trip on one service date, whether it ran, was cancelled or was added.", [
    ("Event ID", "PK/FK", "Identifier", "No", "Event Date = service date"),
    ("Scheduled Trip ID", "FK AK2", "Identifier", "Yes", "Empty for added trips"),
    ("Route Asset ID", "FK", "Identifier", "No", "Role name; must match the scheduled trip's route"),
    ("Vehicle Asset ID", "FK", "Identifier", "Yes", "Operates; role name"),
    ("Trip Schedule Status Code", "", "Code", "No", "Scheduled, Added, Cancelled"),
    ("Actual Start Timestamp", "", "Timestamp", "Yes", "Event Start = planned start"),
    ("Actual End Timestamp", "", "Timestamp", "Yes", ""),
])
ent("Stop Arrival", T, "Subtype", "Event", "A trip actually reaching a stop on one service date.", [
    ("Event ID", "PK/FK", "Identifier", "No", "Event Start = actual arrival"),
    ("Trip Event ID", "FK AK2", "Identifier", "No", "Role name"),
    ("Stop Sequence Number", "AK2", "Count", "No", ""),
    ("Stop Asset ID", "FK", "Identifier", "No", "Role name"),
    ("Actual Departure Timestamp", "", "Timestamp", "Yes", ""),
    ("Reported Delay Seconds", "", "Count", "Yes", "As the feed reports it; signed"),
    ("Arrival Observation Method Code", "", "Code", "No", "Reported, Inferred from positions"),
])
ent("Vehicle Position", T, "Subtype", "Event", "Where one vehicle was at one moment (GTFS-RT).", [
    ("Event ID", "PK/FK", "Identifier", "No", "Event Start = position time"),
    ("Vehicle Asset ID", "FK", "Identifier", "No", "Records; role name"),
    ("Trip Event ID", "FK", "Identifier", "Yes", "Tracked by; empty when not in service"),
    ("Position Latitude", "", "Latitude", "No", ""),
    ("Position Longitude", "", "Longitude", "No", ""),
    ("Bearing Degrees", "", "Measure Value", "Yes", ""),
    ("Speed Metres Per Second", "", "Measure Value", "Yes", ""),
    ("Current Stop Sequence Number", "", "Count", "Yes", ""),
    ("Vehicle Stop Status Code", "", "Code", "Yes", "Incoming, Stopped, In transit"),
    ("Occupancy Status Code", "", "Code", "Yes", ""),
])
ent("Service Alert", T, "Subtype", "Event", "A published detour, stop closure or service change (GTFS-RT).", [
    ("Event ID", "PK/FK", "Identifier", "No", "Start/End = active period"),
    ("Alert Cause Code", "", "Code", "Yes", ""),
    ("Alert Effect Code", "", "Code", "Yes", "Detour, No service, Stop moved …"),
    ("Alert Header Text", "", "Text", "No", ""),
    ("Alert Description Text", "", "Long Text", "Yes", ""),
    ("Alert URL", "", "URL", "Yes", ""),
])
ent("Collision", T, "Subtype", "Event", "One reported traffic collision.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Collision Severity Code", "", "Code", "No", "Fatal, Injury, Property damage"),
    ("Vehicle Count", "", "Count", "Yes", ""),
    ("Pedestrian Involved Flag", "", "Flag", "Yes", ""),
    ("Bicycle Involved Flag", "", "Flag", "Yes", ""),
    ("Road Surface Condition Code", "", "Code", "Yes", ""),
    ("Light Condition Code", "", "Code", "Yes", ""),
    ("Weather Condition Code", "", "Code", "Yes", ""),
])
ent("Traffic Count", T, "Subtype", "Event", "One traffic or bicycle count at one location over a study period.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Count Type Code", "", "Code", "No", "Volume, Turning movement, Speed, Classification, Bicycle"),
    ("Count Direction Code", "", "Code", "Yes", ""),
    ("Total Volume Count", "", "Count", "Yes", ""),
    ("AADT Count", "", "Count", "Yes", "Annual average daily traffic"),
    ("AAWT Count", "", "Count", "Yes", "Annual average weekday traffic"),
    ("Speed 85th Percentile Kph", "", "Measure Value", "Yes", ""),
    ("Heavy Vehicle Percent", "", "Percent", "Yes", ""),
])

# ---------------- PUBLIC WORKS ----------------
ent("Infrastructure Asset", P, "Subtype", "Asset", "A piece of public infrastructure: road surface, sidewalk, streetlight, sign, hydrant, pipe, tree, park amenity, sampling point.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Infrastructure Class Code", "", "Code", "No", ""),
    ("Material Code", "", "Code", "Yes", ""),
    ("Condition Rating Code", "", "Code", "Yes", "As last reported"),
])
ent("Facility", P, "Subtype", "Asset", "A building or site the city runs: depot, waste facility, treatment plant, terminal, recreation centre.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Facility Type Code", "", "Code", "No", ""),
    ("Capacity Quantity", "", "Measure Value", "Yes", ""),
    ("Capacity Unit Code", "", "Code", "Yes", ""),
    ("Public Access Flag", "", "Flag", "Yes", ""),
])
ent("Service Request", P, "Subtype", "Event", "A 311 request from the public. Event End = closed.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Request Type Code", "", "Code", "No", ""),
    ("Request Category Code", "", "Code", "Yes", ""),
    ("Request Channel Code", "", "Code", "Yes", "Phone, Web, App"),
])
ent("Work Order", P, "Subtype", "Event", "A job to inspect, repair or maintain an infrastructure asset.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Service Request Event ID", "FK", "Identifier", "Yes", "Results in; role name"),
    ("Capital Project Event ID", "FK", "Identifier", "Yes", "Includes; role name"),
    ("Infrastructure Asset ID", "FK", "Identifier", "No", "Repairs; role name"),
    ("Work Type Code", "", "Code", "No", ""),
    ("Work Priority Code", "", "Code", "Yes", ""),
    ("Planned Date", "", "Date", "Yes", ""),
])
ent("Capital Project", P, "Subtype", "Event", "A funded construction or renewal project. Event Start/End = actual dates.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Project Name", "", "Name", "No", ""),
    ("Capital Project Type Code", "", "Code", "Yes", ""),
    ("Budget Amount", "", "Amount", "Yes", "CAD"),
    ("Actual Cost Amount", "", "Amount", "Yes", "CAD"),
    ("Planned Start Date", "", "Date", "Yes", ""),
    ("Planned End Date", "", "Date", "Yes", ""),
])
ent("Road Closure", P, "Subtype", "Event", "A full or partial closure of streets for a period. Closed segments are in Event Coverage.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Capital Project Event ID", "FK", "Identifier", "Yes", "Causes; role name"),
    ("Development Project Event ID", "FK", "Identifier", "Yes", "Causes; role name (new)"),
    ("Closure Type Code", "", "Code", "No", "Full, Partial, Lane, Sidewalk"),
    ("Closure Reason Code", "", "Code", "Yes", ""),
    ("Detour Description", "", "Description", "Yes", ""),
])
ent("Snow Clearing", P, "Subtype", "Event", "One plowing, salting or sidewalk-clearing pass on a street segment.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Clearing Activity Code", "", "Code", "No", "Plow, Salt, Sand, Sidewalk"),
    ("Clearing Priority Code", "", "Code", "Yes", ""),
])
ent("Pavement Condition Assessment", P, "Subtype", "Event", "A rating of one street segment's pavement.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Pavement Condition Index", "", "Measure Value", "Yes", "0 to 100"),
    ("Condition Rating Code", "", "Code", "Yes", ""),
    ("Assessment Method Code", "", "Code", "Yes", ""),
])
ent("Waste Collection", P, "Subtype", "Event", "One scheduled garbage, recycling or organics pickup at a civic address.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Waste Stream Code", "", "Code", "No", "Garbage, Recycling, Organics"),
    ("Scheduled Collection Date", "FK", "Date", "No", "Role name of Calendar Date"),
    ("Collection Outcome Code", "", "Code", "No", "Collected, Missed, Late"),
])
ent("Waste Tonnage Record", P, "Subtype", "Event", "Tonnes of one waste stream received at a facility in a period.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Facility Asset ID", "FK", "Identifier", "No", "Recorded at; role name"),
    ("Waste Stream Code", "", "Code", "No", ""),
    ("Disposal Destination Code", "", "Code", "No", "Landfill, Recycling, Compost"),
    ("Tonnage Quantity", "", "Measure Value", "No", "Tonnes"),
])
ent("Water Quality Reading", P, "Subtype", "Event", "One lab or sensor reading of one water quality measure at a sampling point.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Infrastructure Asset ID", "FK", "Identifier", "No", "Sampled at; role name"),
    ("Measure Code", "FK", "Reference Code", "No", ""),
    ("Reading Value", "", "Measure Value", "No", ""),
    ("Exceedance Flag", "", "Flag", "Yes", "Above guideline"),
])
ent("Utility Outage", P, "Subtype", "Event", "A loss of electricity, water or wastewater service. Affected areas are in Event Coverage.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Utility Type Code", "", "Code", "No", "Electricity, Water, Wastewater, Gas"),
    ("Customers Affected Count", "", "Count", "Yes", ""),
    ("Outage Cause Code", "", "Code", "Yes", ""),
    ("Estimated Restoration Timestamp", "", "Timestamp", "Yes", ""),
])
ent("Public Advisory", P, "Subtype", "Event", "A public notice such as a boil-water advisory or winter parking ban. Covered areas are in Event Coverage.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Advisory Type Code", "", "Code", "No", ""),
    ("Advisory Severity Code", "", "Code", "Yes", ""),
    ("Advisory Text", "", "Long Text", "Yes", ""),
    ("Advisory URL", "", "URL", "Yes", ""),
])

# ---------------- HOUSING ----------------
ent("Building", H, "Subtype", "Asset", "A structure on a parcel. Its Asset Location is the parcel it sits on.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Building Use Code", "", "Code", "Yes", "Residential, Commercial, Mixed …"),
    ("Building Type Code", "", "Code", "Yes", "Detached, Row, Apartment …"),
    ("Year Built", "", "Year", "Yes", ""),
    ("Storey Count", "", "Count", "Yes", ""),
    ("Gross Floor Area Square Metres", "", "Area Square Metres", "Yes", ""),
    ("Reported Unit Count", "", "Count", "Yes", "As the source states it"),
])
ent("Dwelling Unit", H, "Subtype", "Asset", "One home inside a building: a house, apartment or suite.", [
    ("Asset ID", "PK/FK", "Identifier", "No", ""),
    ("Building Asset ID", "FK", "Identifier", "No", "Contains; role name"),
    ("Unit Number", "", "Reference Code", "Yes", ""),
    ("Dwelling Type Code", "", "Code", "Yes", ""),
    ("Bedroom Count", "", "Count", "Yes", ""),
    ("Tenure Code", "", "Code", "Yes", "Owner, Rental, Social, Student"),
    ("Floor Area Square Metres", "", "Area Square Metres", "Yes", ""),
])
ent("Property Sale", H, "Subtype", "Event", "A recorded sale of a parcel. Buyer and seller are not kept.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Sale Price Amount", "", "Amount", "No", "CAD"),
    ("Sale Type Code", "", "Code", "Yes", "Arm's length, Non arm's length"),
])
ent("Property Assessment", H, "Subtype", "Event", "The PVSC assessed value of a property for one assessment year.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Assessment Year", "", "Year", "No", ""),
    ("Assessment Account Number", "", "Reference Code", "No", "PVSC AAN"),
    ("Assessment Class Code", "", "Code", "No", "Residential, Commercial, Resource"),
    ("Land Value Amount", "", "Amount", "Yes", "CAD"),
    ("Building Value Amount", "", "Amount", "Yes", "CAD"),
    ("Assessed Value Amount", "", "Amount", "No", "CAD, as published"),
    ("Capped Assessed Value Amount", "", "Amount", "Yes", "CAD, Nova Scotia CAP"),
])
ent("Building Permit", H, "Subtype", "Event", "A permit issued for new construction, alteration or demolition on a parcel.", [
    ("Event ID", "PK/FK", "Identifier", "No", "Event Start = issued"),
    ("Development Project Event ID", "FK", "Identifier", "Yes", "Has; role name"),
    ("Building Asset ID", "FK", "Identifier", "Yes", "Authorizes; role name"),
    ("Permit Type Code", "", "Code", "No", "New, Alteration, Demolition"),
    ("Work Description", "", "Description", "Yes", ""),
    ("Construction Value Amount", "", "Amount", "Yes", "CAD"),
    ("Units Created Count", "", "Count", "Yes", ""),
    ("Units Removed Count", "", "Count", "Yes", ""),
])
ent("Rental Market Observation", H, "Subtype", "Event", "CMHC rental survey results for one zone, unit type and survey date.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Bedroom Type Code", "", "Code", "No", "Bachelor, 1, 2, 3+, Total"),
    ("Structure Type Code", "", "Code", "No", "Row, Apartment"),
    ("Vacancy Rate Percent", "", "Percent", "Yes", ""),
    ("Average Rent Amount", "", "Amount", "Yes", "CAD per month"),
    ("Median Rent Amount", "", "Amount", "Yes", "CAD per month"),
    ("Universe Unit Count", "", "Count", "Yes", ""),
    ("Data Reliability Code", "", "Code", "Yes", "CMHC a to d"),
])
ent("Short-Term Rental Registration", H, "Subtype", "Event", "A dwelling unit registered for short-term rental for a period. The host is not kept.", [
    ("Event ID", "PK/FK", "Identifier", "No", "Start/End = valid period"),
    ("Dwelling Unit Asset ID", "FK", "Identifier", "No", "Registers; role name"),
    ("Registration Type Code", "", "Code", "No", "Primary residence, Commercial"),
])
ent("Development Project", H, "Subtype", "Event", "A planning application or development on one or more parcels. Extra parcels are in Event Coverage.", [
    ("Event ID", "PK/FK", "Identifier", "No", ""),
    ("Project Name", "", "Name", "Yes", ""),
    ("Development Type Code", "", "Code", "Yes", ""),
    ("Proposed Unit Count", "", "Count", "Yes", ""),
    ("Affordable Unit Count", "", "Count", "Yes", ""),
    ("Approval Date", "", "Date", "Yes", ""),
])

# ---------------- RELATIONSHIPS ----------------
NI, ID, ST = "Non-identifying", "Identifying", "Subtype"
# Core
rel("Sector", "contains", "Subsector", NI, "1 : 0..M", "Sector ID")
rel("Party", "publishes", "Source", NI, "1 : 0..M", "Publisher Party ID")
rel("Location", "is a", "Street, Street Segment, Intersection, Area, Civic Address, Parcel", ST, "Exclusive, incomplete", "Location Type Code", "Points, lines, service areas and Citywide need no subtype")
rel("Source", "provides", "Location", NI, "1 : 0..M", "Source ID")
rel("Street", "has", "Street Segment", NI, "1 : 1..M", "Street Location ID")
rel("Intersection", "starts", "Street Segment", NI, "0..1 : 0..M", "From Intersection Location ID", "Replaces Street Segment connects Intersection (M:N)")
rel("Intersection", "ends", "Street Segment", NI, "0..1 : 0..M", "To Intersection Location ID", "")
rel("Area", "contains", "Area", NI, "0..1 : 0..M", "Parent Area Location ID", "Recursive")
rel("Street", "has", "Civic Address", NI, "1 : 0..M", "Street Location ID")
rel("Parcel", "has", "Civic Address", NI, "1 : 0..M", "Parcel Location ID", "Civic Address located on Parcel")
rel("Location", "contains", "Location Containment", ID, "1 : 0..M", "Containing Location ID")
rel("Location", "is contained in", "Location Containment", ID, "1 : 0..M", "Contained Location ID")
rel("Party", "is a", "Organization", ST, "Exclusive, incomplete", "Party Type Code", "Person reserved")
rel("Source", "provides", "Party", NI, "0..1 : 0..M", "Source ID")
rel("Party", "is classified by", "Party Sector Classification", ID, "1 : 0..M", "Party ID")
rel("Subsector", "classifies", "Party Sector Classification", ID, "1 : 0..M", "Subsector ID")
rel("Asset", "is a", "Route, Stop, Vehicle, Route Segment, Infrastructure Asset, Facility, Building, Dwelling Unit", ST, "Exclusive, incomplete", "Asset Type Code", "Counter sites and weather stations stay generic Assets")
rel("Location", "locates", "Asset", NI, "0..1 : 0..M", "Location ID", "Located at")
rel("Subsector", "classifies", "Asset", NI, "1 : 0..M", "Subsector ID")
rel("Source", "provides", "Asset", NI, "1 : 0..M", "Source ID")
rel("Party", "plays", "Party Asset Role", ID, "1 : 0..M", "Party ID")
rel("Asset", "has", "Party Asset Role", ID, "1 : 0..M", "Asset ID")
rel("Event", "is a", "all event subtypes", ST, "Exclusive, complete", "Event Type Code")
rel("Calendar Date", "is the date of", "Event", NI, "1 : 0..M", "Event Date", "Occurs on")
rel("Location", "is the place of", "Event", NI, "0..1 : 0..M", "Location ID", "Occurs at")
rel("Subsector", "classifies", "Event", NI, "1 : 0..M", "Subsector ID")
rel("Source", "reports", "Event", NI, "1 : 0..M", "Source ID")
rel("Event", "involves", "Event Asset Involvement", ID, "1 : 0..M", "Event ID")
rel("Asset", "is involved in", "Event Asset Involvement", ID, "1 : 0..M", "Asset ID")
rel("Event", "involves", "Event Party Involvement", ID, "1 : 0..M", "Event ID")
rel("Party", "is involved in", "Event Party Involvement", ID, "1 : 0..M", "Party ID")
rel("Event", "covers", "Event Coverage", ID, "1 : 0..M", "Event ID")
rel("Location", "is covered by", "Event Coverage", ID, "1 : 0..M", "Location ID")
rel("Measure", "is measured by", "Area Statistic", NI, "1 : 0..M", "Measure Code")
rel("Measure", "is measured by", "Economic Indicator", NI, "1 : 0..M", "Measure Code")
# Transportation
rel("Source", "publishes", "Schedule Version", NI, "1 : 0..M", "Source ID")
rel("Schedule Version", "defines", "Service Calendar", ID, "1 : 1..M", "Schedule Version ID")
rel("Service Calendar", "has", "Service Calendar Exception", ID, "1 : 0..M", "Schedule Version ID, Service Code")
rel("Calendar Date", "is the date of", "Service Calendar Exception", ID, "1 : 0..M", "Exception Date")
rel("Stop", "contains", "Stop", NI, "0..1 : 0..M", "Parent Stop Asset ID", "Recursive: station and its platforms")
rel("Stop", "starts", "Route Segment", NI, "1 : 0..M", "From Stop Asset ID", "Starts at")
rel("Stop", "ends", "Route Segment", NI, "1 : 0..M", "To Stop Asset ID", "Ends at")
rel("Schedule Version", "orders", "Route Segment Sequence", ID, "1 : 0..M", "Schedule Version ID")
rel("Route", "is made of", "Route Segment Sequence", ID, "1 : 0..M", "Route Asset ID")
rel("Route Segment", "appears in", "Route Segment Sequence", NI, "1 : 0..M", "Route Segment Asset ID")
rel("Route Segment", "runs along", "Route Segment Street Segment", ID, "1 : 1..M", "Route Segment Asset ID")
rel("Street Segment", "carries", "Route Segment Street Segment", ID, "1 : 0..M", "Street Segment Location ID")
rel("Service Calendar", "governs", "Scheduled Trip", NI, "1 : 0..M", "Schedule Version ID, Service Code")
rel("Route", "has", "Scheduled Trip", NI, "1 : 0..M", "Route Asset ID")
rel("Scheduled Trip", "has", "Scheduled Stop Time", ID, "1 : 1..M", "Scheduled Trip ID")
rel("Stop", "has", "Scheduled Stop Time", NI, "1 : 0..M", "Stop Asset ID")
rel("Scheduled Trip", "runs as", "Trip", NI, "0..1 : 0..M", "Scheduled Trip ID", "One Trip per service date")
rel("Route", "has", "Trip", NI, "1 : 0..M", "Route Asset ID")
rel("Vehicle", "operates", "Trip", NI, "0..1 : 0..M", "Vehicle Asset ID")
rel("Trip", "reaches", "Stop Arrival", NI, "1 : 0..M", "Trip Event ID", "Fulfils Scheduled Stop Time via Scheduled Trip + Stop Sequence")
rel("Stop", "receives", "Stop Arrival", NI, "1 : 0..M", "Stop Asset ID")
rel("Vehicle", "records", "Vehicle Position", NI, "1 : 0..M", "Vehicle Asset ID")
rel("Trip", "is tracked by", "Vehicle Position", NI, "0..1 : 0..M", "Trip Event ID")
# Public Works
rel("Service Request", "results in", "Work Order", NI, "0..1 : 0..M", "Service Request Event ID")
rel("Capital Project", "includes", "Work Order", NI, "0..1 : 0..M", "Capital Project Event ID")
rel("Infrastructure Asset", "is repaired by", "Work Order", NI, "1 : 0..M", "Infrastructure Asset ID")
rel("Capital Project", "causes", "Road Closure", NI, "0..1 : 0..M", "Capital Project Event ID")
rel("Development Project", "causes", "Road Closure", NI, "0..1 : 0..M", "Development Project Event ID", "New")
rel("Calendar Date", "schedules", "Waste Collection", NI, "1 : 0..M", "Scheduled Collection Date")
rel("Facility", "records", "Waste Tonnage Record", NI, "1 : 0..M", "Facility Asset ID")
rel("Infrastructure Asset", "is sampled by", "Water Quality Reading", NI, "1 : 0..M", "Infrastructure Asset ID")
rel("Measure", "is measured by", "Water Quality Reading", NI, "1 : 0..M", "Measure Code")
# Housing
rel("Building", "contains", "Dwelling Unit", NI, "1 : 0..M", "Building Asset ID")
rel("Dwelling Unit", "is registered by", "Short-Term Rental Registration", NI, "1 : 0..M", "Dwelling Unit Asset ID")
rel("Development Project", "has", "Building Permit", NI, "0..1 : 0..M", "Development Project Event ID")
rel("Building", "is authorized by", "Building Permit", NI, "0..1 : 0..M", "Building Asset ID", "Reversed from conceptual")

# Location rules for Event / Asset Location ID
LOCRULE = [
    ("Vehicle Position", "None: uses Position Latitude/Longitude"),
    ("Trip", "None: placed by its route"),
    ("Stop Arrival", "None required: the stop is in Stop Asset ID"),
    ("Collision", "Intersection or Street Segment"),
    ("Traffic Count", "Street Segment or Intersection"),
    ("Snow Clearing", "Street Segment"),
    ("Pavement Condition Assessment", "Street Segment"),
    ("Road Closure", "Street Segment (others in Event Coverage)"),
    ("Waste Collection", "Civic Address"),
    ("Utility Outage, Public Advisory", "Area (others in Event Coverage)"),
    ("Property Sale, Property Assessment, Building Permit", "Parcel"),
    ("Development Project", "Parcel (others in Event Coverage)"),
    ("Rental Market Observation, Area Statistic, Weather Observation, Economic Indicator", "Area"),
    ("Building (Asset)", "Parcel: sits on"),
    ("Stop, Facility, Infrastructure Asset (Asset)", "Point location or Civic Address"),
    ("Vehicle (Asset)", "None"),
]
