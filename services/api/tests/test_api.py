"""Endpoint tests against the seeded scratch database. Every response is checked against the contract."""
from __future__ import annotations

import json

import pytest

from halifax_api.numbers import NUMBERS

from .conftest import FAKE_TOKEN, make_client
from .contract import errors

ALL_STORIES = ["TRN-Q01", "PWK-Q13", "HRE-Q29", "TRN-Q02", "TRN-Q03", "TRN-Q04", "TRN-Q05", "TRN-Q11",
               "PWK-Q16", "TRN-Q25", "TRN-Q09", "HRE-Q08", "HRE-Q30"]

ENVELOPE_KEYS = {"data", "as_of", "source", "reliability_tier", "licence"}

# URL -> response schema in openapi.yaml.
ENDPOINTS = {
    "/v1/health": "HealthResponse",
    "/v1/client-config": "ClientConfigResponse",
    "/v1/sectors": "SectorRegisterResponse",
    "/v1/stories": "StoryListResponse",
    **{f"/v1/stories/{sid}": "StoryResponse" for sid in ALL_STORIES},
    "/v1/live/vehicles": "VehicleCollectionResponse",
    "/v1/layers/routes": "FeatureCollectionResponse",
    "/v1/layers/stops": "FeatureCollectionResponse",
    "/v1/layers/road-closures": "FeatureCollectionResponse",
    "/v1/layers/building-permits": "FeatureCollectionResponse",
    "/v1/layers/road-closures-all": "FeatureCollectionResponse",
    "/v1/layers/road-closures-upcoming": "FeatureCollectionResponse",
    "/v1/layers/new-units": "FeatureCollectionResponse",
    "/v1/layers/completed-permits": "FeatureCollectionResponse",
    "/v1/layers/bunching-stops": "FeatureCollectionResponse",
    "/v1/layers/stop-wait": "FeatureCollectionResponse",
    "/v1/layers/stops?bbox=-63.58,44.64,-63.57,44.65&limit=10": "FeatureCollectionResponse",
    "/v1/replay/vehicles?minutes=10": "ReplayResponse",
    "/v1/features/asset/900301": "FeatureDetailResponse",
    "/v1/features/asset/900201": "FeatureDetailResponse",
    "/v1/features/event/900001": "FeatureDetailResponse",
    "/v1/features/event/900011": "FeatureDetailResponse",
    "/v1/features/event/900021": "FeatureDetailResponse",
    "/v1/features/location/900005": "FeatureDetailResponse",
    "/v1/sources": "SourceListResponse",
}
NUMBER_IDS = sorted(NUMBERS)
ERRORS = {
    "/v1/layers/parking": 404,
    "/v1/live/ferries": 404,
    "/v1/stories/TRN-Q99": 404,
    "/v1/numbers/trn.nothing": 404,
    "/v1/features/asset/1": 404,
    "/v1/features/party/1": 404,
    "/v1/layers/stops?bbox=1,2": 400,
    "/v1/layers/stops?bbox=10,10,0,0": 400,
    "/v1/layers/stops?limit=0": 400,
    "/v1/replay/vehicles?minutes=500": 400,
    "/v1/not-an-endpoint": 404,
}


