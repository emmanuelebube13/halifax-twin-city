"""Settings, raw file paths and raw file retention. No database needed."""
import datetime as dt
import gzip
import os
import time

import pytest

from collector import common
from collector.common import Download
from collector.retention import purge_raw
from collector.settings import (DEFAULT_DB_URL, DEFAULT_RAW_RETENTION_DAYS, describe_database, load_settings,
                                raw_retention_days, read_business_rules)

DAY = 86400


def test_defaults_match_the_build_machine(tmp_path, monkeypatch):
    monkeypatch.delenv("HALIFAX_TWIN_DB_URL", raising=False)
    monkeypatch.delenv("HALIFAX_TWIN_DATA_DIR", raising=False)
    s = load_settings(tmp_path / "missing.yaml")
    assert s.database_url == DEFAULT_DB_URL == "postgresql://postgres@localhost:5433/halifax_twin"
    assert s.raw_retention_days == DEFAULT_RAW_RETENTION_DAYS == 7
    assert s.bronze_dir == s.data_dir / "bronze" and s.logs_dir == s.data_dir / "logs"


def test_environment_overrides(tmp_path, monkeypatch):
    monkeypatch.setenv("HALIFAX_TWIN_DB_URL", "postgresql://postgres@localhost:5433/other")
    monkeypatch.setenv("HALIFAX_TWIN_DATA_DIR", str(tmp_path))
    s = load_settings(tmp_path / "missing.yaml")
    assert s.database_url.endswith("/other") and s.data_dir == tmp_path


def test_retention_read_from_rules_file_saved_with_byte_order_mark(tmp_path):
    rules = tmp_path / "business-rules.yaml"
    rules.write_text("# not yet decided\nraw_retention_days: 3\non_time:\n  late_limit_seconds: 300\n",
                     encoding="utf-8-sig")
    assert read_business_rules(rules)["on_time"]["late_limit_seconds"] == 300
    assert load_settings(rules).raw_retention_days == 3


@pytest.mark.parametrize("value", [None, 0, -2, "7", True, 2.5])
def test_bad_retention_values_fall_back_to_the_default(value):
    assert raw_retention_days({"raw_retention_days": value}) == 7


def test_describe_database_never_shows_a_password():
    text = describe_database("postgresql://someone:not-a-real-secret@db.example:5433/halifax_twin")
    assert text == "db.example:5433/halifax_twin" and "secret" not in text and "someone" not in text


def test_raw_file_kept_under_halifax_date_and_logged_with_forward_slashes(data_dir):
    # 01:30 UTC on 21 Nov is 21:30 on 20 Nov in Halifax: the folder takes the Halifax date.
    d = Download("SRC-001", "http://example/x.pb", dt.datetime(2026, 11, 21, 1, 30, 5, tzinfo=dt.timezone.utc), 200, b"abc")
    path = common.save_raw(d, "vehicle_positions", "pb")
    assert path == data_dir / "bronze" / "SRC-001" / "2026-11-20" / "vehicle_positions_213005.pb.gz"
    assert gzip.decompress(path.read_bytes()) == b"abc"
    rel = common.relative_path(path)
    assert rel == "bronze/SRC-001/2026-11-20/vehicle_positions_213005.pb.gz" and "\\" not in rel
    assert common.stored_path(rel) == path


def _file(path, age_days, now):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * 10)
    os.utime(path, (now - age_days * DAY, now - age_days * DAY))
    return path


def test_retention_deletes_old_files_and_empty_folders_only(tmp_path):
    now = time.time()
    bronze = tmp_path / "bronze"
    old = _file(bronze / "SRC-001" / "2026-11-10" / "a.pb.gz", 8, now)
    edge = _file(bronze / "SRC-001" / "2026-11-14" / "b.pb.gz", 6.9, now)
    new = _file(bronze / "SRC-002" / "2026-11-21" / "c.pb.gz", 0, now)

    dry = purge_raw(bronze, 7, now=now, dry_run=True)
    assert (dry.files, dry.bytes) == (1, 10) and old.exists()

    r = purge_raw(bronze, 7, now=now)
    assert (r.files, r.folders, r.errors) == (1, 1, 0)
    assert not old.exists() and not old.parent.exists()
    assert edge.exists() and new.exists() and bronze.is_dir()


def test_retention_on_a_missing_folder_does_nothing(tmp_path):
    assert purge_raw(tmp_path / "nothing", 7).files == 0
    with pytest.raises(ValueError):
        purge_raw(tmp_path, 0)
