# Halifax Twin City

A living data model of Halifax, Nova Scotia: one shared structure that connects city sectors, so a question can cross sectors as easily as it stays inside one.

> **Status:** Phase 1 · Design, nearly complete. The logical model is defined and the PostgreSQL physical model is built and tested; the build starts in Phase 2, with the Halifax Transit real-time feed as the first live source.

![Halifax Digital Twin conceptual model](drive/03%20Conceptual%20Model/Halifax_Digital_Twin_Conceptual_Model_V1%20(1).drawio.png)

## Why

Halifax publishes useful data, but it sits in separate portals, formats and update cycles with nothing connecting it. Cross-sector questions are slow or impossible to answer, for example:

- *Is new housing being built where transit and utilities are weakest?*
- *Do slower snow-clearing times line up with bus delays and collisions?*

The twin answers these by joining every sector to a shared core of **Location**, **Time**, **Party**, **Asset** and **Event**.

## Phase 1 scope

| | |
|---|---|
| Geography | Halifax Regional Municipality |
| Sectors | Transportation, Public Works, Housing & Real Estate, plus the shared core |
| Data | Open, publicly licensed data, real-time and historical; no personal data |
| How sectors were chosen | 17 sectors scored on data availability (×2), value and links to other sectors |

## Artifacts

| Artifact | Read it here | Source file |
|---|---|---|
| Project charter V1 | [Markdown](docs/00%20Project%20Management/Halifax%20Digital%20Twin%20%E2%80%93%20Project%20Charter%20V1.md) | [.docx](drive/00%20Project%20Management/Halifax%20Digital%20Twin%20%E2%80%93%20Project%20Charter%20V1.docx) |
| Domain map: 17 sectors | [Image](drive/01%20Requirements%20and%20Domains/Halifax_Digital_Twin_Domain_Map.png) · [Sector domains](drive/01%20Requirements%20and%20Domains/Halifax_Digital_Twin_City_Domains.png) | [Domain Mapping .xlsx](drive/01%20Requirements%20and%20Domains/Domain%20Mapping.xlsx) |
| Sector scoring and mapping | [CSV](docs/01%20Requirements%20and%20Domains/Domain%20Mapping.csv) | [.xlsx](drive/01%20Requirements%20and%20Domains/Domain%20Mapping.xlsx) |
| Business questions register | [CSV](docs/01%20Requirements%20and%20Domains/Buisness_Questions%20.csv) | [.xlsx](drive/01%20Requirements%20and%20Domains/Buisness_Questions%20.xlsx) |
| Source inventory: 77 sources | [CSV](docs/02%20Sources/Source%20Inventory%20V1.csv) | [.xlsx](drive/02%20Sources/Source%20Inventory%20V1.xlsx) |
| Conceptual model: 47 entities | [Image](drive/03%20Conceptual%20Model/Halifax_Digital_Twin_Conceptual_Model_V1%20(1).drawio.png) | [.drawio](drive/03%20Conceptual%20Model/Halifax_Digital_Twin_Conceptual_Model_V1%20(1).drawio) |
| Data flow diagram v3 | open in [draw.io](https://app.diagrams.net/) | [.drawio](drive/04%20Data%20Flow%20Model/Halifax_Twin_DFD_v3.drawio) |
| Logical model V1: 63 entities | [Markdown](docs/05%20Logical%20Model/Halifax%20Digital%20Twin%20%E2%80%93%20Logical%20Model%20V1.md) | [.docx](drive/05%20Logical%20Model/Halifax%20Digital%20Twin%20%E2%80%93%20Logical%20Model%20V1.docx) · [erwin import script](drive/05%20Logical%20Model/Halifax_Twin_Logical_V1_RE.sql) |
| Physical model V1: PostgreSQL + PostGIS | [database/](database) · [design notes](database/docs/physical-model-v1.md) · [learning notes](database/docs/learning-notes-physical-model.md) | SQL scripts in `database/sql` |
| Map application plan V1 | [Markdown](docs/08%20Map%20Application/Halifax%20Digital%20Twin%20%E2%80%93%20Map%20Application%20Plan%20V1.md) | [.docx](drive/08%20Map%20Application/Halifax%20Digital%20Twin%20%E2%80%93%20Map%20Application%20Plan%20V1.docx) |

CSV views show the first tab of each sheet; the `.xlsx` files have every tab.

## Guiding principles

1. **Provenance on every record:** source, load time and a reliability tier.
2. **Finest grain first:** store each bus position or permit, summarise upward.
3. **Real-time and history together:** nothing is overwritten.
4. **Additive change:** new sectors and sources are added beside what exists.
5. **Small blast radius:** each source has its own pipeline.
6. **Privacy and licence compliance:** no personal data in Phase 1.
7. **Open by default, private by choice.**
8. **One application, many layers:** map, dashboards, graphs and KPIs.
9. **API-first.**

## Roadmap

| Phase | Goal | Gate |
|---|---|---|
| 1 · Design | Charter, domain map, questions, conceptual, data-flow, logical and physical models; mapping, dictionary and standards | All design artifacts published |
| 2 · Prototype | Ingest the Halifax Transit GTFS real-time feed into the shared core | Live transit data flowing |
| 3 · Launch | Build toward a public release | Public launch |
| 4 · Grow | Future capabilities from the charter: more sectors and municipalities, an AI assistant, what-if simulation | |

## How this repo is kept up to date

The design work happens in Google Drive. `scripts/sync-drive.ps1` mirrors the Drive folder into this repo with [rclone](https://rclone.org/) and pushes any changes:

- `drive/`: exact copies (Docs as .docx, Sheets as .xlsx, diagrams and images as-is)
- `docs/`: the same Docs as Markdown and Sheets as CSV, so they read on GitHub

```powershell
.\scripts\sync-drive.ps1
```

Code lives alongside these folders and is committed directly, not synced:

- `database/`: the PostgreSQL + PostGIS physical model, with setup steps in its [README](database/README.md)

## Data sources and licences

Phase 1 uses open data from the [Halifax Open Data catalogue](https://data-hrm.hub.arcgis.com/pages/open-data-downloads) and the [Halifax Transit GTFS feeds](https://www.halifax.ca/transportation/halifax-transit/transit-technology/general-transit-feed-gtfs), under the Halifax Open Data Licence. Every source, its licence and its attribution are listed in the [source inventory](docs/Source%20Inventory%20V1.csv).

## Author

Emmanuel Mbachu · [Portfolio](https://emmanuelebube13.github.io/Portfolio/)
