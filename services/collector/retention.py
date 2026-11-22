"""Raw file retention: delete raw files older than raw_retention_days (build plan, section 2).

Only files under <data dir>/bronze/ are touched, judged by their modification time (the time they were
saved). Empty folders left behind are removed. Rows in bronze.feed_fetch are never deleted: the register
stays complete even after its files are gone, so bronze.feed_gap keeps working.

    python -m collector.retention            delete what is older than the rule allows
    python -m collector.retention --dry-run  only count it
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PurgeResult:
    files: int = 0
    bytes: int = 0
    folders: int = 0
    errors: int = 0

    def __str__(self) -> str:
        text = f"{self.files} raw files ({self.bytes / 1_048_576:.1f} MB) and {self.folders} empty folders deleted"
        return text + (f", {self.errors} could not be deleted" if self.errors else "")


def purge_raw(bronze_dir: Path, days: int, now: float | None = None, dry_run: bool = False) -> PurgeResult:
    """Delete files under bronze_dir last modified more than `days` days before `now` (epoch seconds)."""
    result = PurgeResult()
    if days < 1:
        raise ValueError("raw_retention_days must be at least 1")
    bronze_dir = Path(bronze_dir)
    if not bronze_dir.is_dir():
        return result
    cutoff = (now if now is not None else time.time()) - days * 86400
    for path in bronze_dir.rglob("*"):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                size = path.stat().st_size
                if not dry_run:
                    path.unlink()
                result.files += 1
                result.bytes += size
        except OSError:
            result.errors += 1
    if not dry_run:
        # Deepest folders first, so a source folder emptied by its date folders goes too. Never bronze_dir itself.
        for folder in sorted((p for p in bronze_dir.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            try:
                if not any(folder.iterdir()):
                    folder.rmdir()
                    result.folders += 1
            except OSError:
                result.errors += 1
    return result


def main(argv=None):
    from .common import halifax_time, settings
    ap = argparse.ArgumentParser(description="Delete raw files older than raw_retention_days")
    ap.add_argument("--dry-run", action="store_true", help="count, do not delete")
    args = ap.parse_args(argv)
    s = settings()
    r = purge_raw(s.bronze_dir, s.raw_retention_days, dry_run=args.dry_run)
    print(f"{halifax_time()}  retention {s.raw_retention_days} days in {s.bronze_dir}: "
          + (f"{r.files} files ({r.bytes / 1_048_576:.1f} MB) would be deleted" if args.dry_run else str(r)))


if __name__ == "__main__":
    main()
