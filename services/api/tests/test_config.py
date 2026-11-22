"""Configuration uses the logical model's physical names exactly, and every story is well formed."""
from __future__ import annotations

import re

from halifax_api.config import load_config
from halifax_api.settings import REPO_DIR, Settings

SILVER_SQL = (REPO_DIR / "database" / "sql" / "02_silver_tables.sql").read_text(encoding="utf-8")


def silver_columns(table: str) -> set[str]:
    m = re.search(rf"CREATE TABLE silver\.{table} \((.*?)\n\)", SILVER_SQL, re.S)
    assert m, f"silver.{table} is not in the physical model"
    return {line.split()[0] for line in m.group(1).splitlines() if line.strip() and not line.strip().startswith("CONSTRAINT")}


def test_layer_columns_exist_in_the_model():
    cfg = load_config(REPO_DIR / "config")
    for name, layer in cfg.layers.items():
        if layer.get("subtype_table"):
            cols = silver_columns(layer["subtype_table"])
            for col in layer.get("subtype_columns", []) + ([layer["positive_column"]] if layer.get("positive_column") else []):
                assert col in cols, (name, col)


def test_story_ids_and_sectors_match_reference_data():
    cfg = load_config(REPO_DIR / "config")
    ref = (REPO_DIR / "database" / "sql" / "08_reference_data.sql").read_text(encoding="utf-8")
    sector_ids = {s["sector_id"] for s in cfg.sectors["sectors"]}
    assert len(sector_ids) == 17
    for sid in sector_ids:
        assert f"('{sid}'," in ref
    for sector in cfg.sectors["sectors"]:
        assert f"('{sector['sector_id']}', '{sector['name']}'" in ref, sector
    for story in cfg.stories.values():
        assert story["sector_id"] in sector_ids
        assert f"('{story['subsector_id']}', '{story['sector_id']}'" in ref, story["id"]
        assert story["status"] in {"live", "planned", "collecting_data", "source_incomplete"}
        if story["status"] != "live":
            assert story.get("status_note"), story["id"]


def test_settings_never_show_the_token():
    s = Settings(database_url="postgresql://postgres@localhost:5433/x", config_dir=REPO_DIR / "config",
                 cesium_ion_token="secret-value-123")
    assert "secret-value-123" not in repr(s) and "secret-value-123" not in str(s)


def test_no_emoji_in_config_or_contract():
    emoji = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
    for folder in (REPO_DIR / "config", REPO_DIR / "engineering" / "contract"):
        for path in folder.rglob("*"):
            if path.is_file():
                assert not emoji.search(path.read_text(encoding="utf-8")), path
