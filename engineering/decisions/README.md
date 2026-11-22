# Decisions

One short note per decision, named `<date>-<topic>.md`. Each note says what was decided, when, by whom, why, what it replaces and what it changes for the build. The architect makes every decision; agents record them and propose new ones in a pull request.

Where an older document (the 15 Nov brief, the task cards, the plan V1) disagrees with a note here, the note wins. Where two notes disagree, the newer one wins.

| Date | Decision | Status | Note |
| :---- | :---- | :---- | :---- |
| 15 and 20 Nov 2026 | Realistic 3D through CesiumJS and the architect's Cesium ion token | Decided | [2026-11-20-realistic-3d-cesium-ion.md](2026-11-20-realistic-3d-cesium-ion.md) |
| 16 Nov 2026 | No Azure and no paid cloud | Decided | [2026-11-16-no-azure-no-paid-cloud.md](2026-11-16-no-azure-no-paid-cloud.md) |
| 16 Nov 2026 | Bronze is raw files on local disk plus the fetch register | Decided (Drive backup open) | [2026-11-16-bronze-local-raw-files.md](2026-11-16-bronze-local-raw-files.md) |
| 16 Nov 2026 | The collector runs as a local process | Proposal in force | [2026-11-16-collector-hosting-local.md](2026-11-16-collector-hosting-local.md) |
| 16 Nov 2026 | The web app runs locally first | Decided (free host later, not chosen) | [2026-11-16-web-hosting-local-first.md](2026-11-16-web-hosting-local-first.md) |
| 20 Nov 2026 | Data platform: PostgreSQL + PostGIS, local; DuckDB not needed | Decided | [2026-11-20-postgresql-postgis-platform.md](2026-11-20-postgresql-postgis-platform.md) |
| 20 Nov 2026 | Silver keeps history as SCD Type 2 | Decided | [2026-11-20-silver-scd2-history.md](2026-11-20-silver-scd2-history.md) |
| 20 Nov 2026 | Secrets come from environment variables or git-ignored local config | Decided | [2026-11-20-secrets-from-environment.md](2026-11-20-secrets-from-environment.md) |
| 21 Nov 2026 | erwin is retired; the model lives in the spec | Decided | [2026-11-21-retire-erwin.md](2026-11-21-retire-erwin.md) |
| 21 Nov 2026 | PostgreSQL 16 stays (portable instance on port 5433) | Decided | [2026-11-21-postgresql-16-stays.md](2026-11-21-postgresql-16-stays.md) |
| 21 Nov 2026 | Raw files kept for a rolling 7 days; parsed history kept | Decided | [2026-11-21-raw-data-retention.md](2026-11-21-raw-data-retention.md) |
| 21 Nov 2026 | Session 0 and the first build cards run together | Decided | [2026-11-21-pace-session-0-with-first-cards.md](2026-11-21-pace-session-0-with-first-cards.md) |
| 21 Nov 2026 | Opus builder agents, one workstream each, with a lead session | Decided | [2026-11-21-builder-agents.md](2026-11-21-builder-agents.md) |
| 21 Nov 2026 | Engineering documents live in `engineering/`, not `docs/` | Adopted in the build plan; confirm at review | [2026-11-21-engineering-folder.md](2026-11-21-engineering-folder.md) |

## Template

```markdown
# <Decision in a few words>

- Date: <21 Nov 2026>
- Decided by: <the architect>
- Status: <proposed, decided, superseded by ...>

## Context
## Decision
## Why
## Replaces
## Consequences for the build
```
