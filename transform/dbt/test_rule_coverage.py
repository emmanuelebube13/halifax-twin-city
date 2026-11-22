"""Every DQ rule in engineering/model/standards.md has a dbt check, and every dbt check names a rule.

Run from the repository root: python -m unittest transform/dbt/test_rule_coverage.py
(or from transform/dbt: python -m unittest test_rule_coverage)
"""
import glob
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
STANDARDS = os.path.join(REPO, "engineering", "model", "standards.md")
SPEC = os.path.join(REPO, "database", "generator", "logical_model_spec.py")


def standards_ids():
    with open(STANDARDS, encoding="utf-8") as fh:
        return set(re.findall(r"^\| (DQ-\d{3}) \|", fh.read(), re.M))


def dbt_ids():
    ids = set()
    files = glob.glob(os.path.join(HERE, "models", "*.yml")) + glob.glob(os.path.join(HERE, "tests", "*.sql"))
    for f in files:
        with open(f, encoding="utf-8") as fh:
            ids |= set(re.findall(r"DQ-\d{3}", fh.read()))
    return ids


class RuleCoverageTest(unittest.TestCase):
    def test_every_rule_has_a_check(self):
        self.assertEqual(sorted(standards_ids() - dbt_ids()), [])

    def test_every_check_has_a_rule(self):
        self.assertEqual(sorted(dbt_ids() - standards_ids()), [])

    def test_no_models_so_nothing_is_written(self):
        self.assertEqual(glob.glob(os.path.join(HERE, "models", "**", "*.sql"), recursive=True), [])

    def test_no_password_in_tracked_config(self):
        for name in ("profiles.example.yml", "dbt_project.yml"):
            with open(os.path.join(HERE, name), encoding="utf-8") as fh:
                self.assertRegex(fh.read(), r'password: ""|^(?!.*password)', name)

    def test_event_type_list_matches_spec(self):
        ns = {}
        with open(SPEC, encoding="utf-8") as fh:
            exec(fh.read(), ns)
        names = {n for n, v in ns["E"].items() if v["sup"] == "Event" and n != "Vehicle Position"}
        with open(os.path.join(HERE, "models", "silver_sources.yml"), encoding="utf-8") as fh:
            text = fh.read()
        block = text.split("dq_012_event_event_type_code_accepted", 1)[1].split("config:", 1)[0]
        listed = set(re.findall(r'"([^"]+)"', block))
        self.assertEqual(listed, names)


if __name__ == "__main__":
    unittest.main()
