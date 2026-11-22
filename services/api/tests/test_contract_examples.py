"""The committed examples are what the web app builds against, so each must match the contract."""
from __future__ import annotations

import pytest

from .contract import EXAMPLES, document, errors, load_example, schema_for_example

EXAMPLE_FILES = sorted(p.name for p in EXAMPLES.glob("*.json"))


def test_openapi_lists_every_endpoint():
    paths = set(document()["paths"])
    assert {"/v1/stories", "/v1/stories/{id}", "/v1/live/{layer}", "/v1/layers/{layer}", "/v1/numbers/{id}",
            "/v1/features/{kind}/{id}", "/v1/sources", "/v1/sectors", "/v1/replay/{layer}", "/v1/health",
            "/v1/client-config"} <= paths


def test_every_endpoint_has_an_example():
    prefixes = ["health", "client-config", "sectors", "stories", "story-", "live-vehicles", "layers-", "number-",
                "feature-", "sources", "replay-"]
    for p in prefixes:
        assert any(f.startswith(p) for f in EXAMPLE_FILES), p


@pytest.mark.parametrize("name", EXAMPLE_FILES)
def test_example_matches_contract(name):
    body = load_example(name)
    assert errors(body, schema_for_example(name)) == []
    for key in ("data", "as_of", "source", "reliability_tier", "licence"):
        assert key in body
