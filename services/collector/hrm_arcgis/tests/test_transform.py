"""Parsing tests on recorded fixtures (real HRM features, 21 Nov 2026). No network, no database."""
from __future__ import annotations

import datetime as dt
import gzip
import json
import os

import pytest

from hrm_arcgis import arcgis, settings, transform as t

H = t.HALIFAX


def local(ts):
    return ts.astimezone(H).strftime("%Y-%m-%d %H:%M") if ts else None


@pytest.mark.parametrize("text,expected", [
    ("7:00am", dt.time(7, 0)), ("7AM", dt.time(7, 0)), ("7 AM", dt.time(7, 0)), ("8.45am", dt.time(8, 45)),
    ("7;00AM", dt.time(7, 0)), ("630AM", dt.time(6, 30)), ("1030AM", dt.time(10, 30)), ("0700", dt.time(7, 0)),
    ("12:00PM", dt.time(12, 0)), ("12:00AM", dt.time(0, 0)), ("11:59PM", dt.time(23, 59)), ("Noon", dt.time(12, 0)),
    ("Midnight", dt.time(0, 0)), ("7AM (8AM Saturday)", dt.time(7, 0)), ("6PM on Friday", dt.time(18, 0)),
    ("8.am", dt.time(8, 0)), ("24 Hours", None), ("24/7", None), ("Periodic Closure", None), ("N/A", None),
    (None, None), ("", None), ("13PM", None),
])
def test_parse_clock(text, expected):
    assert t.parse_clock(text) == expected


def test_street_closures_mapping(features):
    rows, skipped = t.street_closures(features("street_closures"))
    assert skipped == 0 and len(rows) == 12
    by = {r.key: r for r in rows}

    utility = by["93170700-9bc5-4132-993f-079bd0bf6bca"]   # 7AM to 8PM on one day
    assert (utility.event_type_code, utility.subsector_id, utility.status_code) == ("Road Closure", "PWK-03", "Approved")
    assert (local(utility.start_ts), local(utility.end_ts)) == ("2022-11-17 07:00", "2022-11-17 20:00")
    assert utility.subtype == {"closure_type_code": "Full", "closure_reason_code": "Utility", "detour_description": None}
    assert utility.location_type_code == "Line" and utility.geometry_type_code == "Line"
    assert json.loads(utility.geometry)["type"] in ("LineString", "MultiLineString")
    assert utility.location_name.startswith("BLINK BONNIE TERR from MACDONALD ST to")
    assert utility.event_date == dt.date(2022, 11, 17)

    whole_days = by["3a7183d2-77e0-49f0-9161-87780959c776"]   # '24 Hours': whole days, end inclusive
    assert (local(whole_days.start_ts), local(whole_days.end_ts)) == ("2022-05-02 00:00", "2022-07-01 00:00")

    midnight_end = by["01d310f6-707a-4450-8fa0-51aeb0cc0ee2"]   # 12:00PM to 12:00AM = to the end of the day
    assert (local(midnight_end.start_ts), local(midnight_end.end_ts)) == ("2024-09-02 12:00", "2024-09-03 00:00")
    assert midnight_end.subsector_id == "TRN-09"

    alt = by["53ff4e53-10ff-4e33-ac6e-0180604c4de4"]   # ALT_DATE_USED = 1: the alternative dates apply
    assert local(alt.start_ts) == "2026-10-28 07:00" and alt.subsector_id == "PWK-04"

    assert by["704a2f13-32e6-46ec-b08e-d9a63c7d7a3b"].subtype["closure_reason_code"] == "Mobility Response"
    open_ended = by["209d3c18-d928-41c2-8b8a-752865236f37"]   # publisher end date 31 Dec 2099 kept as given
    assert local(open_ended.end_ts) == "2099-12-31 23:59"


def test_end_date_before_start_date_leaves_end_empty(features):
    """Real record (DQ-060): START_DATE 16 May 2026, END_DATE 16 Apr 2026, 8am to 12pm. Not guessed."""
    rows, _ = t.street_closures(features("street_closures"))
    r = {x.key: x for x in rows}["3822762b-2e3a-4c49-a035-01f43759cf52"]
    assert local(r.start_ts) == "2026-05-16 08:00"
    assert r.end_ts is None
    assert r.event_date == dt.date(2026, 5, 16) and r.subtype["closure_reason_code"] == "Special Event"
    # Every closure in the fixture now ends after it starts, or has no end.
    assert all(x.end_ts is None or x.end_ts > x.start_ts for x in rows)


