# Raw files kept for a rolling 7 days; parsed history kept

- Date: 21 Nov 2026 (evening)
- Decided by: the architect
- Status: decided

## Context

The interim rule was "keep all raw data". Trip updates alone are about 150 KB per fetch gzipped, about 425 MB a day or 3 GB a week at a 30 s poll. The handoff proposed keeping raw vehicle positions and trip updates for 3 months.

## Decision

Stream for the live map. Keep the parsed history in the database. Keep raw files for a rolling 7 days, then delete them. `bronze.feed_fetch` rows are always kept.

## Why

The parsed history in Silver answers the questions; the raw files are needed only to check and reload recent loads. Seven days bounds the disk use.

## Replaces

The interim rule "keep all raw data" (15 Nov brief, handoff rule 8) and the 3-month proposal.

## Consequences for the build

- `raw_retention_days: 7` lives in `config/business-rules.yaml`; the collector has the same default in code if the file is absent, and deletes older raw files once a day.
- Verifiers (T11 and later) must pick their sample moments inside the last 7 days, or ask for files to be kept longer for a test.
- A raw file that was deleted cannot be reloaded. A loader bug found after 7 days can be fixed only from what Silver holds.
