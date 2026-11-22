"""Turn ArcGIS GeoJSON features into silver rows. Pure functions: no network, no database.

Every function returns (rows, skipped) where skipped counts features that could not be stored without
inventing data (for example a permit with no issue date). Code values the model does not fix are listed
in the README under "Code values chosen".
"""
from __future__ import annotations

import datetime as dt
import json
import re
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

HALIFAX = ZoneInfo("America/Halifax")
UTC = dt.timezone.utc


@dataclass
class Row:
    """One location + one event + one subtype row, all keyed by the source's own key."""
    key: str                         # source_event_key and source_location_key
    event_type_code: str
    start_ts: dt.datetime
    end_ts: dt.datetime | None
    event_date: dt.date
    subsector_id: str
    status_code: str | None
    location_type_code: str
    location_name: str | None
    geometry_type_code: str
    geometry: str | None             # GeoJSON geometry text, EPSG:4326
    subtype: dict = field(default_factory=dict)


# ---------------------------------------------------------------- helpers

def clean(v, limit: int | None = None) -> str | None:
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    if s == "" or s.upper() in {"N/A", "NA", ".", "NONE", "NULL", "-"}:
        return None
    return s[:limit] if limit else s


def epoch_ms_to_utc(v) -> dt.datetime | None:
    if v is None:
        return None
    return dt.datetime.fromtimestamp(v / 1000, UTC)


def local_date(v) -> dt.date | None:
    """Date of an ArcGIS date value as seen in Halifax (closure dates are stored as local midnight)."""
    ts = epoch_ms_to_utc(v)
    return ts.astimezone(HALIFAX).date() if ts else None


def utc_date(v) -> dt.date | None:
    """Date of an ArcGIS date-only value stored as 12:00 UTC (the PPL&C permit dates)."""
    ts = epoch_ms_to_utc(v)
    return ts.date() if ts else None


def halifax_midnight(d: dt.date) -> dt.datetime:
    return dt.datetime.combine(d, dt.time(0, 0), HALIFAX).astimezone(UTC)


def at_halifax(d: dt.date, t: dt.time) -> dt.datetime:
    return dt.datetime.combine(d, t, HALIFAX).astimezone(UTC)


_TIME = re.compile(r"(?<!\d)(\d{1,2})(?:\s*[:.;]\s*(\d{2}))?[\s.]*([ap])\.?\s*m\b", re.I)
_TIME_4 = re.compile(r"(?<!\d)([01]?\d|2[0-3])([0-5]\d)\s*([ap])\.?\s*m\b", re.I)
_MIL = re.compile(r"^\s*([01]\d|2[0-3])([0-5]\d)\s*$")


def parse_clock(text) -> dt.time | None:
    """First clock time in free text such as '7:00am', '7 AM', '8.45am', '630AM', '0700', 'Noon'.

    Returns None for text with no clear time ('24 Hours', 'Periodic Closure', blank): the caller then
    uses whole days. 'Midnight' and '12:00AM' return 00:00.
    """
    s = clean(text)
    if not s:
        return None
    low = s.lower()
    if low.startswith("noon"):
        return dt.time(12, 0)
    if low.startswith("midnight"):
        return dt.time(0, 0)
    m = _TIME_4.search(s) or _TIME.search(s)
    if m:
        h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3).lower()
        if not (1 <= h <= 12 and 0 <= mi <= 59):
            return None
        h = h % 12 + (12 if ap == "p" else 0)
        return dt.time(h, mi)
    m = _MIL.match(s)
    if m:
        return dt.time(int(m.group(1)), int(m.group(2)))
    return None


def geometry_text(feature) -> tuple[str | None, str]:
    """(GeoJSON geometry text or None, geometry_type_code Point / Line / Polygon / None)."""
    g = feature.get("geometry")
    if not g or not g.get("coordinates"):
        return None, "None"
    kind = {"Point": "Point", "MultiPoint": "Point", "LineString": "Line", "MultiLineString": "Line",
            "Polygon": "Polygon", "MultiPolygon": "Polygon"}.get(g.get("type"), "None")
    return json.dumps(g, separators=(",", ":")), kind


