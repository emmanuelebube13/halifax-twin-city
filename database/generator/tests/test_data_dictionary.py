"""Tests for build_data_dictionary.py.

Run from the repository root (standard library only):
    python -m unittest discover -s database/generator/tests -v
"""
import csv
import io
import os
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


if __name__ == "__main__":
    unittest.main()
