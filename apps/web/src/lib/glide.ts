// Buses glide between GPS reports instead of jumping. The map clock runs LIVE_LAG_MS behind real time, so at
// any moment each bus sits between two reports it has already sent, snapped along its route polyline when
// both reports fall within 65 m of the route shape. Pure functions and a small store, testable without a map.

export const LIVE_LAG_MS = 60_000;
const KEEP_MS = 5 * 60_000;
const MAX_SNAP_DISTANCE_M = 65;
const MAX_DETOUR_RATIO = 2.2;
const MIN_ALONG_ROUTE_M = 3;
const STOP_SPEED_THRESHOLD_MPS = 0.8;
const MAX_EASE_ACCEL_MPS2 = 1.4;
const MAX_SPEED_MPS = 33;

export interface Sample {
  t: number; // epoch ms of the GPS report
  lon: number;
  lat: number;
  speedMps?: number | null;
}

export interface GlidePosition {
  lon: number;
  lat: number;
  bearing?: number;
}

export interface RouteFeatureLike {
  geometry?: { type: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

export interface IndexedPolyline {
  points: number[][];
  cumDist: number[];
  totalLen: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function planarDelta(lon1: number, lat1: number, lon2: number, lat2: number): [number, number] {
  const refLat = (lat1 + lat2) * 0.5;
  const dx = (lon2 - lon1) * 111320 * Math.cos((refLat * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110574;
  return [dx, dy];
}

function planarMetres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const [dx, dy] = planarDelta(a.lon, a.lat, b.lon, b.lat);
  return Math.hypot(dx, dy);
}

function indexPolyline(line: number[][]): IndexedPolyline | null {
  if (line.length < 2) return null;
  const cumDist = new Array<number>(line.length);
  cumDist[0] = 0;
  let minLon = line[0][0];
  let maxLon = line[0][0];
  let minLat = line[0][1];
  let maxLat = line[0][1];
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const curr = line[i];
    const [dx, dy] = planarDelta(prev[0], prev[1], curr[0], curr[1]);
    cumDist[i] = cumDist[i - 1] + Math.hypot(dx, dy);
    if (curr[0] < minLon) minLon = curr[0];
    if (curr[0] > maxLon) maxLon = curr[0];
    if (curr[1] < minLat) minLat = curr[1];
    if (curr[1] > maxLat) maxLat = curr[1];
  }
  return { points: line, cumDist, totalLen: cumDist[line.length - 1], minLon, maxLon, minLat, maxLat };
}

function projectOntoPolyline(poly: IndexedPolyline, lon: number, lat: number): { dist: number; s: number } {
  const pad = 0.0015; // ~165 m coarse filter in degrees before segment projection
  if (lon < poly.minLon - pad || lon > poly.maxLon + pad || lat < poly.minLat - pad || lat > poly.maxLat + pad) {
    return { dist: Infinity, s: 0 };
  }
  let bestDist = Infinity;
  let bestS = 0;
  const { points, cumDist } = poly;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cosLat = Math.cos((((p0[1] + p1[1]) * 0.5) * Math.PI) / 180);
    const ax = (p1[0] - p0[0]) * 111320 * cosLat;
    const ay = (p1[1] - p0[1]) * 110574;
    const px = (lon - p0[0]) * 111320 * cosLat;
    const py = (lat - p0[1]) * 110574;
    const len2 = ax * ax + ay * ay;
    const u = len2 > 0 ? Math.max(0, Math.min(1, (px * ax + py * ay) / len2)) : 0;
    const dist = Math.hypot(px - u * ax, py - u * ay);
    if (dist < bestDist) {
      bestDist = dist;
      bestS = cumDist[i] + u * Math.sqrt(len2);
    }
  }
  return { dist: bestDist, s: bestS };
}

function pointAndBearingAtS(poly: IndexedPolyline, s: number, forward: boolean): { lon: number; lat: number; bearing: number } {
  const { points, cumDist, totalLen } = poly;
  const clamped = Math.max(0, Math.min(totalLen, s));
  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumDist[mid + 1] < clamped) lo = mid + 1;
    else hi = mid;
  }
  // Avoid zero-length segments when locating tangent bearing.
  let idx = lo;
  while (idx < points.length - 2 && cumDist[idx + 1] === cumDist[idx]) idx++;
  const p0 = points[idx];
  const p1 = points[idx + 1];
  const segLen = cumDist[idx + 1] - cumDist[idx];
  const u = segLen > 0 ? (clamped - cumDist[idx]) / segLen : 0;
  const lon = p0[0] + (p1[0] - p0[0]) * u;
  const lat = p0[1] + (p1[1] - p0[1]) * u;
  const bearing = forward
    ? bearingBetween({ lon: p0[0], lat: p0[1] }, { lon: p1[0], lat: p1[1] })
    : bearingBetween({ lon: p1[0], lat: p1[1] }, { lon: p0[0], lat: p0[1] });
  return { lon, lat, bearing };
}

