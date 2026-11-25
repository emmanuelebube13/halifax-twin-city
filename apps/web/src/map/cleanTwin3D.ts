// Terrain-conforming procedural 3D close-up twin for Halifax.
// Ports the standalone street-level prototype into CesiumJS primitives that sit on
// real Halifax elevation across every neighbourhood cell, loading HRM Open Data
// ArcGIS REST layers on demand with an instant local fallback for North and Gottingen.

import type * as CesiumNS from "cesium";
import type { Feature } from "../api/types";
import type { Orbit } from "../lib/camera";
import type { ProfileName } from "../lib/profileChoice";
import { COLOURS as PIN_COLOURS } from "./pins";

type Cesium = typeof CesiumNS;

export type StreetTwinMode = "auto" | "clean" | "photo";

export interface ElevationGrid {
  west: number;
  south: number;
  east: number;
  north: number;
  cols: number;
  rows: number;
  heights: number[];
}

export interface CleanBuilding {
  id: string;
  civic_address: string;
  use: string;
  storeys: number;
  eave_height_m: number;
  height_m: number;
  roof_type: "gable" | "hip" | "flat";
  wall_colour: string;
  roof_colour: string;
  assessed_band: string;
  solar_kw: number;
  footprint: [number, number][];
}

export interface CleanStreet {
  id: string;
  name: string;
  road_class: string;
  width_m: number;
  lanes: number;
  sidewalk_width_m: number;
  transit_corridor: boolean;
  bus_lane: boolean;
  centreline: [number, number][];
}

export interface CleanTree {
  id: string;
  species: string;
  lon: number;
  lat: number;
  height_m: number;
  crown_radius_m: number;
  foliage_tone: string;
}

export interface CleanStop {
  id: string;
  stop_code: string;
  stop_name: string;
  lon: number;
  lat: number;
  bearing_deg: number;
  shelter: boolean;
  bunching_count: number;
  excess_wait_seconds: number;
  routes: string[];
}

export interface CleanScene {
  meta: {
    title: string;
    centre: [number, number];
    bbox?: [number, number, number, number];
  };
  streets: CleanStreet[];
  buildings: CleanBuilding[];
  trees: CleanTree[];
  stops: CleanStop[];
}

export interface CellDescriptor {
  key: string;
  bbox: [number, number, number, number];
  centre: [number, number];
}

export interface CleanTwinOptions {
  noIon?: boolean;
  getTileset?: () => CesiumNS.Cesium3DTileset | null;
  getExcludeObjects?: () => object[];
  onActiveChange?: (active: boolean) => void;
}

export interface CleanTwinController {
  syncCamera: (orbit: Orbit | null, mode: StreetTwinMode, profileName: ProfileName, noIon: boolean) => void;
  setRoutes: (routes: Feature[], highlightRoute: string | null) => void;
  isActive: () => boolean;
  groundHeightAt: (lon: number, lat: number) => number | null;
  destroy: () => void;
}

const CELL_DLON = 0.008;
const CELL_DLAT = 0.006;
const SAMPLE_BBOX: [number, number, number, number] = [-63.5955, 44.6575, -63.588, 44.6635];
const MAX_CACHE_CELLS = 12;
const FETCH_TIMEOUT_MS = 8000;
const FALLBACK_HEIGHT_M = -18;

const HRM_ARC_BASE = "https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services";
const ARCGIS_ENDPOINTS = {
  buildings: `${HRM_ARC_BASE}/Building_Footprints/FeatureServer/0/query`,
  streets: `${HRM_ARC_BASE}/Street_Centrelines/FeatureServer/0/query`,
  trees: `${HRM_ARC_BASE}/Street_Trees/FeatureServer/0/query`,
  stops: `${HRM_ARC_BASE}/Bus_Stops/FeatureServer/0/query`,
};

const MARITIME_WALL_PALETTE = [
  "#efe9dc", // warm cream clapboard
  "#9fb09e", // heritage sage
  "#6d8496", // slate blue
  "#a85c47", // brick terracotta
  "#d8b780", // warm ochre
  "#c9c2b2", // pale cedar
];

const COMMERCIAL_WALL_PALETTE = ["#9e5442", "#b37c5b", "#7a8288"];
const ROOF_SHINGLE_PALETTE = ["#2f363e", "#3d444d", "#473b36"];
const TREE_FOLIAGE_PALETTE: [string, string][] = [
  ["Red Oak", "#4f6b3a"],
  ["Sugar Maple", "#9e532b"],
  ["Norway Maple", "#c28434"],
  ["Atlantic Spruce", "#2d543e"],
  ["Littleleaf Linden", "#5a7641"],
];

const SCENE_COLOURS = {
  ink: "#13232e",
  harbour: "#0d5466",
  asphalt: "#384048",
  sidewalk: "#dbd8cf",
  grass: "#b4c6a3",
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round6 = (v: number): number => Math.round(v * 1_000_000) / 1_000_000;
const round7 = (v: number): number => Math.round(v * 10_000_000) / 10_000_000;

/** Decide whether the procedural street-level twin should be shown at this camera range. */
export function shouldShowCleanTwin(
  mode: StreetTwinMode,
  rangeMetres: number,
  currentlyActive: boolean,
): boolean {
  if (mode === "photo") return false;
  if (!Number.isFinite(rangeMetres)) return currentlyActive;
  if (mode === "clean") {
    return currentlyActive ? rangeMetres <= 1400 : rangeMetres <= 1250;
  }
  return currentlyActive ? rangeMetres <= 420 : rangeMetres <= 360;
}

/** Snap a WGS84 coordinate to a deterministic 0.008 deg x 0.006 deg neighbourhood cell. */
export function cellKeyFor(lon: number, lat: number): CellDescriptor {
  const ix = Math.floor(lon / CELL_DLON);
  const iy = Math.floor(lat / CELL_DLAT);
  const west = round6(ix * CELL_DLON);
  const south = round6(iy * CELL_DLAT);
  const east = round6((ix + 1) * CELL_DLON);
  const north = round6((iy + 1) * CELL_DLAT);
  const centre: [number, number] = [round6((west + east) * 0.5), round6((south + north) * 0.5)];
  return {
    key: `${ix}:${iy}`,
    bbox: [west, south, east, north],
    centre,
  };
}

/** Bilinearly interpolate ground ellipsoid height from an ElevationGrid. */
export function interpolateGridHeight(
  grid: ElevationGrid | null,
  lon: number,
  lat: number,
  fallback = FALLBACK_HEIGHT_M,
): number {
  if (!grid || grid.cols < 1 || grid.rows < 1 || grid.heights.length < grid.cols * grid.rows) {
    return fallback;
  }
  const lonSpan = grid.east - grid.west;
  const latSpan = grid.north - grid.south;
  const u = lonSpan > 0 ? clamp((lon - grid.west) / lonSpan, 0, 1) : 0;
  const v = latSpan > 0 ? clamp((lat - grid.south) / latSpan, 0, 1) : 0;

  const fx = u * Math.max(0, grid.cols - 1);
  const fy = v * Math.max(0, grid.rows - 1);
  const c0 = Math.floor(fx);
  const c1 = Math.min(grid.cols - 1, c0 + 1);
  const r0 = Math.floor(fy);
  const r1 = Math.min(grid.rows - 1, r0 + 1);
  const tx = fx - c0;
  const ty = fy - r0;

  const at = (r: number, c: number): number => {
    const val = grid.heights[r * grid.cols + c];
    return typeof val === "number" && Number.isFinite(val) ? val : fallback;
  };

  const h00 = at(r0, c0);
  const h10 = at(r0, c1);
  const h01 = at(r1, c0);
  const h11 = at(r1, c1);

  const h0 = h00 + (h10 - h00) * tx;
  const h1 = h01 + (h11 - h01) * tx;
  return h0 + (h1 - h0) * ty;
}

interface RawGeoJsonFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  properties?: Record<string, unknown> | null;
}

function polygonAreaM2(ring: number[][], refLat: number): number {
  if (ring.length < 3) return 0;
  const mLat = 111132.0;
  const mLon = 111320.0 * Math.cos(rad(refLat));
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    const x0 = p0[0] * mLon;
    const y0 = p0[1] * mLat;
    const x1 = p1[0] * mLon;
    const y1 = p1[1] * mLat;
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area) * 0.5;
}

function asNonEmptyNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** Normalize HRM Building_Footprints GeoJSON features into procedural building definitions. */
export function normalizeArcgisBuildings(features: unknown[], refLat: number): CleanBuilding[] {
  const out: CleanBuilding[] = [];
  let idx = 0;
  for (const raw of features) {
    idx++;
    const feat = raw as RawGeoJsonFeature | null | undefined;
    const geom = feat?.geometry;
    if (!geom) continue;
    const gtype = geom.type;
    const coords = geom.coordinates;
    let ring: number[][] | undefined;
    if (gtype === "Polygon" && Array.isArray(coords) && Array.isArray(coords[0])) {
      ring = coords[0] as number[][];
    } else if (
      gtype === "MultiPolygon" &&
      Array.isArray(coords) &&
      Array.isArray(coords[0]) &&
      Array.isArray((coords[0] as unknown[])[0])
    ) {
      ring = (coords[0] as number[][][])[0];
    } else {
      continue;
    }
    if (!ring || ring.length < 4) continue;

    const areaM2 = polygonAreaM2(ring, refLat);
    if (areaM2 < 16.0) continue;

    const props = feat?.properties ?? {};
    const rawHeight = asNonEmptyNumber(props.HEIGHT_M ?? props.BLDG_HEIGHT ?? props.HEIGHT);
    const rawStoreys = asNonEmptyNumber(props.STOREYS ?? props.NUM_STOREYS);
    const useRaw = String(props.BLDG_USE ?? props.LAND_USE ?? props.FEATURE_CODE ?? "").trim();
    const useLower = useRaw.toLowerCase();
    const isCommercial =
      areaM2 >= 260.0 ||
      useLower.includes("comm") ||
      useLower.includes("mixed") ||
      useLower.includes("apart");

    let ridgeH: number;
    let storeys: number;
    if (rawHeight !== null && rawHeight > 2.5) {
      ridgeH = rawHeight;
      storeys = rawStoreys !== null && rawStoreys > 0 ? rawStoreys : round1(ridgeH / 3.4);
    } else if (rawStoreys !== null && rawStoreys > 0) {
      storeys = rawStoreys;
      ridgeH = storeys * 3.5 + (isCommercial ? 0.0 : 2.2);
    } else if (isCommercial) {
      storeys = areaM2 >= 420 ? 4 : 3;
      ridgeH = storeys * 3.55;
    } else {
      storeys = areaM2 >= 85 ? 2.5 : 2.0;
      ridgeH = storeys >= 2.5 ? 10.6 : 9.6;
    }

    let roofType: "gable" | "hip" | "flat";
    let eaveH: number;
    let wallColour: string;
    let useLabel: string;
    let assessedBand: string;
    if (isCommercial) {
      roofType = "flat";
      eaveH = ridgeH;
      wallColour = COMMERCIAL_WALL_PALETTE[idx % COMMERCIAL_WALL_PALETTE.length];
      useLabel = useRaw || "Mixed-use commercial";
      assessedBand = "$1.5M-$3.5M";
    } else {
      roofType = idx % 3 === 1 ? "hip" : "gable";
      eaveH = round2(ridgeH * 0.68);
      wallColour = MARITIME_WALL_PALETTE[idx % MARITIME_WALL_PALETTE.length];
      useLabel = useRaw || "Residential";
      assessedBand = "$525k-$725k";
    }

    let civic = String(props.CIVIC_ADDRESS ?? props.FULL_ADDR ?? "").trim();
    if (!civic) {
      const num = String(props.CIVIC_NUM ?? "").trim();
      const strName = String(props.STREET_NAME ?? "Halifax parcel").trim();
      civic = `${num} ${strName}`.trim();
    }

    const id = String(props.BLDG_ID || props.OBJECTID || `BLD-${String(idx).padStart(4, "0")}`);
    out.push({
      id,
      civic_address: civic,
      use: useLabel,
      storeys,
      eave_height_m: round2(eaveH),
      height_m: round2(ridgeH),
      roof_type: roofType,
      wall_colour: wallColour,
      roof_colour: ROOF_SHINGLE_PALETTE[idx % ROOF_SHINGLE_PALETTE.length],
      assessed_band: assessedBand,
      solar_kw: 0,
      footprint: ring.map((pt) => [round7(pt[0]), round7(pt[1])]),
    });
  }
  return out;
}