def test_sidewalk_closures_mapping(features):
    rows, skipped = t.sidewalk_closures(features("sidewalk_closures"))
    assert skipped == 0 and len(rows) == 5
    by = {r.key: r for r in rows}
    sw = by["46be74c3-bbd0-4596-b317-225b8e344f07"]   # SW_CLOSED
    assert sw.subtype == {"closure_type_code": "Sidewalk", "closure_reason_code": "Development", "detour_description": None}
    assert (local(sw.start_ts), local(sw.end_ts)) == ("2021-06-07 00:00", "2023-04-30 00:00")
    assert sw.status_code is None and sw.subsector_id == "PWK-04"
    assert by["8590046b-82e8-4e0c-a247-f0dfa6691c6a"].subtype["closure_type_code"] == "Lane"   # S_CLOSED_SW_TEMP
    assert by["3869ef8b-32e5-4a09-8242-1d5198d242d1"].subtype["closure_type_code"] == "Sidewalk"  # S_OPEN_SW_TEMP


def test_sidewalk_unknown_type_is_skipped():
    rows, skipped = t.sidewalk_closures([{"properties": {"GLOBALID": "x", "TYPE": "NEW_CODE", "START_DATE": 0}}])
    assert rows == [] and skipped == 1


def test_building_permits_mapping(features):
    feats = features("building_permits")
    rows, skipped = t.building_permits(feats)
    assert skipped == 2                                   # never issued: no Event Start, not stored
    assert len(rows) == 9
    by = {r.key: r for r in rows}

    tower = by["BPCOM-2021-15327"]
    assert (tower.event_type_code, tower.subsector_id, tower.status_code) == ("Building Permit", "HRE-09", "Completed")
    assert (local(tower.start_ts), local(tower.end_ts)) == ("2022-04-04 00:00", "2025-03-19 00:00")
    assert tower.event_date == dt.date(2022, 4, 4)
    assert tower.subtype["permit_type_code"] == "New"
    assert tower.subtype["units_created_count"] == 110 and tower.subtype["units_removed_count"] == 0
    assert tower.subtype["construction_value_amount"] == 22000000.0
    assert tower.location_type_code == "Point" and tower.geometry_type_code == "Point"
    assert tower.location_name == "3840 JOSEPH HOWE DR, HALIFAX"

    conversion = by["BPRES-2022-02230"]                   # NET_NEW_UNITS = -1
    assert conversion.subtype["units_created_count"] == 0 and conversion.subtype["units_removed_count"] == 1
    assert conversion.subtype["permit_type_code"] == "Alteration" and conversion.end_ts is None

    assert by["BPRES-2024-09451"].subtype["permit_type_code"] == "Alteration"   # WORK_TYPE Addition
    assert by["BPRES-2025-11564"].subtype["construction_value_amount"] is None


def test_permit_completion_before_issue_is_not_an_end():
    f = {"properties": {"PERMIT_NUMBER": "P1", "WORK_TYPE": "Renovation", "DATE_OF_PERMIT_ISSUANCE": 1700000000000,
                        "COMPLETED_DATE": 1600000000000}, "geometry": None}
    rows, _ = t.building_permits([f])
    assert rows[0].end_ts is None and rows[0].geometry is None and rows[0].geometry_type_code == "None"


def test_parse_page_rejects_arcgis_error_body():
    with pytest.raises(arcgis.FetchError):
        arcgis.parse_page(b'{"error": {"code": 400, "message": "Invalid query"}}')
    feats, more = arcgis.parse_page(b'{"type": "FeatureCollection", "features": [], "exceededTransferLimit": true}')
    assert feats == [] and more is True


def test_prune_raw_keeps_recent_files(tmp_path, monkeypatch):
    monkeypatch.setenv("HALIFAX_TWIN_DATA_DIR", str(tmp_path))
    today = dt.datetime.now(H).date()
    old = settings.bronze_dir() / "SRC-015" / (today - dt.timedelta(days=8)).isoformat()
    new = settings.bronze_dir() / "SRC-015" / (today - dt.timedelta(days=6)).isoformat()
    for d in (old, new):
        d.mkdir(parents=True)
        with gzip.open(d / "street_closures_120000_p001.geojson.gz", "wb") as f:
            f.write(b"{}")
    assert arcgis.prune_raw(["SRC-015"]) == 1
    assert not old.exists() and new.exists()
