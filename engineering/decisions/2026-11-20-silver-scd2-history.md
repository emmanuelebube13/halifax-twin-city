# Silver keeps history as SCD Type 2

- Date: 20 Nov 2026
- Decided by: the architect
- Status: decided

## Context

The 15 Nov documents left Silver history open.

## Decision

Silver keeps history as slowly changing dimensions, Type 2, on 22 tables (reference data and the Location, Party and Asset families). Each of these tables keeps its current rows with `valid_from_ts`; the trigger `silver.fn_scd2_capture` copies the old version into `<table>_hist`, and the `<table>_timeline` views show the history. Events are not historized in V1.

## Why

"Nothing is overwritten" is a guiding principle, and SCD2 is the standard enterprise pattern for it.

## Replaces

The open question in the plan.

## Consequences for the build

- Write each final row in one statement. A second UPDATE on the same row creates a false history version (learned in the demo).
- Never change the `silver` schema without the architect's approval; propose it.