/** Normalize HRM Street_Centrelines GeoJSON features into street corridor definitions. */
export function normalizeArcgisStreets(features: unknown[]): CleanStreet[] {
  const out: CleanStreet[] = [];
  let idx = 0;
  for (const raw of features) {
    idx++;
    const feat = raw as RawGeoJsonFeature | null | undefined;
    const geom = feat?.geometry;
    if (!geom) continue;
    const gtype = geom.type;
    const coords = geom.coordinates;
    let lines: number[][][];
    if (gtype === "LineString" && Array.isArray(coords)) {
      lines = [coords as number[][]];
    } else if (gtype === "MultiLineString" && Array.isArray(coords)) {
      lines = coords as number[][][];
    } else {
      continue;
    }

    const props = feat?.properties ?? {};
    const name = String(props.FULL_NAME || props.STREET_NAME || `Street ${idx}`).trim();
    const roadClass = String(props.ROAD_CLASS || props.ST_CLASS || "Local").trim();
    const rcLower = roadClass.toLowerCase();
    const isArterial =
      rcLower.includes("arterial") || rcLower.includes("collector") || rcLower.includes("major");

    for (let sIdx = 0; sIdx < lines.length; sIdx++) {
      const line = lines[sIdx];
      if (!Array.isArray(line) || line.length < 2) continue;
      out.push({
        id: `STR-${String(props.OBJECTID ?? idx)}-${sIdx + 1}`,
        name,
        road_class: roadClass,
        width_m: isArterial ? 14.0 : 10.0,
        lanes: 2,
        sidewalk_width_m: isArterial ? 2.4 : 1.8,
        transit_corridor: isArterial,
        bus_lane: name.toLowerCase().includes("gottingen"),
        centreline: line.map((pt) => [round7(pt[0]), round7(pt[1])]),
      });
    }
  }
  return out;
}

/** Normalize HRM Street_Trees GeoJSON features into 3D urban forestry items. */
export function normalizeArcgisTrees(features: unknown[]): CleanTree[] {
  const out: CleanTree[] = [];
  let idx = 0;
  for (const raw of features) {
    idx++;
    const feat = raw as RawGeoJsonFeature | null | undefined;
    const geom = feat?.geometry;
    if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      continue;
    }
    const lon = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const props = feat?.properties ?? {};
    const [defaultSp, defaultTone] = TREE_FOLIAGE_PALETTE[idx % TREE_FOLIAGE_PALETTE.length];
    const species = String(props.SPECIES || props.COMMON_NAME || defaultSp).trim();
    const spLower = species.toLowerCase();
    const tone = spLower.includes("spruce") || spLower.includes("pine") ? "#2d543e" : defaultTone;
    const dbhRaw = asNonEmptyNumber(props.DBH);
    const dbh = dbhRaw !== null && dbhRaw > 0 ? dbhRaw : 28.0;
    const heightM = round1(clamp(6.5 + dbh * 0.14, 6.5, 15.5));
    const crownR = round1(clamp(2.2 + dbh * 0.05, 2.4, 5.0));

    out.push({
      id: `TRE-${String(props.OBJECTID ?? idx)}`,
      species,
      lon: round7(lon),
      lat: round7(lat),
      height_m: heightM,
      crown_radius_m: crownR,
      foliage_tone: tone,
    });
  }
  return out;
}

/** Normalize HRM Bus_Stops GeoJSON features into boarding pad and shelter definitions. */
export function normalizeArcgisStops(features: unknown[]): CleanStop[] {
  const out: CleanStop[] = [];
  let idx = 0;
  for (const raw of features) {
    idx++;
    const feat = raw as RawGeoJsonFeature | null | undefined;
    const geom = feat?.geometry;
    if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      continue;
    }
    const lon = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const props = feat?.properties ?? {};
    const code = String(props.STOP_NUM || props.STOP_ID || 6700 + idx);
    const name = String(props.STOP_NAME || props.LOCATION || `Stop ${code}`).trim();
    const shelterRaw = String(props.SHELTER ?? props.HAS_SHELTER ?? "").toLowerCase();
    const hasShelter =
      shelterRaw === "y" || shelterRaw === "yes" || shelterRaw === "true" || shelterRaw === "1";

    out.push({
      id: `STP-${code}`,
      stop_code: code,
      stop_name: name,
      lon: round7(lon),
      lat: round7(lat),
      bearing_deg: asNonEmptyNumber(props.BEARING) ?? 0.0,
      shelter: hasShelter,
      bunching_count: 0,
      excess_wait_seconds: 0,
      routes: [],
    });
  }
  return out;
}

// ---------- Cell LRU Cache & Data Fetchers ----------

const cellCache = new Map<string, CleanScene>();
const inFlightCells = new Map<string, Promise<CleanScene | null>>();

function getCachedCell(key: string): CleanScene | undefined {
  const hit = cellCache.get(key);
  if (!hit) return undefined;
  cellCache.delete(key);
  cellCache.set(key, hit);
  return hit;
}

function setCachedCell(key: string, scene: CleanScene): void {
  if (cellCache.has(key)) cellCache.delete(key);
  cellCache.set(key, scene);
  while (cellCache.size > MAX_CACHE_CELLS) {
    const oldest = cellCache.keys().next().value;
    if (oldest !== undefined) cellCache.delete(oldest);
    else break;
  }
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSampleCorridorScene(): Promise<CleanScene | null> {
  const base = import.meta.env?.BASE_URL ?? "/";
  const url = `${base}twin-preview/sample-north-gottingen.json`;
  const raw = await fetchJsonWithTimeout<Partial<CleanScene>>(url, FETCH_TIMEOUT_MS);
  if (!raw || !Array.isArray(raw.buildings) || !Array.isArray(raw.streets)) return null;
  return {
    meta: {
      title: raw.meta?.title ?? "North Street and Gottingen Street corridor",
      centre: raw.meta?.centre ?? [-63.5918, 44.6606],
      bbox: raw.meta?.bbox ?? SAMPLE_BBOX,
    },
    streets: raw.streets,
    buildings: raw.buildings,
    trees: Array.isArray(raw.trees) ? raw.trees : [],
    stops: Array.isArray(raw.stops) ? raw.stops : [],
  };
}

function arcgisQueryUrl(endpoint: string, bbox: [number, number, number, number]): string {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: bbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "1000",
  });
  return `${endpoint}?${params.toString()}`;
}

interface GeoJsonCollection {
  features?: unknown[];
  error?: unknown;
}

async function fetchArcgisCellScene(cell: CellDescriptor): Promise<CleanScene | null> {
  const [bRaw, sRaw, tRaw, stRaw] = await Promise.all([
    fetchJsonWithTimeout<GeoJsonCollection>(arcgisQueryUrl(ARCGIS_ENDPOINTS.buildings, cell.bbox), FETCH_TIMEOUT_MS),
    fetchJsonWithTimeout<GeoJsonCollection>(arcgisQueryUrl(ARCGIS_ENDPOINTS.streets, cell.bbox), FETCH_TIMEOUT_MS),
    fetchJsonWithTimeout<GeoJsonCollection>(arcgisQueryUrl(ARCGIS_ENDPOINTS.trees, cell.bbox), FETCH_TIMEOUT_MS),
    fetchJsonWithTimeout<GeoJsonCollection>(arcgisQueryUrl(ARCGIS_ENDPOINTS.stops, cell.bbox), FETCH_TIMEOUT_MS),
  ]);

  const bFeats = bRaw && !bRaw.error && Array.isArray(bRaw.features) ? bRaw.features : [];
  const sFeats = sRaw && !sRaw.error && Array.isArray(sRaw.features) ? sRaw.features : [];
  const tFeats = tRaw && !tRaw.error && Array.isArray(tRaw.features) ? tRaw.features : [];
  const stFeats = stRaw && !stRaw.error && Array.isArray(stRaw.features) ? stRaw.features : [];

  const buildings = normalizeArcgisBuildings(bFeats, cell.centre[1]);
  const streets = normalizeArcgisStreets(sFeats);
  if (buildings.length === 0 && streets.length === 0) return null;

  return {
    meta: {
      title: `Halifax neighbourhood (${cell.centre[0]}, ${cell.centre[1]})`,
      centre: cell.centre,
      bbox: cell.bbox,
    },
    streets,
    buildings,
    trees: normalizeArcgisTrees(tFeats),
    stops: normalizeArcgisStops(stFeats),
  };
}

/**
 * Load a neighbourhood cell scene from the LRU cache, local North & Gottingen sample,
 * or HRM's Open Data ArcGIS REST API. Resolves null quietly when offline with no local sample.
 */