# ---------------------------------------------------------------- road closures (SRC-015)

# Subsector of a closure, by the publisher's CLOSURE_TYPE (code values chosen; see README).
CLOSURE_SUBSECTOR = {
    "Utility": "PWK-03",          # Public Utilities: PWK-Q13
    "Construction": "PWK-04",     # Engineering & Construction
    "Development": "PWK-04",
}
CLOSURE_SUBSECTOR_DEFAULT = "TRN-09"   # Roads & Traffic Management: special events, block parties, other


def closure_reason(v) -> str | None:
    s = clean(v, 30)
    if s and s.startswith("Mobility Response"):
        return "Mobility Response"     # publisher value carries a damaged dash character
    return s


def closure_times(start_date, end_date, start_text, end_text) -> tuple[dt.datetime, dt.datetime | None]:
    """Start and end in UTC from the Halifax-midnight dates plus the free-text times.

    No readable time: the closure starts at 00:00 on its start date and ends at 24:00 on its end date.
    An end that would fall before the start on the same or a later date (for example '12:00AM' meaning
    the end of the day) also becomes 24:00 on the end date.
    An end date before the start date is a contradiction in the source (seen once: start 16 May 2026,
    end 16 Apr 2026). Which date is wrong cannot be known, so the end is left empty (None); the source
    values stay in the raw file.
    """
    sd, ed = local_date(start_date), local_date(end_date)
    st, et = parse_clock(start_text), parse_clock(end_text)
    start = at_halifax(sd, st) if st else halifax_midnight(sd)
    if ed is None or ed < sd:
        return start, None
    day_end = halifax_midnight(ed + dt.timedelta(days=1))
    end = at_halifax(ed, et) if et else day_end
    if end <= start:
        end = day_end
    return start, end


def street_closures(features) -> tuple[list[Row], int]:
    """Street_Closures layer 0: one planned street closure line per feature."""
    rows, skipped = [], 0
    for f in features:
        p = f.get("properties") or {}
        key = clean(p.get("GLOBALID"))
        if p.get("ALT_DATE_USED") == 1 and p.get("ALT_START_DATE"):
            sdate, edate = p.get("ALT_START_DATE"), p.get("ALT_END_DATE")
        else:
            sdate, edate = p.get("START_DATE"), p.get("END_DATE")
        if not key or sdate is None:
            skipped += 1
            continue
        start, end = closure_times(sdate, edate, p.get("START_TIME"), p.get("END_TIME"))
        reason = closure_reason(p.get("CLOSURE_TYPE"))
        geom, gtype = geometry_text(f)
        rows.append(Row(
            key=key, event_type_code="Road Closure", start_ts=start, end_ts=end,
            event_date=start.astimezone(HALIFAX).date(),
            subsector_id=CLOSURE_SUBSECTOR.get(reason, CLOSURE_SUBSECTOR_DEFAULT),
            status_code=clean(p.get("CLOSURE_STAGE"), 30),
            location_type_code="Line", location_name=street_span(p), geometry_type_code=gtype, geometry=geom,
            subtype={"closure_type_code": "Full", "closure_reason_code": reason,
                     "detour_description": clean(p.get("DETOUR_URL"), 2000)}))
    return rows, skipped


# Development_Street_Closures layer 0 ("Sidewalk Closures and Disruptions"), domain TRN_RDM_EncroachTypes.
SIDEWALK_CLOSURE_TYPE = {
    "SW_CLOSED": "Sidewalk",            # Sidewalk Closed
    "SW_TEMP": "Sidewalk",              # Temporary Sidewalk
    "S_CLOSED_SW_CLOSED": "Lane",       # Lane Closed, Sidewalk Closed
    "S_CLOSED_SW_TEMP": "Lane",         # Lane Closed, Temporary Sidewalk
    "S_OPEN_SW_CLOSED": "Sidewalk",     # not in the published domain; street open
    "S_OPEN_SW_TEMP": "Sidewalk",
}