/** Spatial index of route polylines keyed by `route_short_name`. */
export class RouteShapeIndex {
  private byRoute = new Map<string, IndexedPolyline[]>();
  private rawByRoute = new Map<string, number[][][]>();

  constructor(input?: RouteFeatureLike[] | Map<string, number[][][]> | Record<string, number[][][]>) {
    if (!input) return;
    if (Array.isArray(input)) {
      this.setFromFeatures(input);
    } else if (input instanceof Map) {
      for (const [k, lines] of input) this.setRoute(k, lines);
    } else {
      for (const [k, lines] of Object.entries(input)) this.setRoute(k, lines);
    }
  }

  setRoute(routeShortName: string, lines: number[][][]): void {
    const indexed: IndexedPolyline[] = [];
    for (const line of lines) {
      const item = indexPolyline(line);
      if (item) indexed.push(item);
    }
    if (indexed.length) {
      this.byRoute.set(routeShortName, indexed);
      this.rawByRoute.set(routeShortName, lines);
    }
  }

  setFromFeatures(features: RouteFeatureLike[]): void {
    this.byRoute.clear();
    this.rawByRoute.clear();
    const grouped = new Map<string, number[][][]>();
    for (const f of features) {
      const name = typeof f.properties?.route_short_name === "string" ? f.properties.route_short_name : null;
      const g = f.geometry;
      if (!name || !g || !g.coordinates) continue;
      const lines =
        g.type === "LineString"
          ? [g.coordinates as number[][]]
          : g.type === "MultiLineString"
            ? (g.coordinates as number[][][])
            : [];
      if (!lines.length) continue;
      const list = grouped.get(name) ?? [];
      for (const l of lines) list.push(l);
      grouped.set(name, list);
    }
    for (const [name, lines] of grouped) this.setRoute(name, lines);
  }

  get(routeShortName: string | null | undefined): number[][][] | undefined {
    if (!routeShortName) return undefined;
    return this.rawByRoute.get(routeShortName);
  }

  getIndexed(routeShortName: string | null | undefined): IndexedPolyline[] | undefined {
    if (!routeShortName) return undefined;
    return this.byRoute.get(routeShortName);
  }
}

/**
 * Gentle cubic Hermite ease-in/ease-out when starting from or arriving at near-zero speed,
 * clamped to ~1.4 m/s^2 max acceleration. Returns linear `f` when neither end is stopped.
 */
export function smoothStepOnStop(
  f: number,
  startStopped: boolean,
  endStopped: boolean,
  distMetres = 0,
  dtSec = 0,
): number {
  const x = Math.max(0, Math.min(1, f));
  if (!startStopped && !endStopped) return x;
  const m0 = startStopped ? 0 : 1;
  const m1 = endStopped ? 0 : 1;
  const x2 = x * x;
  const x3 = x2 * x;
  const hermite = (3 - 2 * x) * x2 + (x3 - 2 * x2 + x) * m0 + (x3 - x2) * m1;
  let alpha = 1;
  if (distMetres > 0 && dtSec > 0) {
    const peakFactor = startStopped && endStopped ? 6 : 4;
    const rawAccel = (peakFactor * distMetres) / (dtSec * dtSec);
    if (rawAccel > MAX_EASE_ACCEL_MPS2) alpha = MAX_EASE_ACCEL_MPS2 / rawAccel;
  }
  return x + alpha * (hermite - x);
}

function stopFlags(samples: Sample[], idx: number): { startStopped: boolean; endStopped: boolean } {
  const a = samples[idx - 1];
  const b = samples[idx];
  let startStopped = false;
  if (typeof a.speedMps === "number" && Number.isFinite(a.speedMps)) {
    startStopped = a.speedMps < STOP_SPEED_THRESHOLD_MPS;
  } else if (idx >= 2) {
    const prev = samples[idx - 2];
    const dt = (a.t - prev.t) / 1000;
    if (dt > 0) startStopped = planarMetres(prev, a) / dt < STOP_SPEED_THRESHOLD_MPS;
  }
  let endStopped = false;
  if (typeof b.speedMps === "number" && Number.isFinite(b.speedMps)) {
    endStopped = b.speedMps < STOP_SPEED_THRESHOLD_MPS;
  } else if (idx + 1 < samples.length) {
    const next = samples[idx + 1];
    const dt = (next.t - b.t) / 1000;
    if (dt > 0) endStopped = planarMetres(b, next) / dt < STOP_SPEED_THRESHOLD_MPS;
  }
  return { startStopped, endStopped };
}

