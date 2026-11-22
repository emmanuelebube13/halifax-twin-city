"""Configuration files in config/: business rules, sectors, layers and stories."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


def _read_text(path: Path) -> str:
    # utf-8-sig: accept files saved with a byte order mark (Windows PowerShell 5.1).
    return path.read_text(encoding="utf-8-sig")


@dataclass
class AppConfig:
    rules: dict
    sectors: dict
    live_layers: dict
    layers: dict
    stories: dict[str, dict] = field(default_factory=dict)

    @property
    def live(self) -> dict:
        return self.rules.get("live", {})

    @property
    def on_time(self) -> tuple[int, int]:
        r = self.rules.get("on_time", {})
        return int(r.get("early_limit_seconds", -60)), int(r.get("late_limit_seconds", 300))

    @property
    def on_time_rule_text(self) -> str:
        early, late = self.on_time
        return f"{-early} s early to {late} s late (interim, not yet decided)"


def _check_layer(name: str, layer: dict) -> None:
    if layer.get("kind") not in {"location", "asset", "event"}:
        raise ValueError(f"layer {name}: kind must be location, asset or event")
    if layer.get("gold_measure"):
        return
    names = [layer["subtype_table"]] if layer.get("subtype_table") else []
    if layer.get("positive_column"):
        names.append(layer["positive_column"])
    for value in names + list(layer.get("subtype_columns", [])):
        if not IDENTIFIER.match(value):
            raise ValueError(f"layer {name}: {value!r} is not a plain column or table name")


def load_config(config_dir: Path) -> AppConfig:
    rules = yaml.safe_load(_read_text(config_dir / "business-rules.yaml")) or {}
    sectors = json.loads(_read_text(config_dir / "sectors.json"))
    layers_doc = json.loads(_read_text(config_dir / "layers.json"))
    live, layers = layers_doc.get("live", {}), layers_doc.get("layers", {})
    for name, layer in {**live, **layers}.items():
        _check_layer(name, layer)
    stories = {}
    for path in sorted((config_dir / "stories").glob("*.json")):
        story = json.loads(_read_text(path))
        stories[story["id"]] = story
    return AppConfig(rules=rules, sectors=sectors, live_layers=live, layers=layers, stories=stories)
