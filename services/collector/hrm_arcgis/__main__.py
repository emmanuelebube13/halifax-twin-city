"""Load HRM ArcGIS layers into silver.

    cd services/collector
    python -m hrm_arcgis                      # every layer, each in its own run
    python -m hrm_arcgis building_permits     # one layer
    python -m hrm_arcgis --profile            # populated share of every field in the latest raw files

Each layer is its own run and its own transaction: one failing layer is reported and the others go on.
Exit code 1 if any layer failed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import traceback

from . import arcgis, settings, sources, store
from .transform import HALIFAX


def log(msg: str) -> None:
    print(f"{dt.datetime.now(HALIFAX).strftime('%H:%M:%S')} {msg}", flush=True)


def run_layer(conn, cfg: sources.LayerConfig) -> store.Result:
    features, fetch_ids = arcgis.fetch_layer(conn, cfg.source_id, cfg.name, cfg.layer_url, cfg.out_fields)
    rows, skipped = cfg.transform(features)
    log(f"{cfg.name}: {len(features)} features in {len(fetch_ids)} pages, {len(rows)} rows, {skipped} skipped")
    try:
        res = store.store(conn, cfg.source_id, cfg.subtype_table, rows, batch_id=fetch_ids[0])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="hrm_arcgis", description=__doc__.split("\n")[0])
    ap.add_argument("layers", nargs="*", help=f"layers to load (default all): {', '.join(sources.BY_NAME)}")
    ap.add_argument("--profile", action="store_true", help="print populated share of each field and stop")
    ap.add_argument("--no-prune", action="store_true", help=f"keep raw files older than {settings.RAW_RETENTION_DAYS} days")
    a = ap.parse_args(argv)
    unknown = [n for n in a.layers if n not in sources.BY_NAME]
    if unknown:
        ap.error(f"unknown layer(s): {', '.join(unknown)}")
    chosen = [sources.BY_NAME[n] for n in a.layers] or sources.LAYERS

    if a.profile:
        from . import profile
        profile.print_profiles(chosen)
        return 0

    import psycopg
    failed = []
    with psycopg.connect(settings.database_url(), application_name="halifax-twin-hrm-arcgis") as conn:
        for cfg in chosen:
            try:
                res = run_layer(conn, cfg)
                log(f"{cfg.name}: locations +{res.locations_inserted} ~{res.locations_updated}, "
                    f"events +{res.events_inserted} ~{res.events_updated}, "
                    f"{cfg.subtype_table} +{res.subtypes_inserted} ~{res.subtypes_updated}, "
                    f"outside calendar {res.out_of_calendar}")
            except Exception as e:  # one layer failing must not stop the others
                conn.rollback()
                failed.append(cfg.name)
                log(f"{cfg.name}: FAILED {type(e).__name__}: {e}")
                traceback.print_exc(limit=3, file=sys.stderr)
    if not a.no_prune:
        n = arcgis.prune_raw(sorted({c.source_id for c in chosen}))
        if n:
            log(f"removed {n} raw files older than {settings.RAW_RETENTION_DAYS} days")
    if failed:
        log(f"failed: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
