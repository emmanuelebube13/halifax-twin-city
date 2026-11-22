"""Scratch-database tests, one per source: the full run (fetch from recorded pages, bronze register, raw
files, silver writes) and idempotence. Never runs against halifax_twin (see conftest.db)."""
from __future__ import annotations

import json

import pytest

from hrm_arcgis import __main__ as cli, arcgis, sources, store, transform

pytestmark = pytest.mark.db


def fake_network(monkeypatch, features, page_size=4):
    """Serve the fixture features as ArcGIS GeoJSON pages, like the real layer would."""
    monkeypatch.setattr(arcgis, "count", lambda s, url, where="1=1": len(features))

    def get_page(session, layer_url, params, retries=2):
        off = params["resultOffset"]
        chunk = features[off:off + page_size]
        body = {"type": "FeatureCollection", "features": chunk}
        if off + page_size < len(features):
            body["properties"] = {"exceededTransferLimit": True}
        content = json.dumps(body).encode()
        page = arcgis.Page(layer_url + "/query", transform.dt.datetime.now(transform.UTC), 200, content)
        page.features, page.exceeded = arcgis.parse_page(content)
        return page

    monkeypatch.setattr(arcgis, "get_page", get_page)
    monkeypatch.setattr(arcgis.time, "sleep", lambda s: None)
    original = arcgis.fetch_layer
    monkeypatch.setattr(arcgis, "fetch_layer",
                        lambda *a, **k: original(*a, **{**k, "page_size": page_size}))


def counts(conn, source_id, subtype):
    return conn.execute(
        f"""SELECT (SELECT count(*) FROM silver.location WHERE source_id = %(s)s),
                   (SELECT count(*) FROM silver.event WHERE source_id = %(s)s),
                   (SELECT count(*) FROM silver.{subtype} x JOIN silver.event e USING (event_id) WHERE e.source_id = %(s)s),
                   (SELECT count(*) FROM silver.location_hist WHERE source_id = %(s)s),
                   (SELECT max(dw_loaded_ts) FROM silver.event WHERE source_id = %(s)s)""",
        {"s": source_id}).fetchone()


@pytest.mark.parametrize("layer,fixture,expected", [
    ("street_closures", "street_closures", 11),      # 12 features, one key repeated
    ("sidewalk_closures", "sidewalk_closures", 5),
    ("building_permits", "building_permits", 8),     # 11 features, 2 never issued, one key repeated
])
def test_full_run_and_rerun(db, tmp_path, monkeypatch, features, layer, fixture, expected):
    monkeypatch.setenv("HALIFAX_TWIN_DATA_DIR", str(tmp_path))
    feats = features(fixture)
    fake_network(monkeypatch, feats)
    cfg = sources.BY_NAME[layer]

    res = cli.run_layer(db, cfg)
    assert res.events_inserted == expected and res.locations_inserted == expected
    assert res.subtypes_inserted == expected
    loc, ev, sub, hist, loaded = counts(db, cfg.source_id, cfg.subtype_table)
    assert (loc, ev, sub, hist) == (expected, expected, expected, 0)

    # Bronze: one feed_fetch row per page, each with its raw file on disk.
    pages = db.execute("SELECT http_status, entity_count, file_path FROM bronze.feed_fetch WHERE source_id = %s "
                       "ORDER BY fetch_id", (cfg.source_id,)).fetchall()
    # A last page that is full is followed by one more (empty) request, to be sure the layer is finished.
    assert len(pages) == len(feats) // 4 + 1
    assert sum(p[1] for p in pages) == len(feats) and all(p[0] == 200 for p in pages)
    for _, _, path in pages:
        assert path.startswith(f"bronze/{cfg.source_id}/") and "\\" not in path
        assert (tmp_path / path).is_file()

    # Geometry, linkage and SRID.
    bad = db.execute(
        """SELECT count(*) FROM silver.event e JOIN silver.location l USING (location_id)
            WHERE e.source_id = %s AND (ST_SRID(l.location_geometry) <> 4326 OR l.centroid_latitude NOT BETWEEN 44 AND 46
                                        OR e.event_type_code <> %s)""",
        (cfg.source_id, "Road Closure" if cfg.subtype_table == "road_closure" else "Building Permit")).fetchone()[0]
    assert bad == 0
    unlinked = db.execute("SELECT count(*) FROM silver.event WHERE source_id = %s AND location_id IS NULL",
                          (cfg.source_id,)).fetchone()[0]
    assert unlinked == 0

    # Re-running the same data changes nothing in silver.
    res2 = cli.run_layer(db, cfg)
    assert res2.changed() == 0
    assert counts(db, cfg.source_id, cfg.subtype_table) == (loc, ev, sub, 0, loaded)


def test_changed_source_value_updates_and_keeps_history(db, features):
    rows, _ = transform.street_closures(features("street_closures"))
    store.store(db, "SRC-015", "road_closure", rows, batch_id=None)
    changed = rows[0]
    changed.location_name = "RENAMED ST"
    changed.subtype = {**changed.subtype, "detour_description": "Follow local detour signage"}
    res = store.store(db, "SRC-015", "road_closure", [changed], batch_id=None)
    assert (res.locations_updated, res.events_updated, res.subtypes_updated) == (1, 0, 1)
    hist = db.execute("SELECT location_name FROM silver.location_hist WHERE source_id = 'SRC-015' "
                      "AND source_location_key = %s", (changed.key,)).fetchall()
    assert len(hist) == 1 and hist[0][0] != "RENAMED ST"
    detour = db.execute("""SELECT r.detour_description FROM silver.road_closure r JOIN silver.event e USING (event_id)
                            WHERE e.source_id = 'SRC-015' AND e.source_event_key = %s""", (changed.key,)).fetchone()[0]
    assert detour == "Follow local detour signage"


def test_failed_page_is_logged_and_nothing_is_stored(db, tmp_path, monkeypatch):
    monkeypatch.setenv("HALIFAX_TWIN_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(arcgis, "count", lambda s, url, where="1=1": 5)
    monkeypatch.setattr(arcgis, "get_page", lambda *a, **k: arcgis.Page(
        "https://example.invalid/query", transform.dt.datetime.now(transform.UTC), 500, None, "HTTP 500"))
    with pytest.raises(arcgis.FetchError):
        cli.run_layer(db, sources.BY_NAME["building_permits"])
    row = db.execute("SELECT http_status, error_text, file_path FROM bronze.feed_fetch WHERE source_id = 'SRC-066'").fetchall()
    assert row == [(500, "HTTP 500", None)]
    assert db.execute("SELECT count(*) FROM silver.event WHERE source_id = 'SRC-066'").fetchone()[0] == 0
