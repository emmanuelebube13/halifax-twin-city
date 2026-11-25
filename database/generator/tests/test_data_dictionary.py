"""Tests for build_data_dictionary.py.

Run from the repository root (standard library only):
    python -m unittest discover -s database/generator/tests -v
"""
import csv
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(GEN))
sys.path.insert(0, GEN)

import build_data_dictionary as bdd  # noqa: E402


class DataDictionaryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = bdd.outputs()
        cls.rows = list(csv.DictReader(io.StringIO(cls.files["data-dictionary.csv"])))

    def test_committed_files_match_a_fresh_run(self):
        """The committed CSV and Markdown are exactly what the generator writes now."""
        for name, text in self.files.items():
            with open(os.path.join(bdd.OUT_DIR, name), "rb") as fh:
                self.assertEqual(fh.read(), text.encode("utf-8"),
                                 f"{name} is out of date: run database/generator/build_data_dictionary.py")

    def test_two_runs_write_identical_bytes(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for d in (a, b):
                subprocess.run([sys.executable, os.path.join(GEN, "build_data_dictionary.py"), "--out-dir", d],
                               check=True, capture_output=True)
            for name in self.files:
                with open(os.path.join(a, name), "rb") as fa, open(os.path.join(b, name), "rb") as fb:
                    self.assertEqual(fa.read(), fb.read())

    def test_check_mode_reports_up_to_date(self):
        r = subprocess.run([sys.executable, os.path.join(GEN, "build_data_dictionary.py"), "--check"],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_counts_match_physical_model_v1(self):
        silver = [r for r in self.rows if r["schema_name"] == "silver"]
        self.assertEqual(len({r["table_name"] for r in silver}), 63)
        self.assertEqual(len(silver), 520)
        scd2 = {r["table_name"] for r in silver if r["history"] == "SCD Type 2"}
        self.assertEqual(len(scd2), 22)

    def test_every_logical_attribute_is_present(self):
        """Every attribute in the spec appears once under its physical name (weekday flags expanded)."""
        E = bdd.load_spec()
        have = {(r["table_name"], r["column_name"]) for r in self.rows if r["schema_name"] == "silver"}
        for entity, spec in E.items():
            t = bdd.pname(entity)
            for col, attr in bdd.logical_attrs(E, entity).items():
                if t == "vehicle_position" and col == "event_id":
                    continue  # rolled down: no event_id column
                self.assertIn((t, col), have, f"{entity}.{attr[0]}")

    def test_names_are_the_models_names(self):
        for r in self.rows:
            if r["column_class"] == "Logical" and r["table_name"] != "vehicle_position":
                self.assertEqual(bdd.pname(r["attribute_name"]), r["column_name"])

    def test_csv_has_no_password_like_text(self):
        text = self.files["data-dictionary.csv"].lower()
        for word in ("password=", "pgpass", "token="):
            self.assertNotIn(word, text)

    def test_physical_sql_indexes_match_disk_and_tuning_rules(self):
        """Generated SQL matches disk for 03 and 05, skips AK-covered FK indexes, and includes new indexes."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_gen = os.path.join(tmp, "database", "generator")
            tmp_sql = os.path.join(tmp, "database", "sql")
            shutil.copytree(GEN, tmp_gen, ignore=shutil.ignore_patterns("__pycache__", "tests"))
            r = subprocess.run(
                [sys.executable, os.path.join(tmp_gen, "build_physical_sql.py")],
                capture_output=True, text=True, check=True,
            )
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

            disk_sql = os.path.join(REPO, "database", "sql")
            for name in ("03_foreign_keys_and_indexes.sql", "05_vehicle_position_partitions.sql"):
                with open(os.path.join(tmp_sql, name), "rb") as fg, open(os.path.join(disk_sql, name), "rb") as fd:
                    self.assertEqual(fg.read(), fd.read(), f"{name} on disk does not match build_physical_sql.py output")

            with open(os.path.join(tmp_sql, "03_foreign_keys_and_indexes.sql"), encoding="utf-8") as fh:
                s03 = fh.read()
            with open(os.path.join(tmp_sql, "05_vehicle_position_partitions.sql"), encoding="utf-8") as fh:
                s05 = fh.read()

        redundant_fk_indexes = (
            "ix_location_source_id",
            "ix_party_source_id",
            "ix_asset_source_id",
            "ix_event_source_id",
            "ix_route_segment_from_stop_asset_id",
            "ix_trip_scheduled_trip_id",
            "ix_stop_arrival_trip_event_id",
        )
        for idx in redundant_fk_indexes:
            self.assertIsNone(re.search(rf"\b{re.escape(idx)}\b", s03), f"Redundant FK index still present: {idx}")

        # schedule_version has no alternate key on source_id, so its FK index must remain.
        self.assertIsNotNone(
            re.search(r"\bix_schedule_version_source_id\b", s03),
            "Expected non-redundant FK index missing: ix_schedule_version_source_id",
        )

        expected_s03_indexes = (
            "ix_event_event_type_code_event_start_ts",
            "ix_event_event_type_code_dw_loaded_ts",
            "ix_event_source_id_dw_loaded_ts",
            "ix_asset_source_id_dw_loaded_ts",
            "ix_location_source_id_dw_loaded_ts",
            "ix_scheduled_trip_source_trip_key_route_asset_id",
        )
        for idx in expected_s03_indexes:
            self.assertIsNotNone(re.search(rf"\b{re.escape(idx)}\b", s03), f"Missing expected index in 03: {idx}")

        self.assertIsNotNone(
            re.search(r"\bix_vehicle_position_position_ts\b", s05),
            "Missing expected index in 05: ix_vehicle_position_position_ts",
        )


if __name__ == "__main__":
    unittest.main()