type SnapMatch = { poly: IndexedPolyline; sA: number; sB: number; alongDist: number } | null;

const MAX_SNAP_CACHE_ENTRIES = 512;
const snapMatchCache = new WeakMap<IndexedPolyline[], Map<string, SnapMatch>>();

function computeSnapMatch(a: Sample, b: Sample, polylines: IndexedPolyline[]): SnapMatch {
  const straightDist = planarMetres(a, b);
  if (straightDist <= 0) return null;
  let bestScore = Infinity;
  let best: SnapMatch = null;
  for (const poly of polylines) {
    const pa = projectOntoPolyline(poly, a.lon, a.lat);
    if (pa.dist > MAX_SNAP_DISTANCE_M) continue;
    const pb = projectOntoPolyline(poly, b.lon, b.lat);
    if (pb.dist > MAX_SNAP_DISTANCE_M) continue;
    const alongDist = Math.abs(pb.s - pa.s);
    if (alongDist < MIN_ALONG_ROUTE_M || alongDist > MAX_DETOUR_RATIO * straightDist) continue;
    const score = pa.dist + pb.dist;
    if (score < bestScore) {
      bestScore = score;
      best = { poly, sA: pa.s, sB: pb.s, alongDist };
    }
  }
  return best;
}

function findSnapMatch(a: Sample, b: Sample, polylines: IndexedPolyline[]): SnapMatch {
  let cache = snapMatchCache.get(polylines);
  if (!cache) {
    cache = new Map<string, SnapMatch>();
    snapMatchCache.set(polylines, cache);
  }
  const key = `${a.lon},${a.lat},${b.lon},${b.lat}`;
  if (cache.has(key)) {
    const hit = cache.get(key) ?? null;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const match = computeSnapMatch(a, b, polylines);
  if (cache.size >= MAX_SNAP_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, match);
  return match;
}

function toIndexedPolylines(routeLines?: number[][][]): IndexedPolyline[] | undefined {
  if (!routeLines?.length) return undefined;
  const out: IndexedPolyline[] = [];
  for (const line of routeLines) {
    const item = indexPolyline(line);
    if (item) out.push(item);
  }
  return out.length ? out : undefined;
}

function interpolateWithPolylines(samples: Sample[], t: number, polylines?: IndexedPolyline[]): GlidePosition | null {
  if (samples.length === 0) return null;
  if (t <= samples[0].t) return { lon: samples[0].lon, lat: samples[0].lat };
  const last = samples[samples.length - 1];
  if (t >= last.t) return { lon: last.lon, lat: last.lat };
  let lo = 1;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const b = samples[i];
  const a = samples[i - 1];
  const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
  const dtSec = (b.t - a.t) / 1000;
  const { startStopped, endStopped } = stopFlags(samples, i);
  if (polylines?.length) {
    const match = findSnapMatch(a, b, polylines);
    if (match) {
      const sf = smoothStepOnStop(f, startStopped, endStopped, match.alongDist, dtSec);
      const s = match.sA + (match.sB - match.sA) * sf;
      return pointAndBearingAtS(match.poly, s, match.sB >= match.sA);
    }
  }
  const straightDist = startStopped || endStopped ? planarMetres(a, b) : 0;
  const sf = smoothStepOnStop(f, startStopped, endStopped, straightDist, dtSec);
  return { lon: a.lon + (b.lon - a.lon) * sf, lat: a.lat + (b.lat - a.lat) * sf };
}

/** Position at time `t` on a track of samples sorted by time. Holds the ends; null for an empty track. */
export function positionAt(samples: Sample[], t: number): { lon: number; lat: number } | null {
  const pos = interpolateWithPolylines(samples, t);
  return pos ? { lon: pos.lon, lat: pos.lat } : null;
}

/**
 * Position and optional tangent bearing at time `t`, snapped onto `routeLines` when consecutive samples
 * both project within 65 m of the same route polyline. Falls back to straight-line interpolation otherwise.
 */
export function snapTrackPosition(
  samples: Sample[],
  t: number,
  routeLines?: number[][][] | IndexedPolyline[],
): GlidePosition | null {
  const polylines =
    routeLines && routeLines.length > 0
      ? Array.isArray(routeLines[0])
        ? toIndexedPolylines(routeLines as number[][][])
        : (routeLines as IndexedPolyline[])
      : undefined;
  return interpolateWithPolylines(samples, t, polylines);
}

function estimateIntervalSpeed(a: Sample, b: Sample, polylines?: IndexedPolyline[]): number | null {
  const dtSec = (b.t - a.t) / 1000;
  if (dtSec <= 0) return null;
  let dist = planarMetres(a, b);
  if (polylines?.length) {
    const match = findSnapMatch(a, b, polylines);
    if (match) dist = match.alongDist;
  }
  return Math.max(0, Math.min(MAX_SPEED_MPS, dist / dtSec));
}

function estimatedSpeedFromIndexed(samples: Sample[], polylines?: IndexedPolyline[]): number | null {
  if (samples.length < 2) return null;
  const n = samples.length;
  const vLast = estimateIntervalSpeed(samples[n - 2], samples[n - 1], polylines);
  if (vLast === null) return null;
  if (n >= 3 && samples[n - 1].t - samples[n - 3].t <= 120_000) {
    const vPrev = estimateIntervalSpeed(samples[n - 3], samples[n - 2], polylines);
    if (vPrev !== null) return 0.7 * vLast + 0.3 * vPrev;
  }
  return vLast;
}

/**
 * Computed fallback speed in m/s from recent GPS samples, using along-route distance when snapped
 * to `routeLines`, clamped to [0, 33] m/s to reject GPS glitches over 120 km/h.
 */
export function estimatedSpeedMps(samples: Sample[], routeLines?: number[][][]): number | null {
  return estimatedSpeedFromIndexed(samples, toIndexedPolylines(routeLines));
}

/** Compass bearing in degrees from a to b (0 north, 90 east). */
export function bearingBetween(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
}

/** Keeps a short track of reports per vehicle. */
export class TrackStore {
  private tracks = new Map<number, Sample[]>();
  private routes: RouteShapeIndex | null = null;

  /** Registers route polylines for street-snapped gliding. */
  setRoutes(routes: RouteShapeIndex | RouteFeatureLike[] | Map<string, number[][][]> | Record<string, number[][][]> | null): void {
    if (!routes) {
      this.routes = null;
      return;
    }
    this.routes = routes instanceof RouteShapeIndex ? routes : new RouteShapeIndex(routes);
  }

  /** Adds a report; ignores repeats of the same report time. */
  add(id: number, s: Sample): void {
    const track = this.tracks.get(id) ?? [];
    const last = track[track.length - 1];
    if (last && s.t <= last.t) {
      if (s.t === last.t) return;
      // late arrival: insert in order
      track.push(s);
      track.sort((x, y) => x.t - y.t);
    } else {
      track.push(s);
    }
    const cutoff = s.t - KEEP_MS;
    while (track.length > 2 && track[0].t < cutoff) track.shift();
    this.tracks.set(id, track);
  }

  /** Drops vehicles not in the latest set. */
  retain(ids: Set<number>): void {
    for (const id of this.tracks.keys()) if (!ids.has(id)) this.tracks.delete(id);
  }

  get(id: number): Sample[] {
    return this.tracks.get(id) ?? [];
  }

  /**
   * Where to draw the vehicle at real time `now`. With glide on, LIVE_LAG_MS behind real time; if the
   * vehicle has only reports newer than the lagged clock (it just appeared), it waits at its first report.
   * With glide off (reduced motion), the latest report.
   */
  displayPosition(
    id: number,
    now: number,
    glide: boolean,
    routeShortName?: string | null,
  ): GlidePosition | null {
    const track = this.get(id);
    if (!glide) {
      const last = track[track.length - 1];
      return last ? { lon: last.lon, lat: last.lat } : null;
    }
    const polylines = this.routes?.getIndexed(routeShortName);
    if (polylines?.length) return interpolateWithPolylines(track, now - LIVE_LAG_MS, polylines);
    return positionAt(track, now - LIVE_LAG_MS);
  }

  /** Smoothed fallback speed in m/s for a vehicle's stored samples. */
  speedFor(id: number, routeShortName?: string | null): number | null {
    return estimatedSpeedFromIndexed(this.get(id), this.routes?.getIndexed(routeShortName));
  }

  ids(): number[] {
    return [...this.tracks.keys()];
  }
}
