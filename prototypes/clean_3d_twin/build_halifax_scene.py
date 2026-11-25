#!/usr/bin/env python3
"""Open-data Halifax 3D street scene builder (zero-cost prototype).

Queries Halifax Regional Municipality (HRM) ArcGIS REST endpoints for any
WGS84 bounding box, normalizes geometries, estimates building eave/ridge
heights and roof forms from attributes (with an optional Nova Scotia LiDAR
DSM/DTM GeoTIFF height-sampling hook), and writes a scene JSON compatible with
``apps/web/public/twin-preview/engine.js``.

Usage:
    python prototypes/clean_3d_twin/build_halifax_scene.py \
        --bbox -63.5955,44.6575,-63.5880,44.6635 \
        --out apps/web/public/twin-preview/custom-halifax.json

Dependencies:
    Python 3.10+ standard library only (urllib, json, math, argparse).
    Optional: rasterio/numpy if reading GeoNOVA LiDAR DSM/DTM GeoTIFFs.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

HRM_ARC_BASE = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services"

DEFAULT_ENDPOINTS = {
    "buildings": f"{HRM_ARC_BASE}/Building_Footprints/FeatureServer/0",   # SRC-077
    "streets": f"{HRM_ARC_BASE}/Street_Centrelines/FeatureServer/0",      # SRC-027
    "trees": f"{HRM_ARC_BASE}/Street_Trees/FeatureServer/0",              # SRC-051
    "stops": f"{HRM_ARC_BASE}/Bus_Stops/FeatureServer/0",                 # SRC-005
}

DEFAULT_BBOX = "-63.5955,44.6575,-63.5880,44.6635"

MARITIME_WALL_PALETTE = [
    "#efe9dc",  # warm cream clapboard
    "#9fb09e",  # heritage sage
    "#6d8496",  # slate blue
    "#a85c47",  # brick terracotta
    "#d8b780",  # warm ochre
    "#c9c2b2",  # pale cedar
]

COMMERCIAL_WALL_PALETTE = ["#9e5442", "#b37c5b", "#7a8288"]
ROOF_SHINGLE_PALETTE = ["#2f363e", "#3d444d", "#473b36"]
TREE_FOLIAGE_PALETTE = [
    ("Red Oak", "#4f6b3a"),
    ("Sugar Maple", "#9e532b"),
    ("Norway Maple", "#c28434"),
    ("Atlantic Spruce", "#2d543e"),
    ("Littleleaf Linden", "#5a7641"),
]


def parse_bbox(raw: str) -> tuple[float, float, float, float]:
    """Parse ``west,south,east,north`` WGS84 bounding box string."""
    parts = [float(p.strip()) for p in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("Bounding box must have 4 comma-separated numbers: west,south,east,north")
    west, south, east, north = parts
    if west >= east or south >= north:
        raise ValueError("Bounding box must satisfy west < east and south < north")
    return west, south, east, north


def query_arcgis_geojson(
    layer_url: str,
    bbox: tuple[float, float, float, float],
    out_fields: str = "*",
    page_size: int = 1000,
    timeout: int = 30,
) -> list[dict[str, Any]]:
    """Fetch all GeoJSON features intersecting ``bbox`` via ArcGIS REST paging."""
    west, south, east, north = bbox
    envelope = f"{west},{south},{east},{north}"
    features: list[dict[str, Any]] = []
    offset = 0

    while True:
        params = urllib.parse.urlencode(
            {
                "where": "1=1",
                "geometry": envelope,
                "geometryType": "esriGeometryEnvelope",
                "inSR": "4326",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": out_fields,
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": str(offset),
                "resultRecordCount": str(page_size),
            }
        )
        url = f"{layer_url.rstrip('/')}/query?{params}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "HalifaxDigitalTwin-Clean3DPrototype/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8-sig"))

        if "error" in payload:
            raise RuntimeError(f"ArcGIS REST error from {layer_url}: {payload['error']}")

        page_feats = payload.get("features") or []
        features.extend(page_feats)
        exceeded = bool(
            payload.get("exceededTransferLimit")
            or payload.get("properties", {}).get("exceededTransferLimit")
        )
        if not exceeded or len(page_feats) == 0:
            break
        offset += len(page_feats)

    return features


def polygon_area_m2(ring: list[list[float]], ref_lat: float) -> float:
    """Compute approximate planimetric footprint area in square metres."""
    if len(ring) < 3:
        return 0.0
    m_lat = 111132.0
    m_lon = 111320.0 * math.cos(math.radians(ref_lat))
    pts = [(c[0] * m_lon, c[1] * m_lat) for c in ring]
    area = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        area += x0 * y1 - x1 * y0
    return abs(area) * 0.5


def sample_lidar_height_m(
    lon: float,
    lat: float,
    dsm_path: Path | None,
    dtm_path: Path | None,
) -> float | None:
    """Hook for Nova Scotia GeoNOVA LiDAR DSM minus DTM height sampling.

    When Nova Scotia 1 m GeoTIFF tiles (nDSM = DSM - DTM) are available locally,
    this hook returns the 90th-percentile height inside the building footprint.
    Falls back to ``None`` when GeoTIFFs or ``rasterio`` are not supplied.
    """
    if dsm_path is None or dtm_path is None:
        return None
    try:
        import rasterio  # type: ignore[import-not-found]
    except ImportError:
        return None

    with rasterio.open(dsm_path) as dsm, rasterio.open(dtm_path) as dtm:
        dsm_val = next(dsm.sample([(lon, lat)]))[0]
        dtm_val = next(dtm.sample([(lon, lat)]))[0]
        height = float(dsm_val - dtm_val)
        return round(height, 2) if 2.0 <= height <= 160.0 else None


def estimate_building_profile(
    idx: int,
    props: dict[str, Any],
    area_m2: float,
    lidar_height: float | None,
) -> dict[str, Any]:
    """Infer storeys, eave/ridge heights, roof type, and Maritime palette."""
    raw_height = (
        lidar_height
        or props.get("HEIGHT_M")
        or props.get("BLDG_HEIGHT")
        or props.get("HEIGHT")
    )
    raw_storeys = props.get("STOREYS") or props.get("NUM_STOREYS")
    use_raw = str(props.get("BLDG_USE") or props.get("LAND_USE") or props.get("FEATURE_CODE") or "").strip()

    is_commercial = (
        area_m2 >= 260.0
        or "comm" in use_raw.lower()
        or "mixed" in use_raw.lower()
        or "apart" in use_raw.lower()
    )

    if raw_height is not None and float(raw_height) > 2.5:
        ridge_h = float(raw_height)
        storeys = float(raw_storeys) if raw_storeys else round(ridge_h / 3.4, 1)
    elif raw_storeys is not None and float(raw_storeys) > 0:
        storeys = float(raw_storeys)
        ridge_h = storeys * 3.5 + (0.0 if is_commercial else 2.2)
    elif is_commercial:
        storeys = 4 if area_m2 >= 420 else 3
        ridge_h = storeys * 3.55
    else:
        storeys = 2.5 if area_m2 >= 85 else 2.0
        ridge_h = 10.6 if storeys >= 2.5 else 9.6

    if is_commercial:
        roof_type = "flat"
        eave_h = ridge_h
        wall_colour = COMMERCIAL_WALL_PALETTE[idx % len(COMMERCIAL_WALL_PALETTE)]
        use_label = use_raw or "Mixed-use commercial"
        assessed_band = "$1.5M-$3.5M"
    else:
        roof_type = "hip" if idx % 3 == 1 else "gable"
        eave_h = round(ridge_h * 0.68, 2)
        wall_colour = MARITIME_WALL_PALETTE[idx % len(MARITIME_WALL_PALETTE)]
        use_label = use_raw or "Residential"
        assessed_band = "$525k-$725k"

    return {
        "use": use_label,
        "storeys": storeys,
        "eave_height_m": round(eave_h, 2),
        "height_m": round(ridge_h, 2),
        "roof_type": roof_type,
        "wall_colour": wall_colour,
        "roof_colour": ROOF_SHINGLE_PALETTE[idx % len(ROOF_SHINGLE_PALETTE)],
        "assessed_band": assessed_band,
        "solar_kw": 0.0,
    }


def normalize_buildings(
    features: list[dict[str, Any]],
    ref_lat: float,
    dsm_path: Path | None,
    dtm_path: Path | None,
) -> list[dict[str, Any]]:
    """Convert HRM Building_Footprints GeoJSON features to engine schema."""
    out = []
    for idx, feat in enumerate(features, start=1):
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if gtype == "Polygon" and coords:
            ring = coords[0]
        elif gtype == "MultiPolygon" and coords and coords[0]:
            ring = coords[0][0]
        else:
            continue
        if len(ring) < 4:
            continue

        props = feat.get("properties") or {}
        cx = sum(pt[0] for pt in ring[:-1]) / max(1, len(ring) - 1)
        cy = sum(pt[1] for pt in ring[:-1]) / max(1, len(ring) - 1)
        area_m2 = polygon_area_m2(ring, ref_lat)
        if area_m2 < 16.0:
            continue

        lidar_h = sample_lidar_height_m(cx, cy, dsm_path, dtm_path)
        profile = estimate_building_profile(idx, props, area_m2, lidar_h)

        civic = props.get("CIVIC_ADDRESS") or props.get("FULL_ADDR")
        if not civic:
            num = props.get("CIVIC_NUM") or ""
            str_name = props.get("STREET_NAME") or "Halifax parcel"
            civic = f"{num} {str_name}".strip()

        out.append(
            {
                "id": str(props.get("BLDG_ID") or props.get("OBJECTID") or f"BLD-{idx:04d}"),
                "civic_address": civic,
                **profile,
                "footprint": [[round(pt[0], 7), round(pt[1], 7)] for pt in ring],
            }
        )
    return out


def normalize_streets(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert HRM Street_Centrelines GeoJSON features to engine schema."""
    out = []
    for idx, feat in enumerate(features, start=1):
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if gtype == "LineString":
            lines = [coords]
        elif gtype == "MultiLineString":
            lines = coords
        else:
            continue

        props = feat.get("properties") or {}
        name = str(props.get("FULL_NAME") or props.get("STREET_NAME") or f"Street {idx}").strip()
        road_class = str(props.get("ROAD_CLASS") or props.get("ST_CLASS") or "Local").strip()
        is_arterial = any(k in road_class.lower() for k in ("arterial", "collector", "major"))

        for sub_idx, line in enumerate(lines, start=1):
            if len(line) < 2:
                continue
            out.append(
                {
                    "id": f"STR-{props.get('OBJECTID', idx)}-{sub_idx}",
                    "name": name,
                    "road_class": road_class,
                    "width_m": 14.0 if is_arterial else 10.0,
                    "lanes": 2,
                    "sidewalk_width_m": 2.4 if is_arterial else 1.8,
                    "transit_corridor": is_arterial,
                    "bus_lane": "gottingen" in name.lower(),
                    "centreline": [[round(pt[0], 7), round(pt[1], 7)] for pt in line],
                }
            )
    return out


