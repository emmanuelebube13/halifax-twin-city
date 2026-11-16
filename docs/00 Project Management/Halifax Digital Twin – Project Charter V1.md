# **Halifax Digital Twin – Project Charter V1**

Nov 8, 2026 

## **Table of Contents**

[Document control](#h.zcbtt7c40ojw)

[Purpose](#h.dcb7zeg7ccrj)

[Problem statement](#h.6q6w3hl4ydwr)

[Objectives and Phase 1 success criteria](#h.togjc3wnnqu)

[Scope](#h.izecks14s378)

[Guiding principles](#h.51dge84qx3mb)

[Users and their needs](#h.z1bgqaworh8u)

[Target application](#h.5jxtntkvmpm)

[Future capabilities](#h.ykm8ths56tc2)

[Prior art](#h.ch28vtn9bs8f)

[Risks, assumptions and constraints](#h.p4pjov83tlps)

[Phases and roadmap](#h.7xa63lpsfnua)

[Governance, versioning and project artifacts](#h.kpnofwouib7g)

[References](#h.p2naye1r6yof)

The Halifax Digital Twin builds a living data model of Halifax, starting with three sectors and designed to grow to every sector of the city.

## **Document control**

| Item | Detail |
| :---- | :---- |
| Document | Halifax Digital Twin – Project Charter |
| Version | V1 (first release) |
| Status | Draft, Phase 1: Design |
| Owner | Emmanuel Mbachu, Data Modeler |
| Geographic scope | Halifax Regional Municipality, Nova Scotia |
| Phase 1 sectors | Transportation, Public Works, Housing & Real Estate |
| Companion artifacts | Sector & Subsector register (17 sectors, 100+ subsectors), Sector Scoring Matrix, Domain Map, Business Questions register (100 questions) |
| Next artifacts | Conceptual model, Data flow model |

## **Purpose**

The Halifax Digital Twin is a digital model of what is happening in Halifax, in real time and over time. It connects data from many city sectors into one shared structure, so a question can cross sectors as easily as it stays inside one.

The twin exists to help people:

* **See** what is happening across the city right now.  
* **Find** areas that are lacking or need support, such as neighbourhoods with weak transit or slow snow clearing.  
* **Predict** where pressure will build next, from history and live trends.  
* **Check** whether public spending matches real need, when budgets are set for a sector or area.  
* **Plan** decisions, from a city department choosing where to repair first to a business choosing where to open.

A city is a living system. Sectors appear, grow and change, and the twin is designed to grow with it rather than be rebuilt each time.

## **Problem statement**

Halifax publishes useful data, but it lives in separate portals, formats and update cycles with no shared model connecting it. Transit data comes as live GTFS feeds ([Halifax Transit](https://www.halifax.ca/transportation/halifax-transit/transit-technology/general-transit-feed-gtfs)), while property, permit and boundary data sit in the municipal open data catalogue ([HRM Open Data](https://data-hrm.hub.arcgis.com/pages/open-data-downloads)).

Because nothing ties these together, cross-sector questions are slow or impossible to answer. For example: *Is new housing being built where transit and utilities are weakest?* (Q100) or *Do slower snow clearing times line up with bus delays and collisions?* (Q58).

This is a national pattern. A 2024 industry review found Canadian digital twin adoption held back by fragmented open data portals, no national standard for interoperability, and a shortage of skills ([Geo Week News](https://www.geoweeknews.com/articles/what-s-hindering-the-adoption-of-digital-twin-technology-in-canada-s-urban-development/)). A search during this charter found no public, city-wide digital twin for Halifax.

## **Objectives and Phase 1 success criteria**

Phase 1 is design only: it is complete when every artifact below is published and linked from this charter.

| \# | Objective | Success criterion | Status |
| :---- | :---- | :---- | :---- |
| 1 | Define what the twin must answer | 100 business questions documented with cadence, data availability and priority | Done |
| 2 | Map the whole city | 17 sectors and 100+ subsectors registered; domain map published | Done |
| 3 | Choose Phase 1 sectors by rule | Scoring matrix with a written rubric; top-ranked sectors selected | Done |
| 4 | Set direction and rules | Charter V1 published | In progress |
| 5 | Describe the city's structure | Conceptual model covering the conformed core and 3 sectors | Next |
| 6 | Describe how data moves | Data flow model from sources to applications | Next |
| 7 | Detail the 3 sectors | Logical model, physical model, source-to-target mapping and data dictionary | Planned |
| 8 | Prove the design with live data | Prototype ingesting the Halifax Transit real-time feed | Planned (Phase 2\) |

## **Scope**

Phase 1 covers Halifax and three sectors, chosen by a documented scoring rule rather than preference.

### **In scope**

* **Geography:** Halifax Regional Municipality.  
* **Sectors:** Transportation, Public Works, Housing & Real Estate, plus the conformed core entities they share.  
* **Data:** open and publicly licensed data, real-time and historical.  
* **Deliverables:** the design artifacts listed under Objectives.

### **Out of scope for Phase 1**

* Personal or private data about individuals.  
* Private business instances of the twin.  
* 3D city models and building information models (BIM).  
* The AI assistant and predictive simulations.  
* Other cities and provinces.

Each of these is a future capability, not a rejection.

### **How the Phase 1 sectors were chosen**

Each of the 17 sectors was scored 1 to 5 on three criteria, then ranked:

* **Data availability (weighted ×2):** 5 \= open and live or regularly updated; 3 \= open but static; 1 \= private or needs a partnership.  
* **Value:** how many people and decisions the sector's questions serve.  
* **Links:** how much the sector connects to other sectors through shared places, parties and assets.

| Rank | Sector | Phase |
| :---- | :---- | :---- |
| 1 | Transportation | Phase 1 |
| 1 | Public Works | Phase 1 |
| 2 | Housing & Real Estate | Phase 1 |
| 3 | Public Safety & Emergency | Phase 2 candidate |
| 4 | Environment | Phase 2 candidate |
| 4 | Population & Community | Phase 2 candidate |
| 5 | Construction | Phase 2 candidate |
| 5 | Education | Phase 2 candidate |
| 5 | Public Governance & Civic Services | Phase 2 candidate |
| 6 to 8 | Digital, Energy & Utilities, Finance, Healthcare, Retail, Port & Maritime, Arts Culture & Recreation, Hospitality | Later phases |

The three Phase 1 sectors together define most of Halifax's **Location** spine: streets and roads (Transportation, Public Works) and parcels and addresses (Housing). Building them first gives every later sector a solid place to connect.

## **Guiding principles**

Nine rules shape every design decision; when two options compete, the one that better keeps these wins.

1. **Data integrity and provenance.** Every record keeps its source, load time and a reliability tier, so users know where a number came from and how far to trust it.  
2. **Finest grain first.** Data is stored at its most detailed level, such as each bus position or each permit, and summarised upward, never the reverse.  
3. **Real-time and history together.** Nothing is overwritten. Changes are kept as history, so any two points in time can be compared, for example a five-year gap analysis.  
4. **Additive change.** New sectors, sources and cities are added beside what exists, never by rewriting it. Sectors are stored as data, not hard-coded structure, so the city can grow like a living system.  
5. **Small blast radius.** Each source and partner connects through its own pipeline. If one changes, fails or is withdrawn, only that source stops; the rest of the twin keeps working.  
6. **Privacy and licence compliance.** No personal data in Phase 1\. Every data licence and attribution is respected, starting with the [Halifax Open Data Licence](https://www.halifax.ca/sites/default/files/documents/home/open-data/ODMT_Transit_Real-time_Scheduling_Data.pdf).  
7. **Open by default, private by choice.** The public twin is open. Organisations may later run private instances that add their own data without exposing it.  
8. **One application, many layers.** One twin, viewed through maps, dashboards, network graphs and KPIs, never separate products for each view.  
9. **API-first.** Everything the twin knows is reachable through documented APIs, so others can build on it.

## **Users and their needs**

Phase 1 is designed first for government and city departments, with businesses, residents and developers served by the same data at the level of detail they need.

| User | What they need | Example questions |
| :---- | :---- | :---- |
| Government officials and council | Evidence that budgets match need; gaps by area and sector | Q8, Q76, Q100 |
| City departments | Operational status, service performance, where to act first | Q2, Q51, Q55 |
| Businesses | Site selection and opportunity analysis, such as a car wash owner choosing a new location | Q74, Q94, Q99 |
| Residents | High-level KPIs and everyday answers about their neighbourhood | Q1, Q7, Q47 |
| Researchers and developers | Clean, documented data and APIs to build their own tools | All open-data questions |

The twin will also track which sectors and views each group uses most, to guide what is built next.

## **Target application**

The twin is one application with layers a user can drill into, not a family of separate apps.

* **Live map:** the city's places, assets and events, updated as data arrives; each feature is clickable for detail and history.  
* **Dashboards and KPIs:** sector and city-wide performance over time, such as on-time transit or days to fix a pothole.  
* **Network graphs and flow views:** relationships that have no single location, such as supply chains or how organisations connect.  
* **APIs:** the same data, documented, for developers and partners.

### **Presence without a single location**

Some actors shape the city without sitting at one address: ride-hailing services, cloud providers, online retailers. The model handles them by letting **Location** be a point, a line, an area, a service area or "citywide". They then appear on the map as coverage, and in graphs and dashboards by what they connect to.

### **Real-time and stored data**

The twin uses a hybrid approach to control storage cost without losing history. Live feeds keep raw records, such as every bus position, for a rolling window; older raw records are condensed into event history, such as each bus's arrival at each stop, which keeps what analysis needs. Slower and batch sources are stored in full. The window length is set in the physical model.

## **Future capabilities**

These are planned directions, added as the design matures, data becomes available and users suggest them; each will get its own scope before it is built.

* **More sectors.** Phase 2 candidates first, then the remaining sectors, each added as a module without changing the core.  
* **More places.** Other municipalities in Nova Scotia, then other provinces, reusing the same model.  
* **AI assistant.** Ask the twin a question in plain language and get an answer drawn from its data, such as "where should I open a new car wash?"  
* **Predictive analytics and "what if" simulation.** Forecasting demand and testing scenarios, such as a rezoning, a road closure or a 100-year storm.  
* **Private instances.** Organisations add their own data to a private copy and see it in relation to the public city, without sharing it.  
* **Partner and sensor data.** IoT sensors, utility telemetry and agency data added through data-sharing agreements.  
* **Field data collection.** Street-level imagery and surveys where no digital source exists.  
* **Unstructured sources.** Text, documents and web content turned into structured records, each with a confidence score and its source kept.

The "what if" and sensor-based questions in the Business Questions register are kept there as the backlog for these capabilities.

## **Prior art**

City digital twins exist in Canada, but none found is a public, city-wide twin for Halifax; these are the references this project learns from.

| Project | What it is | Relevance to this project | Source |
| :---- | :---- | :---- | :---- |
| Canada's Digital Twin (Carleton Immersive Media Studio) | Web-based, non-proprietary national-scale twin combining open data, BIM, census, housing and wildfire data; started 2019 | Closest model for an open, multi-source twin | [Carleton University](https://architecture.carleton.ca/2024/cims-canadas-digital-twin-project-recognized-for-innovation-research/) |
| Toronto digital twin | Model of Toronto and York using IoT data from water, waste and transportation to track sustainability and simulate scenarios | Example of cross-sector infrastructure twin | [IEEE Future Directions](https://futuredirections.ieee.org/?p=26887) |
| Vancouver, Montreal and Calgary | Twins for urban planning, mobility, food access and infrastructure mapping | Shows the range of city use cases | [Geo Week News](https://www.geoweeknews.com/articles/what-s-hindering-the-adoption-of-digital-twin-technology-in-canada-s-urban-development/) |

Open item: review international examples such as Virtual Singapore and Helsinki's city model before Charter V2.

## **Risks, assumptions and constraints**

The main risk is depending on data the project does not control; the design answers it with source independence and kept history.

| Risk | Impact | Response |
| :---- | :---- | :---- |
| A source changes format or goes offline | Pipelines break; gaps in live data | Each source has its own pipeline and mapping; only that source pauses (principle 5\) |
| A licence changes or a partner withdraws | Data can no longer be used | Data stored with provenance so it can be removed cleanly; no other source depends on it |
| Streaming data grows storage cost | Project becomes expensive to run | Hybrid storage: raw window plus condensed history |
| Key questions need private or partner data | 31 of 100 questions need partner or private data, and more need mixed sources | Marked Partner or Private in the register; pursued through data-sharing agreements |
| Personal data enters by accident | Privacy breach | No personal data in Phase 1; checks at ingestion |
| One-person project | Slower delivery; single point of knowledge | Everything documented and versioned in public; collaborators invited at Phase 3 |

**Assumptions:** Halifax open data and the Halifax Transit feeds stay publicly available under current licences. Phase 1 uses free or low-cost tools.

**Constraints:** Phase 1 delivers design artifacts only; the build begins in Phase 2\.

## **Phases and roadmap**

The project moves through four phases, and each starts only when the gate before it is met.

![Roadmap · 4 phases, 3 gates][image1]

Roadmap · 4 phases, 3 gates

Phase 1 ends when the design artifacts are complete; Phase 2 ends when live transit data flows into the conformed core; Phase 3 ends with a public launch. Dates are set per phase once the previous gate is met.

## **Governance, versioning and project artifacts**

The charter is a living document: each meaningful change raises its version and is logged below, and every artifact is versioned the same way.

* **Versions:** V1, V2 and so on for major changes such as a new sector or phase; V1.1 for corrections.  
* **Ownership:** the project owner approves changes until a collaborator group is formed.  
* **Publication:** all artifacts will be published on the project site, with the history kept, so anyone can follow the project as it grows.

| Artifact | Version | Status |
| :---- | :---- | :---- |
| Project Charter | V1 | This document |
| Sector & Subsector register | V1 | Complete |
| Sector Scoring Matrix (bus matrix) | V1 | Complete |
| Domain Map | V1 | Complete |
| Business Questions register | V1 | Complete, 100 questions |
| Conceptual model | – | Next |
| Data flow model | – | Next |
| Logical model, physical model, STTM, data dictionary | – | Planned |

### **Change log**

| Date | Version | Change |
| :---- | :---- | :---- |
| 8 Nov 2026 | V1 | First release of the charter |

## **References**

Sources consulted for this charter, accessed 7 to 8 November 2026\.

1. Halifax Regional Municipality. [About GTFS – Halifax Transit](https://www.halifax.ca/transportation/halifax-transit/transit-technology/general-transit-feed-gtfs).  
2. Halifax Regional Municipality. [Transit Real-time Scheduling Data – open data metadata](https://www.halifax.ca/sites/default/files/documents/home/open-data/ODMT_Transit_Real-time_Scheduling_Data.pdf) (licence: Open Data Licence).  
3. Halifax Regional Municipality. [Halifax Transit releases beta version of real-time bus location data](https://www.halifax.ca/home/news/halifax-transit-releases-beta-version-real-time-bus-location-data).  
4. MobilityData. [Halifax Transit GTFS Realtime – Vehicle Positions feed](https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1607); [Service Alerts feed](https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1606); [GTFS Schedule feed](https://mobilitydatabase.org/feeds/gtfs/mdb-734).  
5. Halifax Regional Municipality. [Open Data Downloads](https://data-hrm.hub.arcgis.com/pages/open-data-downloads) and [Open Data Catalogue](https://data-hrm.hub.arcgis.com/datasets/open-data-catalogue-1).  
6. Carleton University, Azrieli School of Architecture & Urbanism. [CIMS' Canada's Digital Twin project recognized for innovation research](https://architecture.carleton.ca/2024/cims-canadas-digital-twin-project-recognized-for-innovation-research/).  
7. Geo Week News. [What's hindering the adoption of digital twin technology in Canada's urban development?](https://www.geoweeknews.com/articles/what-s-hindering-the-adoption-of-digital-twin-technology-in-canada-s-urban-development/) (2024).  
8. IEEE Future Directions. [Toronto has got its Digital Twin](https://futuredirections.ieee.org/?p=26887).

[image1]: <data:image/png;base64,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>