export async function fetchCellScene(cell: CellDescriptor): Promise<CleanScene | null> {
  const cached = getCachedCell(cell.key);
  if (cached) return cached;

  const existing = inFlightCells.get(cell.key);
  if (existing) return existing;

  const task = (async (): Promise<CleanScene | null> => {
    const arcgisScene = await fetchArcgisCellScene(cell);
    if (arcgisScene) {
      setCachedCell(cell.key, arcgisScene);
      return arcgisScene;
    }
    if (bboxesOverlap(cell.bbox, SAMPLE_BBOX)) {
      const sampleScene = await fetchSampleCorridorScene();
      if (sampleScene) {
        setCachedCell(cell.key, sampleScene);
        return sampleScene;
      }
    }
    return null;
  })().finally(() => {
    inFlightCells.delete(cell.key);
  });

  inFlightCells.set(cell.key, task);
  return task;
}

// ---------- ENU Projector & Terrain-Conforming Mesh Builder ----------

interface EnuProjector {
  toEnu: (lon: number, lat: number) => { x: number; y: number };
  toCartesian: (x: number, y: number, localZ: number) => CesiumNS.Cartesian3;
  toCartographicDegrees: (x: number, y: number) => [number, number];
  vectorEnuToEcef: (vx: number, vy: number, vz: number) => CesiumNS.Cartesian3;
}

function createTerrainEnuProjector(
  C: Cesium,
  centreLon: number,
  centreLat: number,
  grid: ElevationGrid,
): EnuProjector {
  const origin = C.Cartesian3.fromDegrees(centreLon, centreLat, 0);
  const enuToEcef = C.Transforms.eastNorthUpToFixedFrame(origin);
  const ecefToEnu = C.Matrix4.inverse(enuToEcef, new C.Matrix4());
  const scratchPt = new C.Cartesian3();
  const scratchEcef = new C.Cartesian3();
  const scratchCarto = new C.Cartographic();

  function toEnu(lon: number, lat: number): { x: number; y: number } {
    const c = C.Cartesian3.fromDegrees(lon, lat, 0);
    const local = C.Matrix4.multiplyByPoint(ecefToEnu, c, new C.Cartesian3());
    return { x: local.x, y: local.y };
  }

  function toCartesian(x: number, y: number, localZ: number): CesiumNS.Cartesian3 {
    scratchPt.x = x;
    scratchPt.y = y;
    scratchPt.z = 0;
    const ecef = C.Matrix4.multiplyByPoint(enuToEcef, scratchPt, scratchEcef);
    const carto = C.Cartographic.fromCartesian(ecef, C.Ellipsoid.WGS84, scratchCarto);
    const lon = deg(carto.longitude);
    const lat = deg(carto.latitude);
    const groundZ = interpolateGridHeight(grid, lon, lat);
    return C.Cartesian3.fromRadians(carto.longitude, carto.latitude, groundZ + localZ);
  }

  function toCartographicDegrees(x: number, y: number): [number, number] {
    scratchPt.x = x;
    scratchPt.y = y;
    scratchPt.z = 0;
    const ecef = C.Matrix4.multiplyByPoint(enuToEcef, scratchPt, scratchEcef);
    const carto = C.Cartographic.fromCartesian(ecef, C.Ellipsoid.WGS84, scratchCarto);
    return [deg(carto.longitude), deg(carto.latitude)];
  }

  function vectorEnuToEcef(vx: number, vy: number, vz: number): CesiumNS.Cartesian3 {
    const dir = C.Matrix4.multiplyByPointAsVector(
      enuToEcef,
      new C.Cartesian3(vx, vy, vz),
      new C.Cartesian3(),
    );
    return C.Cartesian3.normalize(dir, dir);
  }

  return { toEnu, toCartesian, toCartographicDegrees, vectorEnuToEcef };
}

class MeshBuilder {
  private readonly C: Cesium;
  private readonly projector: EnuProjector;
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly sts: number[] = [];
  private readonly indices: number[] = [];

  constructor(C: Cesium, projector: EnuProjector) {
    this.C = C;
    this.projector = projector;
  }

  private pushVertex(p: [number, number, number], n: [number, number, number], u: number, v: number): number {
    const idx = this.positions.length / 3;
    const c = this.projector.toCartesian(p[0], p[1], p[2]);
    const nWorld = this.projector.vectorEnuToEcef(n[0], n[1], n[2]);
    this.positions.push(c.x, c.y, c.z);
    this.normals.push(nWorld.x, nWorld.y, nWorld.z);
    this.sts.push(u, v);
    return idx;
  }

