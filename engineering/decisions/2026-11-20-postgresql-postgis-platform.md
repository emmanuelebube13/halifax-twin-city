# Data platform: PostgreSQL + PostGIS, local

- Date: 20 Nov 2026
- Decided by: the architect
- Status: decided

## Context

The 15 Nov documents queried Bronze with DuckDB (T13) until a platform test (T15) chose a warehouse, with Databricks Free Edition as the candidate.

## Decision

The warehouse is PostgreSQL with PostGIS, running locally. Physical Model V1 (`database/`) is built and tested. DuckDB is not needed. Databricks Free Edition stays only as an optional learning sprint.

## Why

One free database holds the Bronze register, Silver (3NF with history) and Gold, with real spatial types and indexes. It was built and smoke-tested on 20 Nov.

## Replaces

T13 (DuckDB over Bronze) and T15 (platform test) as build steps. Gate 2's "DuckDB check" is read as "SQL check in PostgreSQL".

## Consequences for the build

- Loaders write Silver directly; there is no Parquet layer.
- Verifiers recompute answers with their own SQL against Silver, and from raw files inside the retention window.