def sidewalk_closures(features) -> tuple[list[Row], int]:
    rows, skipped = [], 0
    for f in features:
        p = f.get("properties") or {}
        key = clean(p.get("GLOBALID"))
        ctype = SIDEWALK_CLOSURE_TYPE.get(clean(p.get("TYPE")) or "")
        if not key or p.get("START_DATE") is None or ctype is None:
            skipped += 1
            continue
        start, end = closure_times(p.get("START_DATE"), p.get("END_DATE"), None, None)
        geom, gtype = geometry_text(f)
        rows.append(Row(
            key=key, event_type_code="Road Closure", start_ts=start, end_ts=end,
            event_date=start.astimezone(HALIFAX).date(), subsector_id="PWK-04", status_code=None,
            location_type_code="Line", location_name=street_span(p), geometry_type_code=gtype, geometry=geom,
            subtype={"closure_type_code": ctype, "closure_reason_code": "Development",
                     "detour_description": None}))
    return rows, skipped


def street_span(p) -> str | None:
    street, a, b = clean(p.get("STREET_NAME")), clean(p.get("FROM_STR")), clean(p.get("TO_STR"))
    if not street:
        return None
    if a and b:
        return f"{street} from {a} to {b}"[:200]
    return street[:200]


# ---------------------------------------------------------------- building permits (SRC-066)

PERMIT_TYPE = {"New Building": "New", "Renovation": "Alteration", "Addition": "Alteration"}


def units(net) -> tuple[int | None, int | None]:
    """(units created, units removed) from the publisher's NET_NEW_UNITS."""
    if net is None:
        return None, None
    net = int(net)
    return max(net, 0), max(-net, 0)


def building_permits(features) -> tuple[list[Row], int]:
    """PPL&C Building Permits Geolocated: one point per permit. Only issued permits are stored
    (the model's Building Permit is 'a permit issued', with Event Start = issued)."""
    rows, skipped = [], 0
    for f in features:
        p = f.get("properties") or {}
        key = clean(p.get("PERMIT_NUMBER"))
        issued = utc_date(p.get("DATE_OF_PERMIT_ISSUANCE"))
        ptype = PERMIT_TYPE.get(clean(p.get("WORK_TYPE")) or clean(p.get("PRIMARY_WORK_SCOPE")) or "")
        if not key or issued is None or ptype is None:
            skipped += 1
            continue
        completed = utc_date(p.get("COMPLETED_DATE"))
        end = halifax_midnight(completed) if completed and completed >= issued else None
        created, removed = units(p.get("NET_NEW_UNITS"))
        value = p.get("ESTIMATED_PROJECT_VALUE")
        geom, gtype = geometry_text(f)
        rows.append(Row(
            key=key, event_type_code="Building Permit", start_ts=halifax_midnight(issued), end_ts=end,
            event_date=issued, subsector_id="HRE-09", status_code=clean(p.get("PERMIT_STATUS"), 30),
            location_type_code="Point", location_name=address(p), geometry_type_code=gtype, geometry=geom,
            subtype={"permit_type_code": ptype, "work_description": clean(p.get("WORK_DESCRIPTION"), 2000),
                     "construction_value_amount": round(float(value), 2) if value is not None and value >= 0 else None,
                     "units_created_count": created, "units_removed_count": removed}))
    return rows, skipped


def address(p) -> str | None:
    parts = " ".join(x for x in (clean(p.get("CIVIC_NUMBER")), clean(p.get("STREET_NAME"))) if x)
    community = clean(p.get("COMMUNITY"))
    if parts and community:
        return f"{parts}, {community}"[:200]
    return (parts or community or None) and (parts or community)[:200]
