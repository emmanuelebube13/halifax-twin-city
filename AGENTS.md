# AGENTS.md

Rules for every agent working on the Halifax Digital Twin. The architect, Emmanuel Mbachu, owns the models, the business rules, the contract approvals and every gate.

Updated 21 Nov 2026 from the Drive copy (`drive/08 Map Application/Repository files/AGENTS.md`, 15 Nov) with the rules of the main build handoff note, section 5, and the decisions in `engineering/decisions/`. Azure, DuckDB, GitHub secrets and cloud app settings are withdrawn; engineering files moved from `docs/` to `engineering/`.

## Read first

`CLAUDE.md`, `PROJECT_CONTEXT.md`, the handoff note in `docs/08 Map Application/`, `engineering/build-plan.md`, this file, and for API or map work `engineering/contract/openapi.yaml`. Look at `drive/08 Map Application/Wireframes/` before any interface work. Source facts are in `docs/02 Sources/Source Inventory V1.csv` and each loader's README.

## Rules

1. One task card, one branch, one pull request, named after the card (for example `t03-transit-collector`). The architect reviews and merges. Never merge your own pull request unless the architect asks in that session.
2. Use the logical model's names exactly (`database/generator/logical_model_spec.py`). Never invent an entity or column name; ask. Never change the `silver` schema; propose the change. New tables go in `gold` and are explained in the pull request.
3. Do not change the contract, a business rule or a model name without the architect's approval. Propose and wait.
4. Confirm every external address, field, limit, price and licence yourself at build time. The design documents' facts date from 12 to 20 Nov 2026.
5. Open data only, no personal data. Show the licence attribution wherever data appears ("Contains information licensed under the Open Government Licence – Halifax", plus each source's own). Show Google and Cesium attribution on the 3D view.
6. Never commit a key, token or password, and never write one into a document, an issue, a pull request or a chat. Secrets come from environment variables (`CESIUM_ION_TOKEN`) or a git-ignored local config. The database password is only in `%APPDATA%\postgresql\pgpass.conf`; never open, print or copy it. Commit only example files such as `.env.example`.
7. No emoji anywhere: interface, pins, alerts, documents, commit messages, code comments. Sentence case. Canadian spelling. Halifax time and the 24-hour clock. Dates as 21 Nov 2026. Interface labels of at most three words.
8. Interim business rules live in `config/business-rules.yaml`, labelled "not yet decided": on time is 60 s early to 300 s late; frequent service is every 15 min or better, weekdays 07:00 to 19:00; a 5-minute walk is 400 m in a straight line; raw files are kept for 7 days (`raw_retention_days`); store both the HRM stop number and the GTFS `stop_id` and show the HRM number.
9. Every number shown to a user goes through the shared formatter. Every piece of interface text lives in the language file.
10. Every pull request carries tests and a section headed "How I verified" with the commands run and their output.
11. Finish every card with `engineering/learning/<card>.md`, written for the architect: what was built and why, how to run it, one exercise to do by hand, and one line naming the enterprise tool or certification topic it maps to (for example PostGIS spatial indexes, SCD2, Kimball stars, REST contracts, CI).
12. Each source gets its own pipeline, so one failing source greys out only its own layer.
13. Never write into `drive/` or `docs/`. `scripts/sync-drive.ps1` mirrors Google Drive there and deletes anything else. Engineering files go in `engineering/`.
14. Tests never run against `halifax_twin`. Each suite creates and drops its own scratch database.
15. Spend nothing. Local or genuinely free tools only. If a step would cost money, start a trial, need payment details or leave a free tier, stop and ask.
16. The verifier for each gate is a separate session that has not seen the build. It reports; it does not fix.

## When to stop

Stop and ask the architect when a step would cost money; when you need a key or account you were not given; when a source is not open or its licence is unclear; when a business rule or model name is missing; or when the acceptance check cannot be met as written. Report instead of guessing.

## Roles

| Role | Does | Never does |
| :---- | :---- | :---- |
| Lead | Plans the work, splits it into workstreams or cards, integrates branches, opens the pull requests, reports at gates | Merges without the architect's approval |
| Source scout | Confirms each source: address, format, refresh rate, fields, licence, sample | Writes pipeline code |
| Collector engineer | Builds one collector per source into Bronze and Silver, with its fetch register and gap monitoring | Couples one source's failure to another |
| API engineer | Owns the contract file, the serving API and its queries | Changes the contract without approval |
| Map engineer | Builds the shell, layers, stories, pins and panels | Reads data from anywhere but the serving API |
| Data engineer | Writes SQL in PostgreSQL from Silver to Gold, to the architect's model, with data quality checks | Invents entity or column names |
| Verifier | Recomputes each answer independently, from raw files and its own SQL; runs the definition of done | Fixes what it finds |

## Definition of done for a story

- The answer sentence matches an independent check of the same data.
- It works on a phone and on a laptop.
- Source, as-of time and reliability tier are visible.
- Empty, loading, stale and source-down states are designed.
- The story is recorded in `config/stories/` with its question id, layers and data lineage.
- Automated tests pass for the API and the story.
- The architect has accepted it at a demo.

## Session report

End every task with a learning note and every session with a short report: what is done (branches, commits, pull requests), the evidence (test output, row counts, screenshots), what is blocked and why, and numbered questions for the architect, each answerable in one line.
