# PostgreSQL 16 stays

- Date: 21 Nov 2026 (evening)
- Decided by: the architect
- Status: decided

## Context

The handoff note proposed PostgreSQL 18 on the build machine to match the demo PC, so the demo's collected data could be moved with `pg_dump`. Physical Model V1 was tested on PostgreSQL 16.15 and 18.

## Decision

PostgreSQL 16 stays. There is no need to match the demo PC.

On the build machine this is a portable PostgreSQL 16.15 with PostGIS 3.7 in `C:\halifax-twin-data\pgsql`, data in `C:\halifax-twin-data\pgdata`, on `localhost:5433`, server time zone UTC. It does not touch the separate PostgreSQL 16 Windows service already on port 5432 (which has no PostGIS and is not used).

## Why

Version 16 was already tested with the model, and a portable instance needs no administrator rights and leaves the existing service alone.

## Replaces

The proposal "PostgreSQL 18 + PostGIS 3" in the handoff note, section 1 and section 4 step 8.

## Consequences for the build

- Moving the demo PC's collected data (PostgreSQL 18) here would be a move to an older major version, which PostgreSQL does not support directly. It would need a data-only plain SQL dump, checked by hand, or the archive simply starts fresh here. Which one is the architect's choice.
- The portable server must be started by hand or by a logon task after a reboot (`engineering/runbooks/setup-windows.md`).
