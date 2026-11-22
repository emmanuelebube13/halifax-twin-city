// 3D device profiles. Chosen once at start from GPU and device hints, and switchable by the user.
// high: workstation with a discrete GPU. medium: mid-range laptop. low: phone, integrated or software GPU.

export type ProfileName = "high" | "medium" | "low";

export interface DeviceHints {
  /** WebGL UNMASKED_RENDERER string, if the browser shares it. */
  renderer: string | null;
  /** navigator.deviceMemory in GB (Chromium only; capped at 8 by the browser). */
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
  screenWidth: number;
  screenHeight: number;
  coarsePointer: boolean;
  devicePixelRatio: number;
}

export interface Profile3D {
  name: ProfileName;
  /** Tileset maximumScreenSpaceError: higher draws coarser tiles, faster. */
  maximumScreenSpaceError: number;
  /** Highest device pixel ratio rendered; the rest is upscaled by the browser. */
  maxPixelRatio: number;
  /** Tile cache in bytes (Cesium3DTileset cacheBytes). */
  cacheBytes: number;
  preloadWhenHidden: boolean;
  preloadFlightDestinations: boolean;
  loadSiblings: boolean;
  skipLevelOfDetail: boolean;
  fog: boolean;
  shadows: boolean;
  lighting: boolean;
  fxaa: boolean;
  msaaSamples: number;
  /** Distance limits for the three bus levels: near model, mid model, then the flat pin. */
  nearModelMetres: number;
  midModelMetres: number;
}

const MB = 1024 * 1024;

export const PROFILES: Record<ProfileName, Profile3D> = {
  high: {
    name: "high",
    maximumScreenSpaceError: 8,
    maxPixelRatio: 2,
    cacheBytes: 1024 * MB,
    preloadWhenHidden: true,
    preloadFlightDestinations: true,
    loadSiblings: true,
    skipLevelOfDetail: false,
    fog: true,
    shadows: false,
    lighting: true,
    fxaa: true,
    msaaSamples: 4,
    nearModelMetres: 600,
    midModelMetres: 3000,
  },
  medium: {
    name: "medium",
    maximumScreenSpaceError: 16,
    maxPixelRatio: 1.5,
    cacheBytes: 512 * MB,
    preloadWhenHidden: false,
    preloadFlightDestinations: true,
    loadSiblings: false,
    skipLevelOfDetail: true,
    fog: true,
    shadows: false,
    lighting: false,
    fxaa: true,
    msaaSamples: 1,
    nearModelMetres: 400,
    midModelMetres: 2000,
  },
  low: {
    name: "low",
    maximumScreenSpaceError: 24,
    maxPixelRatio: 1,
    cacheBytes: 256 * MB,
    preloadWhenHidden: false,
    preloadFlightDestinations: false,
    loadSiblings: false,
    skipLevelOfDetail: true,
    fog: true,
    shadows: false,
    lighting: false,
    fxaa: false,
    msaaSamples: 1,
    nearModelMetres: 250,
    midModelMetres: 1200,
  },
};

const SOFTWARE = /swiftshader|llvmpipe|software|microsoft basic render/i;
const INTEGRATED = /intel|iris|uhd graphics|hd graphics|mali|adreno|powervr|apple gpu|apple m\d|radeon\(tm\) graphics|vega \d+ graphics|videocore/i;
const DISCRETE = /nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|arc a\d/i;

/** Picks a profile from device hints. Phones and software or integrated GPUs get low. */
export function chooseProfile(h: DeviceHints): ProfileName {
  const shortSide = Math.min(h.screenWidth, h.screenHeight);
  const renderer = h.renderer ?? "";
  if (SOFTWARE.test(renderer)) return "low";
  if (h.coarsePointer && shortSide < 800) return "low";
  if (shortSide < 600) return "low";
  if (h.deviceMemory !== null && h.deviceMemory <= 2) return "low";
  if (INTEGRATED.test(renderer) && !DISCRETE.test(renderer)) return "low";
  if (h.hardwareConcurrency !== null && h.hardwareConcurrency <= 4) return "low";
  if (DISCRETE.test(renderer) && (h.deviceMemory ?? 8) >= 8 && (h.hardwareConcurrency ?? 8) >= 8) return "high";
  return "medium";
}

/** Reads the hints from the browser. The WebGL context is thrown away straight after. */
export function readDeviceHints(): DeviceHints {
  let renderer: string | null = null;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    renderer = null;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    renderer,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    screenWidth: window.screen?.width ?? window.innerWidth,
    screenHeight: window.screen?.height ?? window.innerHeight,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/** Is WebGL there at all? 3D needs it; without it the app stays in 2D. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Cesium resolutionScale for a pixel-ratio cap: rendering at min(dpr, cap). */
export function resolutionScaleFor(devicePixelRatio: number, maxPixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, maxPixelRatio) / dpr;
}

const PROFILE_KEY = "halifax-twin.profile3d";

/** The user's own choice, if they made one in this browser. */
export function savedProfile(): ProfileName | null {
  try {
    const v = localStorage.getItem(PROFILE_KEY);
    return v === "high" || v === "medium" || v === "low" ? v : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: ProfileName | null): void {
  try {
    if (p) localStorage.setItem(PROFILE_KEY, p);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}
