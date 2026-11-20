"""Tests for the D01 demo shell: the app starts, serves the page, and never leaks the Cesium token."""
import json

from fastapi.testclient import TestClient

from api.main import create_app
from api.settings import Settings, load_settings

FAKE_TOKEN = "test-token-not-real"


def make_client(client_host="127.0.0.1", **kwargs):
    settings = Settings(cesium_ion_token=FAKE_TOKEN, business_rules={"on_time": {"late_limit_seconds": 300}}, **kwargs)
    return TestClient(create_app(settings), client=(client_host, 50000))


def test_page_is_served():
    r = make_client().get("/")
    assert r.status_code == 200
    assert "Halifax Twin" in r.text


def test_health_without_database_still_ok():
    r = make_client().get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == {"configured": False, "reachable": False,
                                "message": "No database_url in demo/config.local.json or HALIFAX_TWIN_DB_URL."}
    assert body["as_of"].endswith(("-03:00", "-04:00"))  # Halifax time
    assert "Open Government Licence" in body["attribution"]


def test_health_with_unreachable_database_reports_not_raises():
    r = make_client(database_url="postgresql://nobody:x@127.0.0.1:1/none").get("/api/health")
    assert r.status_code == 200
    assert r.json()["database"]["reachable"] is False


def test_token_given_to_localhost():
    body = make_client("127.0.0.1").get("/api/config").json()
    assert body["cesium_ion_token"] == FAKE_TOKEN
    assert body["three_d_available"] is True
    assert body["business_rules"]["on_time"]["late_limit_seconds"] == 300


def test_token_withheld_from_other_hosts():
    body = make_client("192.168.1.50").get("/api/config").json()
    assert body["cesium_ion_token"] is None
    assert body["three_d_available"] is False


def test_settings_ignore_placeholders_and_env_overrides(tmp_path, monkeypatch):
    cfg = tmp_path / "config.local.json"
    cfg.write_text(json.dumps({
        "database_url": "postgresql://postgres:YOUR_PASSWORD@localhost:5432/halifax_twin",
        "cesium_ion_token": "PASTE_YOUR_CESIUM_ION_TOKEN_HERE",
        "port": 8010,
    }), encoding="utf-8")
    monkeypatch.delenv("CESIUM_ION_TOKEN", raising=False)
    monkeypatch.delenv("HALIFAX_TWIN_DB_URL", raising=False)
    s = load_settings(cfg, tmp_path / "missing.yaml")
    assert s.database_url is None and s.cesium_ion_token is None and s.port == 8010

    monkeypatch.setenv("CESIUM_ION_TOKEN", "from-env")
    assert load_settings(cfg, tmp_path / "missing.yaml").cesium_ion_token == "from-env"


def test_business_rules_file_loads():
    rules = load_settings().business_rules
    assert rules["on_time"] == {"early_limit_seconds": -60, "late_limit_seconds": 300}
    assert rules["frequent_service"]["max_headway_minutes"] == 15
    assert rules["walk"]["five_minute_walk_metres"] == 400
