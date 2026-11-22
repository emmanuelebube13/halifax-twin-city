# Bronze is raw files on local disk plus the fetch register

- Date: 16 Nov 2026 (the register table came with the physical model on 20 Nov 2026)
- Decided by: the architect
- Status: decided; the Drive backup is still open

## Context

The 15 Nov documents put raw feed files in Azure Blob Storage, with hourly manifest files.

## Decision

Raw files are kept on local disk exactly as the source sent them (gzipped), one folder per source and date. Each download is one row in `bronze.feed_fetch`; the view `bronze.feed_gap` reports gaps, which is the Gate 0 evidence.

On the build machine the raw files live outside OneDrive, under the data root `C:\halifax-twin-data\bronze\` (environment variable `HALIFAX_TWIN_DATA_DIR`), not in a `data/` folder inside the repository. `file_path` in `bronze.feed_fetch` holds a forward-slash path relative to the data root.

## Why

Free and simple, and the register table makes gaps queryable with SQL instead of parsing manifest files.

## Replaces

Blob Storage and the hourly manifest files in T03 and T04.

## Consequences for the build

- How long raw files are kept is a separate decision (`2026-11-21-raw-data-retention.md`): 7 days.
- A backup copy of raw files to Google Drive is a proposal, not decided. Do not build it without a yes.