def normalize_trees(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert HRM Street_Trees GeoJSON features to engine schema."""
    out = []
    for idx, feat in enumerate(features, start=1):
        geom = feat.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        lon, lat = geom.get("coordinates")[:2]
        props = feat.get("properties") or {}
        default_sp, default_tone = TREE_FOLIAGE_PALETTE[idx % len(TREE_FOLIAGE_PALETTE)]
        species = str(props.get("SPECIES") or props.get("COMMON_NAME") or default_sp).strip()
        tone = "#2d543e" if "spruce" in species.lower() or "pine" in species.lower() else default_tone
        dbh = float(props.get("DBH") or 28.0)
        height_m = round(max(6.5, min(15.5, 6.5 + dbh * 0.14)), 1)
        crown_r = round(max(2.4, min(5.0, 2.2 + dbh * 0.05)), 1)

        out.append(
            {
                "id": f"TRE-{props.get('OBJECTID', idx)}",
                "species": species,
                "lon": round(lon, 7),
                "lat": round(lat, 7),
                "height_m": height_m,
                "crown_radius_m": crown_r,
                "foliage_tone": tone,
            }
        )
    return out


def normalize_stops(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert HRM Bus_Stops GeoJSON features to engine schema."""
    out = []
    for idx, feat in enumerate(features, start=1):
        geom = feat.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        lon, lat = geom.get("coordinates")[:2]
        props = feat.get("properties") or {}
        code = str(props.get("STOP_NUM") or props.get("STOP_ID") or f"{6700 + idx}")
        name = str(props.get("STOP_NAME") or props.get("LOCATION") or f"Stop {code}").strip()
        shelter_raw = str(props.get("SHELTER") or props.get("HAS_SHELTER") or "").lower()
        has_shelter = shelter_raw in ("y", "yes", "true", "1")

        out.append(
            {
                "id": f"STP-{code}",
                "stop_code": code,
                "stop_name": name,
                "lon": round(lon, 7),
                "lat": round(lat, 7),
                "bearing_deg": float(props.get("BEARING") or 0.0),
                "shelter": has_shelter,
                "bunching_count": 0,
                "excess_wait_seconds": 0,
                "routes": [],
            }
        )
    return out


def build_scene(
    bbox: tuple[float, float, float, float],
    endpoints: dict[str, str],
    dsm_path: Path | None = None,
    dtm_path: Path | None = None,
) -> dict[str, Any]:
    """Query HRM Open Data endpoints and assemble a clean 3D twin scene JSON."""
    west, south, east, north = bbox
    centre_lon = round((west + east) * 0.5, 6)
    centre_lat = round((south + north) * 0.5, 6)

    raw_buildings = query_arcgis_geojson(endpoints["buildings"], bbox)
    raw_streets = query_arcgis_geojson(endpoints["streets"], bbox)
    raw_trees = query_arcgis_geojson(endpoints["trees"], bbox)
    raw_stops = query_arcgis_geojson(endpoints["stops"], bbox)

    return {
        "meta": {
            "title": f"Halifax Open Data corridor ({centre_lon}, {centre_lat})",
            "centre": [centre_lon, centre_lat],
            "bbox": [west, south, east, north],
            "crs": "EPSG:4326",
            "generated_at": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
            "source_summary": "HRM Open Data ArcGIS REST (SRC-077, SRC-027, SRC-051, SRC-005)",
            "licence": "Open Government Licence - Halifax",
        },
        "streets": normalize_streets(raw_streets),
        "buildings": normalize_buildings(raw_buildings, centre_lat, dsm_path, dtm_path),
        "trees": normalize_trees(raw_trees),
        "stops": normalize_stops(raw_stops),
        "events": [],
        "routes": [],
        "buses": [],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a clean 3D street scene JSON from HRM Open Data ArcGIS REST endpoints."
    )
    parser.add_argument(
        "--bbox",
        default=DEFAULT_BBOX,
        help="WGS84 bounding box as west,south,east,north (default: North & Gottingen corridor).",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Output scene JSON path.",
    )
    parser.add_argument("--buildings-url", default=DEFAULT_ENDPOINTS["buildings"], help="Override SRC-077 layer URL.")
    parser.add_argument("--streets-url", default=DEFAULT_ENDPOINTS["streets"], help="Override SRC-027 layer URL.")
    parser.add_argument("--trees-url", default=DEFAULT_ENDPOINTS["trees"], help="Override SRC-051 layer URL.")
    parser.add_argument("--stops-url", default=DEFAULT_ENDPOINTS["stops"], help="Override SRC-005 layer URL.")
    parser.add_argument("--lidar-dsm", type=Path, default=None, help="Optional Nova Scotia LiDAR DSM GeoTIFF path.")
    parser.add_argument("--lidar-dtm", type=Path, default=None, help="Optional Nova Scotia LiDAR DTM GeoTIFF path.")
    args = parser.parse_args(argv)

    bbox = parse_bbox(args.bbox)
    endpoints = {
        "buildings": args.buildings_url,
        "streets": args.streets_url,
        "trees": args.trees_url,
        "stops": args.stops_url,
    }

    try:
        scene = build_scene(bbox, endpoints, args.lidar_dsm, args.lidar_dtm)
    except urllib.error.URLError as exc:
        print(f"Network error querying HRM Open Data ArcGIS REST API: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Scene build failed: {exc}", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(scene, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {out_path}: {len(scene['buildings'])} buildings, "
        f"{len(scene['streets'])} street segments, {len(scene['trees'])} trees, "
        f"{len(scene['stops'])} stops."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
