"""One configuration per HRM ArcGIS layer. Adding a layer is a new entry here plus a transform function.

Addresses, fields and licence confirmed on 21 Nov 2026 (see README). outFields lists only the fields the
loader uses, so no other field (and no personal data) is ever downloaded.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import transform

ARC = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/"

CLOSURE_FIELDS = ["OBJECTID", "GLOBALID", "CLOSURE_TYPE", "CLOSURE_STAGE", "START_DATE", "END_DATE",
                  "START_TIME", "END_TIME", "ALT_START_DATE", "ALT_END_DATE", "ALT_DATE_USED", "REOPEN_EVENINGS",
                  "REOPEN_WEEKENDS", "PERMIT_NO", "APPLICATION_DATE", "DETOUR_URL", "ADDDATE",
                  "MODDATE", "STREET_NAME", "FROM_STR", "TO_STR", "RDMID"]
SIDEWALK_FIELDS = ["OBJECTID", "GLOBALID", "TYPE", "PERMIT_NO", "START_DATE", "END_DATE", "ADDDATE",
                   "MODDATE", "STREET_NAME", "FROM_STR", "TO_STR", "RDMID"]
PERMIT_FIELDS = ["OBJECTID", "PERMIT_NUMBER", "DATE_OF_SUBMISSION", "DATE_OF_PERMIT_ISSUANCE", "COMPLETED_DATE",
                 "EXPIRATION_DATE", "PERMIT_NAME", "WORK_TYPE", "PRIMARY_WORK_SCOPE", "PERMIT_STATUS",
                 "CIVIC_NUMBER", "STREET_NAME", "COMMUNITY", "ESTIMATED_PROJECT_VALUE", "TYPE_OF_STRUCTURE",
                 "EXISTING_RESIDENTIAL_UNITS", "TOTAL_END_RESIDENTIAL_UNITS", "NET_NEW_UNITS",
                 "NUMBER_OF_STOREYS", "WORK_DESCRIPTION", "PID", "DISTRICT"]


@dataclass(frozen=True)
class LayerConfig:
    name: str                 # short name, used on the command line and in raw file names
    source_id: str            # silver.source
    layer_url: str
    out_fields: list
    transform: Callable
    subtype_table: str
    story: str


LAYERS = [
    LayerConfig("street_closures", "SRC-015", ARC + "Street_Closures/FeatureServer/0", CLOSURE_FIELDS,
                transform.street_closures, "road_closure", "PWK-Q13"),
    LayerConfig("sidewalk_closures", "SRC-015", ARC + "Development_Street_Closures/FeatureServer/0",
                SIDEWALK_FIELDS, transform.sidewalk_closures, "road_closure", "PWK-Q13"),
    LayerConfig("building_permits", "SRC-066", ARC + "PPLC_Permits_Geolocated/FeatureServer/0", PERMIT_FIELDS,
                transform.building_permits, "building_permit", "HRE-Q29"),
]
BY_NAME = {c.name: c for c in LAYERS}