  addTriangle(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    outwardHint: [number, number, number] | null,
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
  ): void {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    nx /= len;
    ny /= len;
    nz /= len;

    let flip = false;
    if (outwardHint) {
      const dot = nx * outwardHint[0] + ny * outwardHint[1] + nz * outwardHint[2];
      if (dot < 0) {
        flip = true;
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }

    const n: [number, number, number] = [nx, ny, nz];
    const i0 = this.pushVertex(p0, n, uv0[0], uv0[1]);
    if (flip) {
      const i2 = this.pushVertex(p2, n, uv2[0], uv2[1]);
      const i1 = this.pushVertex(p1, n, uv1[0], uv1[1]);
      this.indices.push(i0, i2, i1);
    } else {
      const i1 = this.pushVertex(p1, n, uv1[0], uv1[1]);
      const i2 = this.pushVertex(p2, n, uv2[0], uv2[1]);
      this.indices.push(i0, i1, i2);
    }
  }

  addQuad(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    outwardHint: [number, number, number] | null,
    u0 = 0,
    u1 = 1,
    v0 = 0,
    v1 = 1,
  ): void {
    this.addTriangle(p0, p1, p2, outwardHint, [u0, v0], [u1, v0], [u1, v1]);
    this.addTriangle(p0, p2, p3, outwardHint, [u0, v0], [u1, v1], [u0, v1]);
  }

  toGeometry(): CesiumNS.Geometry | null {
    if (this.indices.length === 0) return null;
    const posArr = new Float64Array(this.positions);
    const normArr = new Float32Array(this.normals);
    const stArr = new Float32Array(this.sts);
    const idxArr =
      this.positions.length / 3 > 65535
        ? new Uint32Array(this.indices)
        : new Uint16Array(this.indices);

    return new this.C.Geometry({
      attributes: {
        position: new this.C.GeometryAttribute({
          componentDatatype: this.C.ComponentDatatype.DOUBLE,
          componentsPerAttribute: 3,
          values: posArr,
        }),
        normal: new this.C.GeometryAttribute({
          componentDatatype: this.C.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: normArr,
        }),
        st: new this.C.GeometryAttribute({
          componentDatatype: this.C.ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: stArr,
        }),
      } as unknown as CesiumNS.GeometryAttributes,
      indices: idxArr,
      primitiveType: this.C.PrimitiveType.TRIANGLES,
      boundingSphere: this.C.BoundingSphere.fromVertices(this.positions),
    });
  }
}

// ---------- Procedural Canvas Texture Library ----------

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function shadeHex(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(r + delta, 0, 255)}, ${clamp(g + delta, 0, 255)}, ${clamp(b + delta, 0, 255)})`;
}

interface TextureLibrary {
  grass: () => HTMLCanvasElement;
  asphalt: () => HTMLCanvasElement;
  sidewalk: () => HTMLCanvasElement;
  busLane: () => HTMLCanvasElement;
  crosswalk: () => HTMLCanvasElement;
  yellowLine: () => HTMLCanvasElement;
  residentialWall: (hex: string) => HTMLCanvasElement;
  commercialWall: (hex: string) => HTMLCanvasElement;
  shingleRoof: (hex: string) => HTMLCanvasElement;
  flatRoof: () => HTMLCanvasElement;
  solarPanel: () => HTMLCanvasElement;
}

const sharedTextureCache = new Map<string, HTMLCanvasElement>();

function getSharedTextures(): TextureLibrary {
  const getOrCreate = (key: string, fn: () => HTMLCanvasElement): HTMLCanvasElement => {
    const existing = sharedTextureCache.get(key);
    if (existing) return existing;
    const created = fn();
    sharedTextureCache.set(key, created);
    return created;
  };

  return {
    grass: () =>
      getOrCreate("grass", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = SCENE_COLOURS.grass;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1800; i++) {
          const x = (i * 73) % 256;
          const y = (i * 137) % 256;
          g.fillStyle = i % 3 === 0 ? "rgba(86, 114, 68, 0.14)" : "rgba(220, 232, 198, 0.14)";
          g.fillRect(x, y, 2, 2);
        }
        return c;
      }),
    asphalt: () =>
      getOrCreate("asphalt", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = SCENE_COLOURS.asphalt;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 2400; i++) {
          const x = (i * 53) % 256;
          const y = (i * 97) % 256;
          g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(10,14,18,0.08)";
          g.fillRect(x, y, 2, 2);
        }
        return c;
      }),
    sidewalk: () =>
      getOrCreate("sidewalk", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = SCENE_COLOURS.sidewalk;
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = i % 2 === 0 ? "rgba(19,35,46,0.035)" : "rgba(255,255,255,0.08)";
          g.fillRect((i * 89) % 256, (i * 41) % 256, 2, 2);
        }
        g.strokeStyle = "rgba(108, 112, 106, 0.38)";
        g.lineWidth = 2;
        for (let x = 0; x < 256; x += 64) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 256);
          g.stroke();
        }
        g.strokeStyle = "rgba(120, 124, 118, 0.25)";
        g.beginPath();
        g.moveTo(0, 8);
        g.lineTo(256, 8);
        g.stroke();
        return c;
      }),
    busLane: () =>
      getOrCreate("bus-lane", () => {
        const [c, g] = makeCanvas(256, 512);
        g.fillStyle = "#124c5c";
        g.fillRect(0, 0, 256, 512);
        for (let i = 0; i < 1200; i++) {
          g.fillStyle = "rgba(255,255,255,0.03)";
          g.fillRect((i * 61) % 256, (i * 113) % 512, 2, 2);
        }
        g.fillStyle = "rgba(244, 243, 238, 0.9)";
        g.fillRect(8, 0, 8, 512);
        g.fillRect(240, 0, 8, 512);
        g.strokeStyle = "#f4f3ee";
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(128, 72);
        g.lineTo(170, 148);
        g.lineTo(128, 224);
        g.lineTo(86, 148);
        g.closePath();
        g.stroke();
        g.fillStyle = "#f4f3ee";
        g.font = "700 44px 'IBM Plex Sans', system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("BUS", 128, 330);
        g.fillText("ONLY", 128, 392);
        return c;
      }),
    crosswalk: () =>
      getOrCreate("crosswalk", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = SCENE_COLOURS.asphalt;
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "#f4f4ef";
        for (let x = 16; x < 248; x += 48) {
          g.fillRect(x, 12, 26, 232);
        }
        return c;
      }),
    yellowLine: () =>
      getOrCreate("yellow-line", () => {
        const [c, g] = makeCanvas(64, 128);
        g.fillStyle = SCENE_COLOURS.asphalt;
        g.fillRect(0, 0, 64, 128);
        g.fillStyle = "#e3b23c";
        g.fillRect(18, 0, 10, 128);
        g.fillRect(36, 0, 10, 128);
        return c;
      }),
    residentialWall: (hex: string) =>
      getOrCreate(`res-wall-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);

        const courses = 22;
        const ch = 256 / courses;
        for (let i = 0; i < courses; i++) {
          const y = i * ch;
          g.fillStyle = i % 2 === 0 ? shadeHex(hex, 6) : shadeHex(hex, -4);
          g.fillRect(0, y, 256, ch - 1.5);
          g.fillStyle = "rgba(19, 35, 46, 0.16)";
          g.fillRect(0, y + ch - 1.5, 256, 1.5);
        }

        g.fillStyle = "#6c7175";
        g.fillRect(0, 234, 256, 22);
        g.fillStyle = "rgba(19, 35, 46, 0.25)";
        g.fillRect(0, 234, 256, 2);

        const drawWindow = (wx: number, wy: number, ww: number, wh: number, warm: boolean) => {
          g.fillStyle = "#f3f1ea";
          g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
          g.fillStyle = "#dedbd2";
          g.fillRect(wx - 6, wy + wh + 2, ww + 12, 5);
          const grad = g.createLinearGradient(wx, wy, wx, wy + wh);
          grad.addColorStop(0, "#243b4a");
          grad.addColorStop(0.65, "#335163");
          grad.addColorStop(1, warm ? "#7f6842" : "#446578");
          g.fillStyle = grad;
          g.fillRect(wx, wy, ww, wh);
          g.fillStyle = "#eae6dc";
          g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          g.fillRect(wx, wy + wh * 0.48, ww, 2);
          g.fillStyle = "rgba(255, 255, 255, 0.16)";
          g.beginPath();
          g.moveTo(wx + 2, wy + 2);
          g.lineTo(wx + ww * 0.45, wy + 2);
          g.lineTo(wx + 2, wy + wh * 0.55);
          g.closePath();
          g.fill();
        };

        drawWindow(32, 34, 42, 60, false);
        drawWindow(107, 34, 42, 60, false);
        drawWindow(182, 34, 42, 60, false);
        drawWindow(32, 136, 42, 62, true);
        drawWindow(182, 136, 42, 62, true);

        g.fillStyle = "#f3f1ea";
        g.fillRect(104, 138, 48, 96);
        g.fillStyle = "#2b424d";
        g.fillRect(109, 143, 38, 91);
        g.fillStyle = "#d9c99e";
        g.fillRect(116, 151, 24, 24);
        g.fillStyle = "#f5b544";
        g.beginPath();
        g.arc(141, 192, 2.5, 0, Math.PI * 2);
        g.fill();

        g.fillStyle = "#f3f1ea";
        g.fillRect(0, 0, 7, 234);
        g.fillRect(249, 0, 7, 234);

        return c;
      }),
    commercialWall: (hex: string) =>
      getOrCreate(`com-wall-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);

        for (let y = 0; y < 184; y += 8) {
          g.fillStyle = (y / 8) % 2 === 0 ? shadeHex(hex, 5) : shadeHex(hex, -6);
          g.fillRect(0, y, 256, 7);
          g.fillStyle = "rgba(235, 228, 218, 0.14)";
          g.fillRect(0, y + 7, 256, 1);
        }

        const rows = [18, 72, 126];
        const cols = [20, 80, 140, 200];
        for (const wy of rows) {
          for (const wx of cols) {
            g.fillStyle = "#d9d4c9";
            g.fillRect(wx - 2, wy - 4, 40, 42);
            g.fillStyle = "#223846";
            g.fillRect(wx, wy, 36, 36);
            g.fillStyle = "rgba(180, 216, 232, 0.2)";
            g.fillRect(wx + 2, wy + 2, 14, 32);
            g.fillStyle = "#c9c3b6";
            g.fillRect(wx - 3, wy + 36, 42, 4);
          }
        }

        g.fillStyle = "#1c2d38";
        g.fillRect(0, 178, 256, 10);
        g.fillStyle = "#d9d4c9";
        g.fillRect(0, 174, 256, 4);

        g.fillStyle = "#162630";
        g.fillRect(0, 188, 256, 68);
        const bays = [12, 74, 136, 198];
        for (const bx of bays) {
          const grad = g.createLinearGradient(bx, 194, bx, 252);
          grad.addColorStop(0, "#2f5164");
          grad.addColorStop(0.55, "#5c7b88");
          grad.addColorStop(1, "#cfa96c");
          g.fillStyle = grad;
          g.fillRect(bx, 194, 48, 56);
        }
        return c;
      }),
    shingleRoof: (hex: string) =>
      getOrCreate(`roof-${hex}`, () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = hex;
        g.fillRect(0, 0, 256, 256);
        const rowH = 16;
        for (let row = 0; row < 16; row++) {
          const y = row * rowH;
          const offset = (row % 2) * 16;
          for (let x = -16; x < 256; x += 32) {
            const delta = ((row * 7 + x) % 13) - 6;
            g.fillStyle = shadeHex(hex, delta);
            g.fillRect(x + offset, y, 31, rowH - 1.5);
          }
          g.fillStyle = "rgba(10, 14, 18, 0.35)";
          g.fillRect(0, y + rowH - 1.5, 256, 1.5);
        }
        return c;
      }),
    flatRoof: () =>
      getOrCreate("flat-roof", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = "#525960";
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1600; i++) {
          g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(15,20,25,0.08)";
          g.fillRect((i * 47) % 256, (i * 83) % 256, 2, 2);
        }
        return c;
      }),
    solarPanel: () =>
      getOrCreate("solar-panel", () => {
        const [c, g] = makeCanvas(256, 256);
        g.fillStyle = "#d0d8e0";
        g.fillRect(0, 0, 256, 256);
        g.fillStyle = "#162d4d";
        g.fillRect(8, 8, 240, 240);
        g.strokeStyle = "rgba(182, 206, 228, 0.55)";
        g.lineWidth = 2;
        for (let x = 8; x <= 248; x += 40) {
          g.beginPath();
          g.moveTo(x, 8);
          g.lineTo(x, 248);
          g.stroke();
        }
        for (let y = 8; y <= 248; y += 30) {
          g.beginPath();
          g.moveTo(8, y);
          g.lineTo(248, y);
          g.stroke();
        }
        return c;
      }),
  };
}

function makeTexturedAppearance(
  C: Cesium,
  image: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1,
  translucent = false,
): CesiumNS.MaterialAppearance {
  return new C.MaterialAppearance({
    material: C.Material.fromType("Image", {
      image,
      repeat: new C.Cartesian2(repeatX, repeatY),
    }),
    materialSupport: C.MaterialAppearance.MaterialSupport.TEXTURED,
    flat: false,
    translucent,
    closed: false,
    faceForward: false,
  });
}

// ---------- Street & Sidewalk Geometry ----------

interface Pt2 {
  x: number;
  y: number;
}

function segIntersect2D(a0: Pt2, a1: Pt2, b0: Pt2, b1: Pt2): { t: number; u: number; x: number; y: number } | null {
  const rX = a1.x - a0.x;
  const rY = a1.y - a0.y;
  const sX = b1.x - b0.x;
  const sY = b1.y - b0.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-6) return null;
  const qpx = b0.x - a0.x;
  const qpy = b0.y - a0.y;
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) {
    return { t: clamp(t, 0, 1), u: clamp(u, 0, 1), x: a0.x + t * rX, y: a0.y + t * rY };
  }
  return null;
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (!intervals.length) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[intervals[0][0], intervals[0][1]]];
  for (let i = 1; i < intervals.length; i++) {
    const last = out[out.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      out.push([intervals[i][0], intervals[i][1]]);
    }
  }
  return out;
}

function subtractIntervals(start: number, end: number, cuts: [number, number][]): [number, number][] {
  let spans: [number, number][] = [[start, end]];
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = [];
    for (const [s0, s1] of spans) {
      if (c1 <= s0 || c0 >= s1) {
        next.push([s0, s1]);
      } else {
        if (c0 > s0 + 0.2) next.push([s0, c0]);
        if (c1 < s1 - 0.2) next.push([c1, s1]);
      }
    }
    spans = next;
  }
  return spans;
}

function splitSpan(s0: number, s1: number, maxStep = 45): [number, number][] {
  const len = s1 - s0;
  if (len <= maxStep) return [[s0, s1]];
  const parts = Math.ceil(len / maxStep);
  const step = len / parts;
  const out: [number, number][] = [];
  for (let k = 0; k < parts; k++) {
    out.push([s0 + k * step, s0 + (k + 1) * step]);
  }
  return out;
}

function buildStreetPrimitives(
  C: Cesium,
  data: CleanScene,
  projector: EnuProjector,
  textures: TextureLibrary,
  outPrimitives: CesiumNS.Primitive[],
): CesiumNS.PrimitiveCollection {
  const group = new C.PrimitiveCollection();

  // Subdivided neighbourhood turf plane so terrain slope is followed smoothly across the cell
  const groundMesh = new MeshBuilder(C, projector);
  const gHalf = 480;
  const gDiv = 8;
  const gStep = (gHalf * 2) / gDiv;
  const uvStep = 40 / gDiv;
  for (let ix = 0; ix < gDiv; ix++) {
    for (let iy = 0; iy < gDiv; iy++) {
      const x0 = -gHalf + ix * gStep;
      const x1 = x0 + gStep;
      const y0 = -gHalf + iy * gStep;
      const y1 = y0 + gStep;
      groundMesh.addQuad(
        [x0, y0, 0.04],
        [x1, y0, 0.04],
        [x1, y1, 0.04],
        [x0, y1, 0.04],
        [0, 0, 1],
        ix * uvStep,
        (ix + 1) * uvStep,
        iy * uvStep,
        (iy + 1) * uvStep,
      );
    }
  }
  const groundGeom = groundMesh.toGeometry();
  if (groundGeom) {
    const prim = new C.Primitive({
      geometryInstances: new C.GeometryInstance({ geometry: groundGeom }),
      appearance: makeTexturedAppearance(C, textures.grass(), 1, 1, false),
      asynchronous: true,
    });
    group.add(prim);
    outPrimitives.push(prim);
  }

  const asphaltMesh = new MeshBuilder(C, projector);
  const sidewalkMesh = new MeshBuilder(C, projector);
  const busLaneMesh = new MeshBuilder(C, projector);
  const yellowMesh = new MeshBuilder(C, projector);
  const crosswalkMesh = new MeshBuilder(C, projector);

  const streetPolys = data.streets.map((st) => ({
    st,
    pts: st.centreline.map((c) => projector.toEnu(c[0], c[1])),
  }));

  interface Intersection {
    x: number;
    y: number;
    stA: CleanStreet;
    stB: CleanStreet;
    uA: Pt2;
    uB: Pt2;
  }
  const intersections: Intersection[] = [];

  for (let i = 0; i < streetPolys.length; i++) {
    const { st, pts } = streetPolys[i];
    const halfW = (st.width_m || 11) / 2;
    const swW = st.sidewalk_width_m || 1.8;

    for (let segIdx = 0; segIdx < pts.length - 1; segIdx++) {
      const p0 = pts[segIdx];
      const p1 = pts[segIdx + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      const ux = dx / len;
      const uy = dy / len;
      const rx = uy;
      const ry = -ux;

      for (const [as0, as1] of splitSpan(0, len)) {
        const x0 = p0.x + ux * as0;
        const y0 = p0.y + uy * as0;
        const x1 = p0.x + ux * as1;
        const y1 = p0.y + uy * as1;
        const subLen = as1 - as0;
        asphaltMesh.addQuad(
          [x0 - rx * halfW, y0 - ry * halfW, 0.1],
          [x0 + rx * halfW, y0 + ry * halfW, 0.1],
          [x1 + rx * halfW, y1 + ry * halfW, 0.1],
          [x1 - rx * halfW, y1 - ry * halfW, 0.1],
          [0, 0, 1],
          0,
          halfW / 4,
          0,
          subLen / 6,
        );
      }

      const cutsRoad: [number, number][] = [];
      const cutsCross: [number, number][] = [];
      for (let j = 0; j < streetPolys.length; j++) {
        if (i === j) continue;
        const other = streetPolys[j];
        const otherHalfW = (other.st.width_m || 11) / 2;
        const otherSw = other.st.sidewalk_width_m || 1.8;
        for (let k = 0; k < other.pts.length - 1; k++) {
          const hit = segIntersect2D(p0, p1, other.pts[k], other.pts[k + 1]);
          if (hit) {
            const dist = hit.t * len;
            cutsRoad.push([dist - otherHalfW - 0.15, dist + otherHalfW + 0.15]);
            cutsCross.push([dist - otherHalfW - otherSw - 2.6, dist + otherHalfW + otherSw + 2.6]);
            if (i < j) {
              const bx = other.pts[k + 1].x - other.pts[k].x;
              const by = other.pts[k + 1].y - other.pts[k].y;
              const bl = Math.hypot(bx, by) || 1;
              intersections.push({
                x: hit.x,
                y: hit.y,
                stA: st,
                stB: other.st,
                uA: { x: ux, y: uy },
                uB: { x: bx / bl, y: by / bl },
              });
            }
          }
        }
      }

      const sidewalkSpans = subtractIntervals(0, len, mergeIntervals(cutsRoad));
      for (const [raw0, raw1] of sidewalkSpans) {
        if (raw1 - raw0 < 0.8) continue;
        for (const [s0, s1] of splitSpan(raw0, raw1)) {
          const spanLen = s1 - s0;
          for (const side of [-1, 1]) {
            const innerOff = side * halfW;
            const outerOff = side * (halfW + swW);
            const x0 = p0.x + ux * s0;
            const y0 = p0.y + uy * s0;
            const x1 = p0.x + ux * s1;
            const y1 = p0.y + uy * s1;

            const i0: [number, number, number] = [x0 + rx * innerOff, y0 + ry * innerOff, 0.24];
            const o0: [number, number, number] = [x0 + rx * outerOff, y0 + ry * outerOff, 0.24];
            const o1: [number, number, number] = [x1 + rx * outerOff, y1 + ry * outerOff, 0.24];
            const i1: [number, number, number] = [x1 + rx * innerOff, y1 + ry * innerOff, 0.24];
            sidewalkMesh.addQuad(i0, o0, o1, i1, [0, 0, 1], 0, swW / 2, 0, spanLen / 3);

            const b0: [number, number, number] = [x0 + rx * innerOff, y0 + ry * innerOff, 0.08];
            const b1: [number, number, number] = [x1 + rx * innerOff, y1 + ry * innerOff, 0.08];
            sidewalkMesh.addQuad(b0, b1, i1, i0, [-side * rx, -side * ry, 0], 0, spanLen / 3, 0, 0.2);
          }
        }
      }

      const centreSpans = subtractIntervals(0, len, mergeIntervals(cutsCross));
      for (const [raw0, raw1] of centreSpans) {
        if (raw1 - raw0 < 2.0) continue;
        for (const [s0, s1] of splitSpan(raw0, raw1)) {
          const x0 = p0.x + ux * s0;
          const y0 = p0.y + uy * s0;
          const x1 = p0.x + ux * s1;
          const y1 = p0.y + uy * s1;
          const lineHalf = st.transit_corridor ? 0.24 : 0.14;
          yellowMesh.addQuad(
            [x0 - rx * lineHalf, y0 - ry * lineHalf, 0.125],
            [x0 + rx * lineHalf, y0 + ry * lineHalf, 0.125],
            [x1 + rx * lineHalf, y1 + ry * lineHalf, 0.125],
            [x1 - rx * lineHalf, y1 - ry * lineHalf, 0.125],
            [0, 0, 1],
            0,
            1,
            0,
            1,
          );
        }
      }

      if (st.bus_lane) {
        const laneW = 3.4;
        const laneInner = halfW - laneW - 0.15;
        const laneOuter = halfW - 0.15;
        for (const [raw0, raw1] of centreSpans) {
          if (raw1 - raw0 < 4.0) continue;
          for (const [s0, s1] of splitSpan(raw0, raw1)) {
            const x0 = p0.x + ux * s0;
            const y0 = p0.y + uy * s0;
            const x1 = p0.x + ux * s1;
            const y1 = p0.y + uy * s1;
            const repY = Math.max(1, Math.round((s1 - s0) / 14));
            busLaneMesh.addQuad(
              [x0 + rx * laneInner, y0 + ry * laneInner, 0.12],
              [x0 + rx * laneOuter, y0 + ry * laneOuter, 0.12],
              [x1 + rx * laneOuter, y1 + ry * laneOuter, 0.12],
              [x1 + rx * laneInner, y1 + ry * laneInner, 0.12],
              [0, 0, 1],
              0,
              1,
              0,
              repY,
            );
          }
        }
      }
    }
  }

  for (const inter of intersections) {
    if (!inter.stA.transit_corridor && !inter.stB.transit_corridor) continue;
    const arms = [
      { dir: inter.uA, halfCross: (inter.stB.width_m || 12) / 2, halfArm: (inter.stA.width_m || 12) / 2 - 0.5 },
      { dir: { x: -inter.uA.x, y: -inter.uA.y }, halfCross: (inter.stB.width_m || 12) / 2, halfArm: (inter.stA.width_m || 12) / 2 - 0.5 },
      { dir: inter.uB, halfCross: (inter.stA.width_m || 12) / 2, halfArm: (inter.stB.width_m || 12) / 2 - 0.5 },
      { dir: { x: -inter.uB.x, y: -inter.uB.y }, halfCross: (inter.stA.width_m || 12) / 2, halfArm: (inter.stB.width_m || 12) / 2 - 0.5 },
    ];
    for (const arm of arms) {
      const ux = arm.dir.x;
      const uy = arm.dir.y;
      const rx = uy;
      const ry = -ux;
      const d0 = arm.halfCross + 0.4;
      const d1 = d0 + 2.6;
      const cx0 = inter.x + ux * d0;
      const cy0 = inter.y + uy * d0;
      const cx1 = inter.x + ux * d1;
      const cy1 = inter.y + uy * d1;
      crosswalkMesh.addQuad(
        [cx0 - rx * arm.halfArm, cy0 - ry * arm.halfArm, 0.135],
        [cx0 + rx * arm.halfArm, cy0 + ry * arm.halfArm, 0.135],
        [cx1 + rx * arm.halfArm, cy1 + ry * arm.halfArm, 0.135],
        [cx1 - rx * arm.halfArm, cy1 - ry * arm.halfArm, 0.135],
        [0, 0, 1],
        0,
        Math.max(1, Math.round(arm.halfArm / 2.2)),
        0,
        1,
      );
    }
  }

  const addPart = (mesh: MeshBuilder, tex: HTMLCanvasElement) => {
    const geom = mesh.toGeometry();
    if (!geom) return;
    const prim = new C.Primitive({
      geometryInstances: new C.GeometryInstance({ geometry: geom }),
      appearance: makeTexturedAppearance(C, tex, 1, 1, false),
      asynchronous: true,
    });
    group.add(prim);
    outPrimitives.push(prim);
  };

  addPart(asphaltMesh, textures.asphalt());
  addPart(sidewalkMesh, textures.sidewalk());
  addPart(yellowMesh, textures.yellowLine());
  addPart(busLaneMesh, textures.busLane());
  addPart(crosswalkMesh, textures.crosswalk());

  return group;
}

// ---------- Pitched-Roof Residential & Commercial Buildings ----------

function signedArea2D(pts: Pt2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    a += p0.x * p1.y - p1.x * p0.y;
  }
  return a * 0.5;
}

function buildingAxesAndBounds(pts: Pt2[]) {
  let bestLen = -1;
  let ux = 1;
  let uy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      ux = dx / len;
      uy = dy / len;
    }
  }
  const vx = -uy;
  const vy = ux;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of pts) {
    const u = p.x * ux + p.y * uy;
    const v = p.x * vx + p.y * vy;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  return { ux, uy, vx, vy, uMin, uMax, vMin, vMax };
}

function buildBuildingPrimitives(
  C: Cesium,
  buildings: CleanBuilding[],
  projector: EnuProjector,
  textures: TextureLibrary,
  lowProfile: boolean,
  outPrimitives: CesiumNS.Primitive[],
): CesiumNS.PrimitiveCollection {
  const group = new C.PrimitiveCollection();
  const instancesByMat = new Map<string, { tex: HTMLCanvasElement; instances: CesiumNS.GeometryInstance[] }>();

  const pushInstance = (matKey: string, tex: HTMLCanvasElement, geom: CesiumNS.Geometry | null, bld: CleanBuilding) => {
    if (!geom) return;
    let bucket = instancesByMat.get(matKey);
    if (!bucket) {
      bucket = { tex, instances: [] };
      instancesByMat.set(matKey, bucket);
    }
    bucket.instances.push(
      new C.GeometryInstance({
        geometry: geom,
        id: { kind: "building", data: bld },
      }),
    );
  };

  for (const b of buildings) {
    const raw = (b.footprint || []).map((c) => projector.toEnu(c[0], c[1]));
    if (raw.length > 1) {
      const first = raw[0];
      const last = raw[raw.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 0.05) raw.pop();
    }
    if (raw.length < 3) continue;
    if (signedArea2D(raw) < 0) raw.reverse();

    const isFlat = (b.roof_type || "flat") === "flat";
    const eaveH = b.eave_height_m || (isFlat ? b.height_m : (b.height_m || 10) * 0.7);
    const ridgeH = b.height_m || eaveH + 3.0;
    const wallHex = b.wall_colour || (isFlat ? "#9e5442" : "#efe9dc");
    const roofHex = b.roof_colour || (isFlat ? "#495057" : "#2f363e");

    const wallMesh = new MeshBuilder(C, projector);
    const wallH = isFlat ? ridgeH : eaveH;

    for (let i = 0; i < raw.length; i++) {
      const p0 = raw[i];
      const p1 = raw[(i + 1) % raw.length];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const edgeLen = Math.hypot(dx, dy);
      if (edgeLen < 0.2) continue;
      const nx = dy / edgeLen;
      const ny = -dx / edgeLen;
      const uRep = Math.max(1, Math.round(edgeLen / 5.5));
      wallMesh.addQuad(
        [p0.x, p0.y, 0],
        [p1.x, p1.y, 0],
        [p1.x, p1.y, wallH],
        [p0.x, p0.y, wallH],
        [nx, ny, 0],
        0,
        uRep,
        0,
        1,
      );
    }

    const axes = buildingAxesAndBounds(raw);
    const uvPt = (u: number, v: number, z: number): [number, number, number] => [
      u * axes.ux + v * axes.vx,
      u * axes.uy + v * axes.vy,
      z,
    ];
    const uMid = (axes.uMin + axes.uMax) * 0.5;
    const vMid = (axes.vMin + axes.vMax) * 0.5;
    const roofMesh = new MeshBuilder(C, projector);

    if (isFlat) {
      const parapetH = 0.42;
      const inset = 0.35;
      roofMesh.addQuad(
        uvPt(axes.uMin + inset, axes.vMin + inset, ridgeH - 0.25),
        uvPt(axes.uMax - inset, axes.vMin + inset, ridgeH - 0.25),
        uvPt(axes.uMax - inset, axes.vMax - inset, ridgeH - 0.25),
        uvPt(axes.uMin + inset, axes.vMax - inset, ridgeH - 0.25),
        [0, 0, 1],
        0,
        3,
        0,
        3,
      );
      const pEdges: [number, number, number, number][] = [
        [axes.uMin, axes.vMin, axes.uMax, axes.vMin + inset],
        [axes.uMin, axes.vMax - inset, axes.uMax, axes.vMax],
        [axes.uMin, axes.vMin + inset, axes.uMin + inset, axes.vMax - inset],
        [axes.uMax - inset, axes.vMin + inset, axes.uMax, axes.vMax - inset],
      ];
      for (const [ua, va, ub, vb] of pEdges) {
        roofMesh.addQuad(
          uvPt(ua, va, ridgeH + parapetH),
          uvPt(ub, va, ridgeH + parapetH),
          uvPt(ub, vb, ridgeH + parapetH),
          uvPt(ua, vb, ridgeH + parapetH),
          [0, 0, 1],
          0,
          2,
          0,
          0.25,
        );
      }

      if (!lowProfile) {
        const hx0 = uMid - 1.3;
        const hx1 = uMid + 1.3;
        const hy0 = vMid - 0.9;
        const hy1 = vMid + 0.9;
        const hz0 = ridgeH - 0.25;
        const hz1 = ridgeH + 0.7;
        roofMesh.addQuad(uvPt(hx0, hy0, hz1), uvPt(hx1, hy0, hz1), uvPt(hx1, hy1, hz1), uvPt(hx0, hy1, hz1), [0, 0, 1]);
        roofMesh.addQuad(uvPt(hx0, hy0, hz0), uvPt(hx1, hy0, hz0), uvPt(hx1, hy0, hz1), uvPt(hx0, hy0, hz1), [-axes.vx, -axes.vy, 0]);
        roofMesh.addQuad(uvPt(hx1, hy1, hz0), uvPt(hx0, hy1, hz0), uvPt(hx0, hy1, hz1), uvPt(hx1, hy1, hz1), [axes.vx, axes.vy, 0]);
        roofMesh.addQuad(uvPt(hx1, hy0, hz0), uvPt(hx1, hy1, hz0), uvPt(hx1, hy1, hz1), uvPt(hx1, hy0, hz1), [axes.ux, axes.uy, 0]);
        roofMesh.addQuad(uvPt(hx0, hy1, hz0), uvPt(hx0, hy0, hz0), uvPt(hx0, hy0, hz1), uvPt(hx0, hy1, hz1), [-axes.ux, -axes.uy, 0]);
      }

      pushInstance(`com-wall-${wallHex}`, textures.commercialWall(wallHex), wallMesh.toGeometry(), b);
      pushInstance("flat-roof", textures.flatRoof(), roofMesh.toGeometry(), b);
    } else {
      const overhang = 0.35;
      const eaveDrop = 0.14;
      const u0 = axes.uMin - overhang;
      const u1 = axes.uMax + overhang;
      const v0 = axes.vMin - overhang;
      const v1 = axes.vMax + overhang;
      const zEave = eaveH - eaveDrop;
      const spanU = u1 - u0;
      const spanV = (v1 - v0) * 0.5;

      if (b.roof_type === "hip") {
        const halfU = (axes.uMax - axes.uMin) * 0.5;
        const halfV = (axes.vMax - axes.vMin) * 0.5;
        const inset = Math.min(halfV * 0.85, halfU * 0.52);
        const r0 = uvPt(axes.uMin + inset, vMid, ridgeH);
        const r1 = uvPt(axes.uMax - inset, vMid, ridgeH);
        const c00 = uvPt(u0, v0, zEave);
        const c10 = uvPt(u1, v0, zEave);
        const c11 = uvPt(u1, v1, zEave);
        const c01 = uvPt(u0, v1, zEave);

        roofMesh.addQuad(c00, c10, r1, r0, [-axes.vx, -axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
        roofMesh.addQuad(c11, c01, r0, r1, [axes.vx, axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
        roofMesh.addTriangle(c01, c00, r0, [-axes.ux, -axes.uy, 0.7], [0, 0], [spanV / 2, 0], [spanV / 4, spanV / 2]);
        roofMesh.addTriangle(c10, c11, r1, [axes.ux, axes.uy, 0.7], [0, 0], [spanV / 2, 0], [spanV / 4, spanV / 2]);
      } else {
        const r0 = uvPt(u0, vMid, ridgeH);
        const r1 = uvPt(u1, vMid, ridgeH);
        const c00 = uvPt(u0, v0, zEave);
        const c10 = uvPt(u1, v0, zEave);
        const c11 = uvPt(u1, v1, zEave);
        const c01 = uvPt(u0, v1, zEave);

        roofMesh.addQuad(c00, c10, r1, r0, [-axes.vx, -axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);
        roofMesh.addQuad(c11, c01, r0, r1, [axes.vx, axes.vy, 0.7], 0, spanU / 3, 0, spanV / 2.2);

        const g0a = uvPt(axes.uMin, axes.vMin, eaveH);
        const g0b = uvPt(axes.uMin, axes.vMax, eaveH);
        const g0r = uvPt(axes.uMin, vMid, ridgeH);
        wallMesh.addTriangle(g0b, g0a, g0r, [-axes.ux, -axes.uy, 0], [0, 0], [1, 0], [0.5, 0.4]);

        const g1a = uvPt(axes.uMax, axes.vMin, eaveH);
        const g1b = uvPt(axes.uMax, axes.vMax, eaveH);
        const g1r = uvPt(axes.uMax, vMid, ridgeH);
        wallMesh.addTriangle(g1a, g1b, g1r, [axes.ux, axes.uy, 0], [0, 0], [1, 0], [0.5, 0.4]);
      }

      roofMesh.addQuad(
        uvPt(u0, v0, zEave),
        uvPt(u0, v1, zEave),
        uvPt(u1, v1, zEave),
        uvPt(u1, v0, zEave),
        [0, 0, -1],
        0,
        1,
        0,
        1,
      );

      pushInstance(`res-wall-${wallHex}`, textures.residentialWall(wallHex), wallMesh.toGeometry(), b);
      pushInstance(`roof-${roofHex}`, textures.shingleRoof(roofHex), roofMesh.toGeometry(), b);

      if (!lowProfile && b.solar_kw && b.solar_kw > 0) {
        const solarMesh = new MeshBuilder(C, projector);
        const slopeDrop = ridgeH - zEave;
        const halfSpanV = (v1 - v0) * 0.5;
        const slopeLen = Math.hypot(halfSpanV, slopeDrop) || 1;
        const nSlope: [number, number, number] = [
          (-axes.vx * slopeDrop) / slopeLen,
          (-axes.vy * slopeDrop) / slopeLen,
          halfSpanV / slopeLen,
        ];
        const lift = 0.09;
        const pu0 = uMid - 2.3;
        const pu1 = uMid + 2.3;
        const ptOnSlope = (u: number, frac: number): [number, number, number] => {
          const base = uvPt(u, v0 + (vMid - v0) * frac, zEave + slopeDrop * frac);
          return [base[0] + nSlope[0] * lift, base[1] + nSlope[1] * lift, base[2] + nSlope[2] * lift];
        };
        solarMesh.addQuad(
          ptOnSlope(pu0, 0.22),
          ptOnSlope(pu1, 0.22),
          ptOnSlope(pu1, 0.82),
          ptOnSlope(pu0, 0.82),
          nSlope,
          0,
          1,
          0,
          1,
        );
        pushInstance("solar-panel", textures.solarPanel(), solarMesh.toGeometry(), b);
      }
    }
  }

  for (const [, entry] of instancesByMat) {
    if (!entry.instances.length) continue;
    const prim = new C.Primitive({
      geometryInstances: entry.instances,
      appearance: makeTexturedAppearance(C, entry.tex, 1, 1, false),
      asynchronous: true,
    });
    group.add(prim);
    outPrimitives.push(prim);
  }

  return group;
}

// ---------- Multi-Lobe 3D Street Trees ----------

function buildTreePrimitives(
  C: Cesium,
  trees: CleanTree[],
  projector: EnuProjector,
  lowProfile: boolean,
  outPrimitives: CesiumNS.Primitive[],
): CesiumNS.PrimitiveCollection {
  const group = new C.PrimitiveCollection();
  if (!trees.length) return group;

  const trunkInstances: CesiumNS.GeometryInstance[] = [];
  const canopyInstances: CesiumNS.GeometryInstance[] = [];
  const shadowInstances: CesiumNS.GeometryInstance[] = [];

  const unitCyl = C.CylinderGeometry.createGeometry(
    new C.CylinderGeometry({
      length: 1.0,
      topRadius: 0.7,
      bottomRadius: 1.0,
      slices: 8,
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
  const unitSphere = C.EllipsoidGeometry.createGeometry(
    new C.EllipsoidGeometry({
      radii: new C.Cartesian3(1, 1, 1),
      stackPartitions: lowProfile ? 6 : 10,
      slicePartitions: lowProfile ? 8 : 12,
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
  const unitCone = C.CylinderGeometry.createGeometry(
    new C.CylinderGeometry({
      length: 1.0,
      topRadius: 0.05,
      bottomRadius: 1.0,
      slices: lowProfile ? 8 : 10,
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
  const unitShadow = C.CylinderGeometry.createGeometry(
    new C.CylinderGeometry({
      length: 0.03,
      topRadius: 1.0,
      bottomRadius: 1.0,
      slices: 14,
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );

  if (!unitCyl || !unitSphere || !unitCone || !unitShadow) return group;

  const scratchScale = new C.Cartesian3();
  const makeLocalMatrix = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const origin = projector.toCartesian(x, y, z);
    const frame = C.Transforms.eastNorthUpToFixedFrame(origin);
    C.Matrix4.multiplyByScale(frame, C.Cartesian3.fromElements(sx, sy, sz, scratchScale), frame);
    return frame;
  };

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const p = projector.toEnu(tree.lon, tree.lat);
    const h = tree.height_m || 10.5;
    const r = tree.crown_radius_m || 3.6;
    const isSpruce = (tree.species || "").toLowerCase().includes("spruce");
    const baseHex = tree.foliage_tone || "#4f6b3a";
    const baseCol = C.Color.fromCssColorString(baseHex);
    const darkCol = C.Color.multiplyByScalar(baseCol, 0.86, new C.Color());
    darkCol.alpha = 1.0;
    const lightCol = C.Color.lerp(baseCol, C.Color.WHITE, 0.1, new C.Color());
    lightCol.alpha = 1.0;

    shadowInstances.push(
      new C.GeometryInstance({
        geometry: unitShadow,
        modelMatrix: makeLocalMatrix(p.x, p.y, 0.25, r * 0.85, r * 0.85, 1.0),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(new C.Color(0.07, 0.14, 0.18, 0.24)),
        },
      }),
    );

    const trunkH = isSpruce ? h * 0.26 : h * 0.42;
    const trunkR = clamp(r * 0.08, 0.16, 0.3);
    trunkInstances.push(
      new C.GeometryInstance({
        geometry: unitCyl,
        modelMatrix: makeLocalMatrix(p.x, p.y, 0.2 + trunkH * 0.5, trunkR, trunkR, trunkH),
        id: { kind: "tree", data: tree },
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString("#5c4636")),
        },
      }),
    );

    if (isSpruce) {
      const tiers = [
        { z: h * 0.42, radScale: 1.0, tierH: h * 0.42, col: darkCol },
        { z: h * 0.64, radScale: 0.78, tierH: h * 0.36, col: baseCol },
        { z: h * 0.83, radScale: 0.52, tierH: h * 0.3, col: lightCol },
      ];
      for (const tier of tiers) {
        canopyInstances.push(
          new C.GeometryInstance({
            geometry: unitCone,
            modelMatrix: makeLocalMatrix(p.x, p.y, tier.z, r * tier.radScale, r * tier.radScale, tier.tierH),
            id: { kind: "tree", data: tree },
            attributes: {
              color: C.ColorGeometryInstanceAttribute.fromColor(tier.col),
            },
          }),
        );
      }
    } else {
      const angle = (i * 2.1) % (Math.PI * 2);
      const lobes = [
        { dx: 0, dy: 0, dz: h * 0.68, sx: r * 0.86, sy: r * 0.86, sz: h * 0.28, col: baseCol },
        {
          dx: Math.cos(angle) * r * 0.38,
          dy: Math.sin(angle) * r * 0.38,
          dz: h * 0.6,
          sx: r * 0.66,
          sy: r * 0.66,
          sz: h * 0.24,
          col: darkCol,
        },
        {
          dx: Math.cos(angle + 2.3) * r * 0.34,
          dy: Math.sin(angle + 2.3) * r * 0.34,
          dz: h * 0.73,
          sx: r * 0.62,
          sy: r * 0.62,
          sz: h * 0.22,
          col: lightCol,
        },
      ];
      for (const lobe of lobes) {
        canopyInstances.push(
          new C.GeometryInstance({
            geometry: unitSphere,
            modelMatrix: makeLocalMatrix(p.x + lobe.dx, p.y + lobe.dy, lobe.dz, lobe.sx, lobe.sy, lobe.sz),
            id: { kind: "tree", data: tree },
            attributes: {
              color: C.ColorGeometryInstanceAttribute.fromColor(lobe.col),
            },
          }),
        );
      }
    }
  }

  const solidAppear = new C.PerInstanceColorAppearance({ flat: false, translucent: false });
  const shadowAppear = new C.PerInstanceColorAppearance({ flat: true, translucent: true });

  if (shadowInstances.length) {
    const prim = new C.Primitive({ geometryInstances: shadowInstances, appearance: shadowAppear, asynchronous: true });
    group.add(prim);
    outPrimitives.push(prim);
  }
  if (trunkInstances.length) {
    const prim = new C.Primitive({ geometryInstances: trunkInstances, appearance: solidAppear, asynchronous: true });
    group.add(prim);
    outPrimitives.push(prim);
  }
  if (canopyInstances.length) {
    const prim = new C.Primitive({ geometryInstances: canopyInstances, appearance: solidAppear, asynchronous: true });
    group.add(prim);
    outPrimitives.push(prim);
  }

  return group;
}

// ---------- 3D Glass Bus Shelters & Stop Poles ----------

function buildShelterPrimitives(
  C: Cesium,
  stops: CleanStop[],
  projector: EnuProjector,
  outPrimitives: CesiumNS.Primitive[],
): CesiumNS.PrimitiveCollection {
  const group = new C.PrimitiveCollection();
  if (!stops.length) return group;

  const solidInstances: CesiumNS.GeometryInstance[] = [];
  const glassInstances: CesiumNS.GeometryInstance[] = [];

  const unitBox = C.BoxGeometry.createGeometry(
    new C.BoxGeometry({
      minimum: new C.Cartesian3(-0.5, -0.5, -0.5),
      maximum: new C.Cartesian3(0.5, 0.5, 0.5),
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
  if (!unitBox) return group;

  const makeOrientedBox = (
    x: number,
    y: number,
    z: number,
    headingDeg: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const origin = projector.toCartesian(x, y, z);
    const hpr = new C.HeadingPitchRoll(rad(headingDeg), 0, 0);
    const frame = C.Transforms.headingPitchRollToFixedFrame(origin, hpr);
    C.Matrix4.multiplyByScale(frame, new C.Cartesian3(sx, sy, sz), frame);
    return frame;
  };

  const inkAttr = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(SCENE_COLOURS.ink));
  const padAttr = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString("#cfc9be"));
  const benchAttr = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString("#9c7853"));
  const totemAttr = C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(SCENE_COLOURS.harbour));
  const glassAttr = C.ColorGeometryInstanceAttribute.fromColor(
    C.Color.fromCssColorString("#79b2c4").withAlpha(0.42),
  );

  for (const stop of stops) {
    const p = projector.toEnu(stop.lon, stop.lat);
    const heading = stop.bearing_deg || 0;
    const hRad = rad(heading);
    const fx = Math.sin(hRad);
    const fy = Math.cos(hRad);
    const rx = Math.cos(hRad);
    const ry = -Math.sin(hRad);

    const offsetBox = (
      fwd: number,
      right: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      attr: CesiumNS.ColorGeometryInstanceAttribute,
      target: CesiumNS.GeometryInstance[],
    ) => {
      target.push(
        new C.GeometryInstance({
          geometry: unitBox,
          modelMatrix: makeOrientedBox(p.x + fx * fwd + rx * right, p.y + fy * fwd + ry * right, z, heading, sx, sy, sz),
          id: { kind: "stop", data: stop },
          attributes: { color: attr },
        }),
      );
    };

    offsetBox(0, 0, 0.25, 2.0, 4.4, 0.08, padAttr, solidInstances);
    offsetBox(1.85, -0.55, 1.45, 0.12, 0.12, 2.4, inkAttr, solidInstances);
    offsetBox(1.85, -0.55, 2.45, 0.08, 0.42, 0.56, totemAttr, solidInstances);

    if (stop.shelter) {
      for (const [df, dr] of [
        [-1.55, -0.62],
        [1.45, -0.62],
        [-1.55, 0.62],
        [1.45, 0.62],
      ]) {
        offsetBox(df, dr, 1.42, 0.09, 0.09, 2.35, inkAttr, solidInstances);
      }
      offsetBox(-0.05, 0.0, 2.62, 1.55, 3.45, 0.1, inkAttr, solidInstances);
      offsetBox(-0.05, 0.62, 1.45, 0.04, 2.95, 2.05, glassAttr, glassInstances);
      offsetBox(-1.55, 0.0, 1.45, 1.18, 0.04, 2.05, glassAttr, glassInstances);
      offsetBox(-0.05, 0.25, 0.72, 0.45, 1.9, 0.1, benchAttr, solidInstances);
    }
  }

  if (solidInstances.length) {
    const prim = new C.Primitive({
      geometryInstances: solidInstances,
      appearance: new C.PerInstanceColorAppearance({ flat: false, translucent: false }),
      asynchronous: true,
    });
    group.add(prim);
    outPrimitives.push(prim);
  }
  if (glassInstances.length) {
    const prim = new C.Primitive({
      geometryInstances: glassInstances,
      appearance: new C.PerInstanceColorAppearance({ flat: false, translucent: true }),
      asynchronous: true,
    });
    group.add(prim);
    outPrimitives.push(prim);
  }

  return group;
}

// ---------- Elevation Sampling & Route Ribbons ----------

function sampleCellElevationGrid(
  C: Cesium,
  viewer: CesiumNS.Viewer,
  bbox: [number, number, number, number],
  noIon: boolean,
  tileset: CesiumNS.Cesium3DTileset | null,
  excludeObjects: object[],
): ElevationGrid {
  const [west, south, east, north] = bbox;
  const cols = 5;
  const rows = 5;
  const heights: number[] = [];
  const scratchCarto = new C.Cartographic();
  const canSample = !noIon && Boolean(tileset && tileset.show);

  for (let r = 0; r < rows; r++) {
    const lat = south + ((north - south) * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const lon = west + ((east - west) * c) / (cols - 1);
      if (noIon) {
        heights.push(0);
      } else if (canSample) {
        C.Cartographic.fromDegrees(lon, lat, 0, scratchCarto);
        const sampled = viewer.scene.sampleHeight(scratchCarto, excludeObjects);
        heights.push(typeof sampled === "number" && Number.isFinite(sampled) ? sampled : FALLBACK_HEIGHT_M);
      } else {
        heights.push(FALLBACK_HEIGHT_M);
      }
    }
  }

  return { west, south, east, north, cols, rows, heights };
}

function lineIntersectsBbox(line: number[][], bbox: [number, number, number, number]): boolean {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const pt of line) {
    if (pt[0] < minLon) minLon = pt[0];
    if (pt[0] > maxLon) maxLon = pt[0];
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }
  const margin = 0.004;
  return (
    minLon <= bbox[2] + margin &&
    maxLon >= bbox[0] - margin &&
    minLat <= bbox[3] + margin &&
    maxLat >= bbox[1] - margin
  );
}

function buildRoutePositions(
  C: Cesium,
  line: number[][],
  grid: ElevationGrid,
  zOffset: number,
): CesiumNS.Cartesian3[] {
  const positions: CesiumNS.Cartesian3[] = [];
  for (let i = 0; i < line.length; i++) {
    const [lon0, lat0] = line[i];
    const h0 = interpolateGridHeight(grid, lon0, lat0) + zOffset;
    positions.push(C.Cartesian3.fromDegrees(lon0, lat0, h0));
    if (i < line.length - 1) {
      const [lon1, lat1] = line[i + 1];
      const approxMetres = Math.hypot((lon1 - lon0) * 79000, (lat1 - lat0) * 111132);
      if (approxMetres > 40) {
        const steps = Math.ceil(approxMetres / 40);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const lon = lon0 + (lon1 - lon0) * t;
          const lat = lat0 + (lat1 - lat0) * t;
          const h = interpolateGridHeight(grid, lon, lat) + zOffset;
          positions.push(C.Cartesian3.fromDegrees(lon, lat, h));
        }
      }
    }
  }
  return positions;
}

// ---------- Controller Factory ----------

/**
 * Create a terrain-conforming close-up 3D twin controller for a CesiumJS viewer.
 * Automatically fetches HRM Open Data cells (and North & Gottingen offline fallback),
 * builds pitched-roof neighbourhoods on the real Halifax slope, and renders transit routes.
 */
export function createCleanTwinController(
  C: Cesium,
  viewer: CesiumNS.Viewer,
  options?: CleanTwinOptions,
): CleanTwinController {
  const rootCollection = viewer.scene.primitives.add(new C.PrimitiveCollection()) as CesiumNS.PrimitiveCollection;
  rootCollection.show = false;

  const cellPrimitives = rootCollection.add(new C.PrimitiveCollection()) as CesiumNS.PrimitiveCollection;
  const routePolylines = rootCollection.add(new C.PolylineCollection()) as CesiumNS.PolylineCollection;

  let active = false;
  let destroyed = false;
  let currentCellKey: string | null = null;
  let currentCellBbox: [number, number, number, number] | null = null;
  let currentGrid: ElevationGrid | null = null;
  let currentProfile: ProfileName = "medium";
  let currentNoIon = Boolean(options?.noIon);
  let pendingReqId = 0;

  let lastRoutes: Feature[] = [];
  let lastHighlightRoute: string | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPrimitives: CesiumNS.Primitive[] = [];

  function clearReadyTimer(): void {
    if (readyTimer !== null) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
    pendingPrimitives = [];
  }

  function pumpPrimitiveReadiness(primitives: CesiumNS.Primitive[]): void {
    clearReadyTimer();
    pendingPrimitives = primitives;
    let ticks = 0;
    const step = () => {
      readyTimer = null;
      if (destroyed || !active) return;
      pendingPrimitives = pendingPrimitives.filter((p) => p.ready === false && !p.isDestroyed?.());
      if (pendingPrimitives.length === 0 || ticks >= 200) {
        pendingPrimitives = [];
        return;
      }
      ticks++;
      viewer.scene.requestRender();
      readyTimer = setTimeout(step, 40);
    };
    if (pendingPrimitives.some((p) => p.ready === false)) {
      readyTimer = setTimeout(step, 40);
    }
  }

  function rebuildRoutePrimitives(): void {
    routePolylines.removeAll();
    if (!currentGrid || !currentCellBbox || !lastRoutes.length) return;

    const baseMat = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString(PIN_COLOURS.route).withAlpha(0.75),
    });
    const casingMat = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString("#f4f3ee").withAlpha(0.92),
    });
    const highlightMat = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString(PIN_COLOURS.route),
    });

    for (const f of lastRoutes) {
      const g = f.geometry;
      if (!g || !g.coordinates) continue;
      const lines =
        g.type === "LineString"
          ? [g.coordinates as number[][]]
          : g.type === "MultiLineString"
            ? (g.coordinates as number[][][])
            : [];
      const isHighlighted = Boolean(
        lastHighlightRoute && f.properties?.route_short_name === lastHighlightRoute,
      );

      for (const line of lines) {
        if (line.length < 2 || !lineIntersectsBbox(line, currentCellBbox)) continue;
        routePolylines.add({
          positions: buildRoutePositions(C, line, currentGrid, 0.16),
          width: 3,
          material: baseMat,
        });
        if (isHighlighted) {
          routePolylines.add({
            positions: buildRoutePositions(C, line, currentGrid, 0.19),
            width: 11,
            material: casingMat,
          });
          routePolylines.add({
            positions: buildRoutePositions(C, line, currentGrid, 0.21),
            width: 7,
            material: highlightMat,
          });
        }
      }
    }
  }

  function rebuildCellPrimitives(
    sceneData: CleanScene,
    cell: CellDescriptor,
    grid: ElevationGrid,
    profileName: ProfileName,
  ): CesiumNS.Primitive[] {
    cellPrimitives.removeAll();
    const textures = getSharedTextures();
    const lowProfile = profileName === "low";
    const [centreLon, centreLat] = sceneData.meta.centre ?? cell.centre;
    const projector = createTerrainEnuProjector(C, centreLon, centreLat, grid);
    const created: CesiumNS.Primitive[] = [];

    cellPrimitives.add(buildStreetPrimitives(C, sceneData, projector, textures, created));
    cellPrimitives.add(buildBuildingPrimitives(C, sceneData.buildings, projector, textures, lowProfile, created));
    cellPrimitives.add(buildTreePrimitives(C, sceneData.trees, projector, lowProfile, created));
    cellPrimitives.add(buildShelterPrimitives(C, sceneData.stops, projector, created));
    return created;
  }

  function setActiveState(next: boolean): void {
    if (active === next) return;
    active = next;
    if (!next) clearReadyTimer();
    rootCollection.show = next;
    options?.onActiveChange?.(next);
  }

  return {
    syncCamera(orbit: Orbit | null, mode: StreetTwinMode, profileName: ProfileName, noIon: boolean): void {
      if (destroyed || !orbit) return;
      const wantActive = shouldShowCleanTwin(mode, orbit.range, active);
      if (!wantActive) {
        pendingReqId++;
        if (active) {
          setActiveState(false);
          viewer.scene.requestRender();
        }
        return;
      }

      const cell = cellKeyFor(orbit.lon, orbit.lat);
      if (
        currentCellKey === cell.key &&
        currentGrid !== null &&
        currentProfile === profileName &&
        currentNoIon === noIon
      ) {
        if (!active) {
          setActiveState(true);
          viewer.scene.requestRender();
        }
        return;
      }

      const reqId = ++pendingReqId;
      void fetchCellScene(cell).then((sceneData) => {
        if (destroyed || reqId !== pendingReqId) return;
        if (!sceneData || (sceneData.buildings.length === 0 && sceneData.streets.length === 0)) {
          if (active) {
            setActiveState(false);
            viewer.scene.requestRender();
          }
          return;
        }

        const tileset = options?.getTileset?.() ?? null;
        const exclude = options?.getExcludeObjects?.() ?? [];
        const grid = sampleCellElevationGrid(C, viewer, cell.bbox, noIon, tileset, exclude);

        const created = rebuildCellPrimitives(sceneData, cell, grid, profileName);
        currentCellKey = cell.key;
        currentCellBbox = cell.bbox;
        currentGrid = grid;
        currentProfile = profileName;
        currentNoIon = noIon;
        rebuildRoutePrimitives();

        if (!active) {
          setActiveState(true);
        } else {
          options?.onActiveChange?.(true);
        }
        viewer.scene.requestRender();
        pumpPrimitiveReadiness(created);
      });
    },

    setRoutes(routes: Feature[], highlightRoute: string | null): void {
      if (destroyed) return;
      lastRoutes = routes;
      lastHighlightRoute = highlightRoute;
      if (currentGrid && currentCellBbox) {
        rebuildRoutePrimitives();
        if (active) viewer.scene.requestRender();
      }
    },

    isActive(): boolean {
      return active;
    },

    groundHeightAt(lon: number, lat: number): number | null {
      if (!active || !currentGrid) return null;
      return interpolateGridHeight(currentGrid, lon, lat);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      pendingReqId++;
      active = false;
      clearReadyTimer();
      try {
        viewer.scene.primitives.remove(rootCollection);
      } catch {
        // viewer already destroyed
      }
    },
  };
}
