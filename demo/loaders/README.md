# Loaders

One module per source, filled in by tasks D02 to D07. Each loader:

- downloads one open source and keeps the raw file under `demo/data/bronze/<source>/<date>/`;
- writes one row per download into `bronze.feed_fetch`;
- adds its source to `silver.source` (licence and URL) before loading data;
- loads into the silver tables, using the model's names exactly;
- has a README with a mapping table: source field, silver table, silver column.

| Task | Folder | Sources |
| --- | --- | --- |
| D02 | transit_realtime/ | SRC-001, SRC-002, SRC-003 |
| D03 | gtfs_schedule/ | SRC-004, SRC-005 |
| D04 | core/ | SRC-027 to SRC-034 |
| D05 | transportation/ | SRC-012, SRC-015, SRC-016 |
| D06 | public_works/ | SRC-036 to SRC-056 (listed in the brief) |
| D07 | housing/ | SRC-059 to SRC-071 (listed in the brief) |
