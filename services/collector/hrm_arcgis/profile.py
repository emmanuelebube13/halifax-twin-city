"""Populated share of every downloaded field, read from the latest raw files (no network).

A value counts as populated when it is not null and not blank, 'N/A' or '.'.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

from . import settings
from .transform import clean


def latest_run(source_id: str, name: str) -> list[Path]:
    """Raw page files of the most recent download of one layer."""
    root = settings.bronze_dir() / source_id
    files = sorted(root.glob(f"*/{name}_*_p*.geojson.gz"), key=lambda p: (p.parent.name, p.name))
    if not files:
        return []
    last = files[-1]
    stamp = last.parent.name, last.name.rsplit("_p", 1)[0]
    return [f for f in files if (f.parent.name, f.name.rsplit("_p", 1)[0]) == stamp]


def features_of(files: list[Path]) -> list:
    out = []
    for f in files:
        with gzip.open(f, "rb") as fh:
            out.extend(json.loads(fh.read().decode("utf-8-sig")).get("features", []))
    return out


def profile(features: list, fields: list[str]) -> dict[str, tuple[int, float]]:
    n = len(features) or 1
    res = {}
    for fld in fields:
        k = sum(1 for f in features if clean((f.get("properties") or {}).get(fld)) is not None)
        res[fld] = (k, k / n)
    geo = sum(1 for f in features if f.get("geometry"))
    res["(geometry)"] = (geo, geo / n)
    return res


def print_profiles(configs) -> None:
    for cfg in configs:
        files = latest_run(cfg.source_id, cfg.name)
        feats = features_of(files)
        print(f"\n{cfg.name} ({cfg.source_id}): {len(feats)} features from {len(files)} raw files")
        for fld, (k, share) in profile(feats, cfg.out_fields).items():
            print(f"  {fld:30s} {k:7d}  {share:6.1%}")
