"""Validate response bodies against engineering/contract/openapi.yaml.

OpenAPI 3.1 schemas are JSON Schema 2020-12, so the whole document is loaded as one schema and each
check points at "#/components/schemas/<Name>". Unknown top-level keys (openapi, info, paths) are ignored.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

REPO = Path(__file__).resolve().parents[3]
OPENAPI = REPO / "engineering" / "contract" / "openapi.yaml"
EXAMPLES = REPO / "engineering" / "contract" / "examples"

# Example file name prefix -> response schema.
EXAMPLE_SCHEMAS = {
    "health": "HealthResponse",
    "client-config": "ClientConfigResponse",
    "sectors": "SectorRegisterResponse",
    "stories": "StoryListResponse",
    "story-": "StoryResponse",
    "live-vehicles": "VehicleCollectionResponse",
    "layers-": "FeatureCollectionResponse",
    "number-": "NumberResponse",
    "feature-": "FeatureDetailResponse",
    "sources": "SourceListResponse",
    "replay-": "ReplayResponse",
    "error-": "ErrorResponse",
}


@lru_cache(maxsize=1)
def document() -> dict:
    return yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))


def validator(schema_name: str) -> Draft202012Validator:
    doc = document()
    if schema_name not in doc["components"]["schemas"]:
        raise KeyError(schema_name)
    schema = {**doc, "$ref": f"#/components/schemas/{schema_name}"}
    return Draft202012Validator(schema, format_checker=FormatChecker())


def errors(body, schema_name: str) -> list[str]:
    return [f"{'/'.join(map(str, e.absolute_path))}: {e.message}"
            for e in validator(schema_name).iter_errors(body)]


def schema_for_example(name: str) -> str:
    for prefix, schema in EXAMPLE_SCHEMAS.items():
        if name.startswith(prefix):
            return schema
    raise KeyError(name)


def load_example(name: str):
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))
