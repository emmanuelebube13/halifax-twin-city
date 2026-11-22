// Camera maths shared by the 2D map and the 3D view, so switching keeps the place: the point in the middle of
// the screen, how much of the city is in view, the compass bearing and the tilt.

/** The place on screen, in 2D terms (MapLibre). */
export interface Place {
  lon: number;
  lat: number;
  zoom: number;
  bearing: number; // degrees clockwise from north
  pitch: number; // degrees from straight down (0) towards the horizon (85)
}

/** The 3D camera, as an orbit around a target point on the ground. */
export interface Orbit {
  lon: number;
  lat: number;
  range: number; // metres from the camera to the target
  heading: number; // degrees clockwise from north
  pitch: number; // degrees, -90 straight down, 0 level
}

const EARTH_CIRCUMFERENCE = 40_075_016.686;
/** Cesium's default vertical field of view is 60 degrees. */
export const FOV_DEG = 60;

/** Ground metres per screen pixel at a MapLibre zoom (512 px tiles). */
export function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Camera distance that shows the same ground height as the 2D map does at this zoom. */
export function rangeForZoom(lat: number, zoom: number, viewportHeightPx: number, fovDeg = FOV_DEG): number {
  const visible = metresPerPixel(lat, zoom) * viewportHeightPx;
  return visible / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

export function zoomForRange(lat: number, range: number, viewportHeightPx: number, fovDeg = FOV_DEG): number {
  const visible = 2 * range * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const mpp = visible / viewportHeightPx;
  return Math.log2((EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * mpp));
}

export function placeToOrbit(p: Place, viewportHeightPx: number): Orbit {
  return clampOrbit({
    lon: p.lon,
    lat: p.lat,
    range: rangeForZoom(p.lat, p.zoom, viewportHeightPx),
    heading: normaliseDeg(p.bearing),
    pitch: p.pitch - 90,
  });
}

export function orbitToPlace(o: Orbit, viewportHeightPx: number): Place {
  return {
    lon: o.lon,
    lat: o.lat,
    zoom: Math.min(20, Math.max(9, zoomForRange(o.lat, o.range, viewportHeightPx))),
    bearing: normaliseDeg(o.heading),
    pitch: Math.min(85, Math.max(0, o.pitch + 90)),
  };
}

export function normaliseDeg(d: number): number {
  const x = d % 360;
  return x < 0 ? x + 360 : x;
}

/** Where the 3D camera may go: Halifax only, never to space, never underground, never above the horizon. */
export const CAMERA_LIMITS = {
  west: -64.3,
  east: -62.9,
  south: 44.3,
  north: 45.1,
  minRange: 40, // metres from the target: close enough to read a bus, not inside it
  maxRange: 25_000, // the whole municipality core, no further
  minHeight: 25, // metres above the ellipsoid surface under the camera: never underground
  maxHeight: 20_000,
  minPitch: -90,
  maxPitch: -8, // keep a little tilt down so the horizon never fills the screen
};

export function clampOrbit(o: Orbit): Orbit {
  const L = CAMERA_LIMITS;
  return {
    lon: Math.min(L.east, Math.max(L.west, o.lon)),
    lat: Math.min(L.north, Math.max(L.south, o.lat)),
    range: Math.min(L.maxRange, Math.max(L.minRange, o.range)),
    heading: normaliseDeg(o.heading),
    pitch: Math.min(L.maxPitch, Math.max(L.minPitch, o.pitch)),
  };
}

/** Camera height above the ground for an orbit: range times the sine of the downward tilt. */
export function orbitHeight(o: Orbit): number {
  return o.range * Math.sin((-o.pitch * Math.PI) / 180);
}

/** Clamps a free camera position (after a user drag) to the limits. Returns null when no change is needed. */
export function clampCameraPosition(c: { lon: number; lat: number; height: number }): { lon: number; lat: number; height: number } | null {
  const L = CAMERA_LIMITS;
  const lon = Math.min(L.east, Math.max(L.west, c.lon));
  const lat = Math.min(L.north, Math.max(L.south, c.lat));
  const height = Math.min(L.maxHeight, Math.max(L.minHeight, c.height));
  if (lon === c.lon && lat === c.lat && height === c.height) return null;
  return { lon, lat, height };
}

/**
 * The opening 3D view: from over the harbour, looking north-west across downtown to the Citadel, tilted so the
 * buildings stand up and the street grid still reads.
 */
export const HALIFAX_3D_START: Orbit = { lon: -63.5745, lat: 44.6465, range: 2600, heading: 300, pitch: -35 };