@pytest.mark.parametrize("url", list(ENDPOINTS))
def test_endpoint_matches_contract(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    body = r.json()
    assert ENVELOPE_KEYS <= set(body)
    assert errors(body, ENDPOINTS[url]) == []


@pytest.mark.parametrize("number_id", NUMBER_IDS)
def test_number_matches_contract(client, number_id):
    r = client.get(f"/v1/numbers/{number_id}")
    assert r.status_code == 200, r.text
    assert errors(r.json(), "NumberResponse") == []
    assert r.json()["data"]["id"] == number_id


@pytest.mark.parametrize("url,status", list(ERRORS.items()))
def test_errors_use_the_envelope(client, url, status):
    r = client.get(url)
    assert r.status_code == status
    body = r.json()
    assert errors(body, "ErrorResponse") == []
    assert body["data"] is None


def test_api_is_read_only(client):
    r = client.post("/v1/stories")
    assert r.status_code == 405
    assert errors(r.json(), "ErrorResponse") == []


def test_live_vehicles(client):
    body = client.get("/v1/live/vehicles").json()
    feats = {f["id"]: f["properties"] for f in body["data"]["features"]}
    assert set(feats) == {900301, 900302}  # 900303 reported 10 minutes ago: not live
    bus = feats[900301]
    assert bus["route_short_name"] == "1"
    assert bus["headsign"] == "1 Spring Garden to Mumford"
    assert bus["delay_seconds"] == 420 and bus["status"] == "late"
    assert bus["next_stop_name"] == "Mumford Terminal"
    assert bus["kind"] == "asset" and bus["sector_id"] == "S04" and bus["subsector_id"] == "TRN-01"
    assert feats[900302]["status"] == "unknown"
    assert [s["source_id"] for s in body["source"]] == ["SRC-001", "SRC-002", "SRC-004"]
    assert body["reliability_tier"] == "Tier 1"
    assert body["as_of"].endswith("Z")


def test_transit_numbers(client):
    value = lambda n: client.get(f"/v1/numbers/{n}").json()["data"]["value"]  # noqa: E731
    assert value("trn.buses_live") == 2
    assert value("trn.on_time_share") == 50.0
    assert (value("trn.on_time_count"), value("trn.late_count"), value("trn.early_count")) == (1, 1, 0)
    assert value("trn.trips_planned_today") == 1
    series = client.get("/v1/numbers/trn.on_time_share_24h").json()["data"]["series"]
    assert sum(1 for p in series if p["value"] is not None) >= 1


def test_public_works_and_housing(client):
    closures = client.get("/v1/layers/road-closures").json()["data"]["features"]
    assert [f["id"] for f in closures] == [900011]  # the ended closure is left out
    assert closures[0]["properties"]["closure_reason_code"] == "Utility"
    assert closures[0]["properties"]["sector_id"] == "S05"
    value = lambda n: client.get(f"/v1/numbers/{n}").json()["data"]["value"]  # noqa: E731
    assert value("pwk.closures_active") == 1
    assert value("pwk.closure_median_days") == 7.0
    permits = client.get("/v1/layers/building-permits").json()["data"]["features"]
    assert [f["id"] for f in permits] == [900021]  # the 400-day-old permit is outside the 365-day window
    assert permits[0]["properties"]["construction_value_amount"] == 18250000.0
    assert value("hre.permits_ytd") == 1
    assert value("hre.units_created_ytd") == 10
    by_year = client.get("/v1/numbers/hre.permits_by_year").json()["data"]
    assert sum(p["value"] for p in by_year["series"]) == 2


def test_bbox_and_limit(client):
    stops = client.get("/v1/layers/stops?bbox=-63.58,44.64,-63.57,44.65").json()["data"]["features"]
    assert {f["id"] for f in stops} == {900201, 900202}
    limited = client.get("/v1/layers/stops?limit=1").json()["data"]
    assert len(limited["features"]) == 1 and limited["limit_reached"] is True


def test_feature_history(client):
    bus = client.get("/v1/features/asset/900301").json()["data"]
    assert [h["properties"]["delay_seconds"] for h in bus["history"]] == [420, 30]
    assert bus["geometry"]["type"] == "Point"
    trip = client.get("/v1/features/event/900001").json()["data"]
    assert trip["properties"]["route_short_name"] == "1" and len(trip["history"]) == 2


def test_source_status(client):
    status = {s["source_id"]: s["status"] for s in client.get("/v1/sources").json()["data"]}
    assert status["SRC-001"] == "ok"
    assert status["SRC-002"] == "stale"   # live feed, 10 minutes since the last load
    assert status["SRC-003"] == "down"    # last attempt failed
    assert status["SRC-004"] == "ok"      # quarterly, loaded 3 days ago
    assert status["SRC-015"] == "unknown"  # never loaded


def test_sectors(client):
    data = client.get("/v1/sectors").json()["data"]
    assert len(data["sectors"]) == 17 and len(data["groups"]) == 5
    assert sorted(s["sector_id"] for s in data["sectors"] if s["pinned"]) == ["S04", "S05", "S09"]
    live = {s["sector_id"] for s in data["sectors"] if s["status"] == "live"}
    assert {"S04", "S05", "S09"} <= live
    grouped = [sid for g in data["groups"] for sid in g["sector_ids"]]
    assert sorted(grouped) == sorted(s["sector_id"] for s in data["sectors"])


def test_stories_list_core_three(client):
    stories = {s["id"]: s for s in client.get("/v1/stories").json()["data"]}
    assert {"TRN-Q01", "PWK-Q13", "HRE-Q29"} <= set(stories)
    assert stories["TRN-Q01"]["question"] == "Where is every bus right now, and is it on time?"


def test_every_story_number_and_layer_exists(client):
    """Story configuration must only point at numbers and layers the API serves."""
    for s in client.get("/v1/stories").json()["data"]:
        story = client.get(f"/v1/stories/{s['id']}").json()["data"]
        for n in story["answer"]["numbers"] + [story["context"]["number_id"]]:
            assert client.get(f"/v1/numbers/{n}").status_code == 200, (s["id"], n)
        for layer in story["evidence"]["layers"]:
            assert client.get(f"/v1/{layer['path']}/{layer['layer']}").status_code == 200, (s["id"], layer)
        for placeholder in [p.split("}")[0] for p in story["answer"]["template"].split("{")[1:]]:
            assert placeholder in story["answer"]["numbers"], (s["id"], placeholder)


# ---------------------------------------------------------------- the Cesium token

def test_token_sent_to_local_caller(database_ready):
    with make_client(client_host="127.0.0.1") as c:
        data = c.get("/v1/client-config").json()["data"]
    assert data["cesium_ion_token"] == FAKE_TOKEN and data["three_d_available"] is True


@pytest.mark.parametrize("host", ["192.168.1.20", "10.0.0.5", "testclient"])
def test_token_withheld_from_other_hosts(database_ready, host):
    with make_client(client_host=host) as c:
        r = c.get("/v1/client-config")
    data = r.json()["data"]
    assert data["cesium_ion_token"] is None and data["three_d_available"] is False
    assert FAKE_TOKEN not in r.text


def test_token_withheld_from_foreign_origin(database_ready):
    with make_client(client_host="127.0.0.1") as c:
        r = c.get("/v1/client-config", headers={"Origin": "https://evil.example"})
    assert r.json()["data"]["cesium_ion_token"] is None
    assert FAKE_TOKEN not in r.text


def test_token_never_in_other_responses(client):
    for url in list(ENDPOINTS) + ["/v1/openapi.json"]:
        if url == "/v1/client-config":
            continue
        assert FAKE_TOKEN not in client.get(url).text, url


def test_no_token_means_2d(database_ready):
    with make_client(token=None) as c:
        data = c.get("/v1/client-config").json()["data"]
    assert data["three_d_available"] is False and data["cesium_ion_token"] is None
    assert data["business_rules"]["raw_retention_days"] == 7


# ---------------------------------------------------------------- CORS

@pytest.mark.parametrize("origin", ["http://127.0.0.1:5173", "http://localhost:5173"])
def test_cors_allows_web_dev_server(client, origin):
    r = client.get("/v1/stories", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") == origin


def test_cors_refuses_other_origins(client):
    r = client.get("/v1/stories", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


# ---------------------------------------------------------------- empty and failing database

def test_empty_database_is_valid(empty_database):
    c = empty_database
    for url, schema in ENDPOINTS.items():
        if "/features/" in url:
            assert c.get(url).status_code == 404
            continue
        r = c.get(url)
        assert r.status_code == 200, (url, r.text)
        assert errors(r.json(), schema) == [], url
    vehicles = c.get("/v1/live/vehicles").json()
    assert vehicles["data"]["features"] == [] and vehicles["as_of"] is None
    for n in NUMBER_IDS:
        body = c.get(f"/v1/numbers/{n}").json()
        assert errors(body, "NumberResponse") == []
        assert body["data"]["value"] is None, n


def test_database_down_breaks_only_data_endpoints(unreachable_client):
    c = unreachable_client
    for url in ["/v1/live/vehicles", "/v1/layers/routes", "/v1/numbers/trn.buses_live", "/v1/sources",
                "/v1/features/asset/900301", "/v1/replay/vehicles"]:
        r = c.get(url)
        assert r.status_code == 503, url
        body = r.json()
        assert errors(body, "ErrorResponse") == []
        assert body["error"]["code"] == "source_unavailable"
        text = json.dumps(body).lower()
        for leak in ("traceback", "psycopg", "operationalerror", "connection refused", "5433", "port 1"):
            assert leak not in text, (url, leak)
    for url in ["/v1/sectors", "/v1/client-config", "/v1/stories/TRN-Q01"]:
        assert c.get(url).status_code == 200, url
    health = c.get("/v1/health").json()["data"]
    assert health["status"] == "degraded" and health["database"]["reachable"] is False


# ---------------------------------------------------------------- the wider release 1 stories

def test_thirteen_stories_with_honest_status(client):
    stories = {s["id"]: s for s in client.get("/v1/stories").json()["data"]}
    assert set(ALL_STORIES) <= set(stories)
    for sid in ("TRN-Q01", "PWK-Q13", "HRE-Q29", "TRN-Q25", "PWK-Q16"):
        assert stories[sid]["status"] == "live", sid
    # The seeded archive spans minutes, not days: analytics stories must say they are collecting data.
    for sid in ("TRN-Q02", "TRN-Q03", "TRN-Q04", "TRN-Q05", "TRN-Q11", "TRN-Q09"):
        assert stories[sid]["status"] == "collecting_data", sid
        assert stories[sid]["status_note"]
    for sid in ("HRE-Q08", "HRE-Q30"):
        assert stories[sid]["status"] == "source_incomplete" and stories[sid]["status_note"], sid


def test_closures_and_routes(client):
    upcoming = client.get("/v1/layers/road-closures-upcoming").json()["data"]["features"]
    assert [f["id"] for f in upcoming] == [900013]
    assert upcoming[0]["properties"]["near_route_short_names"] == ["1"]
    assert upcoming[0]["properties"]["duration_days"] == 7.0
    value = lambda n: client.get(f"/v1/numbers/{n}").json()["data"]["value"]  # noqa: E731
    assert value("pwk.upcoming_closures_30d") == 1
    assert value("pwk.upcoming_on_routes_30d") == 1
    assert value("pwk.upcoming_sidewalk_30d") == 1
    assert value("trn.closures_in_effect") == 1
    assert value("trn.closures_on_routes") == 0
    assert value("trn.closure_delay_gap") is None  # fewer than 30 arrivals beside closures: no answer


def test_permit_timing_and_units(client):
    value = lambda n: client.get(f"/v1/numbers/{n}").json()["data"]["value"]  # noqa: E731
    assert value("hre.issue_to_completion_median_days") == 370
    assert [f["id"] for f in client.get("/v1/layers/new-units").json()["data"]["features"]] == [900021]
    assert [f["id"] for f in client.get("/v1/layers/completed-permits").json()["data"]["features"]] == [900022]


def test_gold_measures_answer_from_gold(client):
    # Today's seeded service day: the gold functions run and return contract-shaped numbers.
    body = client.get("/v1/numbers/trn.late_share_7d").json()
    assert errors(body, "NumberResponse") == []
    body = client.get("/v1/numbers/trn.trips_not_run_by_day").json()
    assert errors(body, "NumberResponse") == []


def test_without_gold_functions(no_gold):
    c = no_gold
    for n in ("trn.late_share_7d", "trn.bunched_share_7d", "trn.excess_wait_7d", "trn.trips_not_run_yesterday",
              "trn.slow_segments_count", "trn.trips_planned_today"):
        body = c.get(f"/v1/numbers/{n}").json()
        assert errors(body, "NumberResponse") == [] and body["data"]["value"] is None, n
    for layer in ("bunching-stops", "stop-wait"):
        body = c.get(f"/v1/layers/{layer}").json()
        assert body["data"]["features"] == [], layer
    story = c.get("/v1/stories/TRN-Q02").json()["data"]
    assert story["status"] == "collecting_data" and "gold" in story["status_note"]
    assert c.get("/v1/health").json()["data"]["gold_planned_stop_time"] is False


def test_buses_live_is_zero_when_the_feed_answers_with_no_vehicles(empty_database):
    # Overnight the vehicle feed answers normally but lists no buses: that is zero buses, not "no data".
    from tests.conftest import TEST_DB_URL
    import psycopg
    assert empty_database.get("/v1/numbers/trn.buses_live").json()["data"]["value"] is None
    with psycopg.connect(TEST_DB_URL, autocommit=True) as conn:
        conn.execute("""INSERT INTO bronze.feed_fetch (source_id, fetched_ts, http_status, entity_count)
                        VALUES ('SRC-001', now() - interval '20 seconds', 200, 0)""")
    from tests.conftest import make_client
    with make_client() as fresh:  # no cached answer
        body = fresh.get("/v1/numbers/trn.buses_live").json()
    assert body["data"]["value"] == 0
    assert body["as_of"] is not None


# ---------------------------------------------------------------- release 1 follow-up (22 Nov 2026)

def test_vehicle_detail_carries_current_trip(client):
    bus = client.get("/v1/features/asset/900301").json()
    assert errors(bus, "FeatureDetailResponse") == []
    p = bus["data"]["properties"]
    live = {f["id"]: f["properties"] for f in client.get("/v1/live/vehicles").json()["data"]["features"]}[900301]
    for field in ("route_short_name", "route_long_name", "route_id", "trip_id", "headsign", "status",
                  "delay_seconds", "next_stop_name"):
        assert p[field] == live[field], field
    assert p["headsign"] == "1 Spring Garden to Mumford" and p["status"] == "late"
    assert p["next_stop_name"] == "Mumford Terminal" and p["delay_seconds"] == 420


def test_vehicle_detail_without_current_trip(client):
    # 900303 last reported 10 minutes ago: not live, so no current trip.
    body = client.get("/v1/features/asset/900303").json()
    assert errors(body, "FeatureDetailResponse") == []
    p = body["data"]["properties"]
    assert p["status"] == "unknown"
    for field in ("route_short_name", "headsign", "delay_seconds", "next_stop_name", "trip_id"):
        assert p[field] is None, field


def test_trips_not_run_by_day_is_fast_when_warm(client):
    import time
    first = client.get("/v1/numbers/trn.trips_not_run_by_day").json()
    assert errors(first, "NumberResponse") == []
    client.app.state.cache.clear()  # drop the 10-minute number cache; finished days stay cached
    t = time.perf_counter()
    second = client.get("/v1/numbers/trn.trips_not_run_by_day").json()
    assert time.perf_counter() - t < 1.0
    assert second["data"]["series"] == first["data"]["series"]


def test_singular_templates(client):
    for s in client.get("/v1/stories").json()["data"]:
        answer = client.get(f"/v1/stories/{s['id']}").json()["data"]["answer"]
        if "template_one" not in answer:
            continue
        first = "{" + answer["numbers"][0] + "}"
        assert answer["template_one"] != answer["template"], s["id"]
        assert answer["template"].startswith(first) and answer["template_one"].startswith(first), s["id"]
        placeholders = lambda t: sorted(p.split("}")[0] for p in t.split("{")[1:])  # noqa: E731
        assert placeholders(answer["template_one"]) == placeholders(answer["template"]), s["id"]


def test_partial_series_points(client):
    body = client.get("/v1/numbers/hre.permits_by_year").json()
    assert errors(body, "NumberResponse") == []
    points = body["data"]["series"]
    # The seed holds a permit today and one 400 days ago: the current year is partial; the first year is
    # partial unless its first permit falls in January.
    assert points[-1].get("partial") is True
    import datetime as dt
    first_day = dt.date.today() - dt.timedelta(days=400)
    assert points[0].get("partial", False) is (first_day.month > 1)
    for p in points[1:-1]:
        assert "partial" not in p
    months = client.get("/v1/numbers/pwk.closures_by_month").json()["data"]["series"]
    assert months[-1].get("partial") is True


def test_days_templates_name_the_unit(client):
    for sid in ("HRE-Q30", "PWK-Q13", "TRN-Q25"):
        template = client.get(f"/v1/stories/{sid}").json()["data"]["answer"]["template"]
        for number_id in ("hre.issue_to_completion_median_days", "pwk.closure_median_days", "trn.closure_median_days_all"):
            if "{" + number_id + "}" in template:
                assert "{" + number_id + "} days" in template, sid


def test_checked_and_changed_times(client):
    import datetime as dt
    parse = lambda t: dt.datetime.fromisoformat(t.replace("Z", "+00:00"))  # noqa: E731
    now = dt.datetime.now(dt.timezone.utc)
    body = client.get("/v1/layers/building-permits").json()
    assert errors(body, "FeatureCollectionResponse") == []
    ref = {s["source_id"]: s for s in body["source"]}["SRC-066"]
    assert now - parse(ref["checked_ts"]) < dt.timedelta(minutes=5)          # checked a minute ago
    assert dt.timedelta(hours=10) < now - parse(ref["last_changed_ts"]) < dt.timedelta(hours=12)  # unchanged 11 h
    sources = {s["source_id"]: s for s in client.get("/v1/sources").json()["data"]}
    assert sources["SRC-066"]["status"] == "ok"   # staleness follows the check, not the change
    assert sources["SRC-066"]["checked_ts"] == ref["checked_ts"]
    assert sources["SRC-001"]["last_changed_ts"] is None   # live feed: as_of says it
    assert sources["SRC-001"]["checked_ts"] is not None
    assert sources["SRC-015"]["checked_ts"] is None        # never checked
    live = client.get("/v1/live/vehicles").json()
    assert all(s["last_changed_ts"] is None for s in live["source"] if s["source_id"] in ("SRC-001", "SRC-002"))
    assert {s["source_id"]: s for s in live["source"]}["SRC-004"]["last_changed_ts"] is not None  # schedule: checked
