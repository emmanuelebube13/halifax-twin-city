# The collector runs as a local process

- Date: 16 Nov 2026
- Decided by: the architect (as a proposal, still in force)
- Status: proposal in force

## Context

T04 deployed the collector to Azure Functions on a timer. Azure is withdrawn (`2026-11-16-no-azure-no-paid-cloud.md`).

## Decision

The collector is a local Python process on the build machine, started by Windows Task Scheduler at logon, writing to the local `halifax_twin` database and the data root.

## Why

Free, and the build machine is the only machine with the main build's database.

## Replaces

Azure Functions in T04.

## Consequences for the build

- Gate 0 needs 48 hours with no gap over 2 minutes, so the machine must stay on, awake and logged in for that time. Whether it stays on day and night is open; if not, the architect chooses which machine runs the collector.
- The portable PostgreSQL is not a Windows service, so it must be started before the collector after a reboot (`engineering/runbooks/setup-windows.md`).
- The start, stop and Task Scheduler scripts are `scripts/collector-*.ps1` (workstream B). The registration script is written, not run, until the architect agrees.
