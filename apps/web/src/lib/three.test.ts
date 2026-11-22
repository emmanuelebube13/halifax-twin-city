// Tests for the 3D view's pure parts: device profiles, camera limits, 2D and 3D place conversion, the view in
// the URL, and the fallback decision.
import { describe, expect, it } from "vitest";
import { CAMERA_LIMITS, clampCameraPosition, clampOrbit, orbitHeight, orbitToPlace, placeToOrbit, rangeForZoom, zoomForRange } from "./camera";
import { PROFILES, chooseProfile, resolutionScaleFor, type DeviceHints } from "./profile";
import { threeDDecision } from "./threeD";
import { DEFAULT_VIEW, parseView, serializeView } from "./url";

const desk: DeviceHints = { renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)", deviceMemory: 8, hardwareConcurrency: 24, screenWidth: 2560, screenHeight: 1440, coarsePointer: false, devicePixelRatio: 1 };

describe("device profiles", () => {
  it("gives a workstation with a discrete GPU the high profile", () => {
    expect(chooseProfile(desk)).toBe("high");
  });
  it("gives a mid-range laptop the medium profile", () => {
    expect(chooseProfile({ ...desk, renderer: "ANGLE (AMD, AMD Radeon RX 6500M)", deviceMemory: 8, hardwareConcurrency: 6 })).toBe("medium");
  });
  it("gives phones, integrated and software GPUs the low profile", () => {
    expect(chooseProfile({ ...desk, coarsePointer: true, screenWidth: 390, screenHeight: 844, renderer: "Apple GPU" })).toBe("low");
    expect(chooseProfile({ ...desk, renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)" })).toBe("low");
    expect(chooseProfile({ ...desk, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" })).toBe("low");
    expect(chooseProfile({ ...desk, renderer: null, hardwareConcurrency: 4 })).toBe("low");
  });
  it("turns shadows, lighting and anti-aliasing off on low", () => {
    const low = PROFILES.low;
    expect([low.shadows, low.lighting, low.fxaa, low.msaaSamples]).toEqual([false, false, false, 1]);
    expect(PROFILES.low.maximumScreenSpaceError).toBeGreaterThan(PROFILES.medium.maximumScreenSpaceError);
    expect(PROFILES.medium.maximumScreenSpaceError).toBeGreaterThan(PROFILES.high.maximumScreenSpaceError);
  });
  it("caps the pixel ratio", () => {
    expect(resolutionScaleFor(3, 1)).toBeCloseTo(1 / 3);
    expect(resolutionScaleFor(1, 2)).toBe(1);
  });
});

describe("camera limits", () => {
  it("never flies to space, never goes underground and stays over Halifax", () => {
    const o = clampOrbit({ lon: -70, lat: 50, range: 10_000_000, heading: -30, pitch: 20 });
    expect(o.lon).toBe(CAMERA_LIMITS.west);
    expect(o.lat).toBe(CAMERA_LIMITS.north);
    expect(o.range).toBe(CAMERA_LIMITS.maxRange);
    expect(o.heading).toBe(330);
    expect(o.pitch).toBeLessThanOrEqual(CAMERA_LIMITS.maxPitch);
    expect(clampOrbit({ lon: -63.58, lat: 44.65, range: 2, heading: 0, pitch: -45 }).range).toBe(CAMERA_LIMITS.minRange);
  });
  it("lifts a camera that dropped below the ground", () => {
    expect(clampCameraPosition({ lon: -63.58, lat: 44.65, height: -10 })?.height).toBe(CAMERA_LIMITS.minHeight);
    expect(clampCameraPosition({ lon: -63.58, lat: 44.65, height: 900 })).toBeNull();
    expect(clampCameraPosition({ lon: -63.58, lat: 44.65, height: 1e7 })?.height).toBe(CAMERA_LIMITS.maxHeight);
  });
  it("computes the height of an orbit", () => {
    expect(orbitHeight({ lon: 0, lat: 0, range: 1000, heading: 0, pitch: -90 })).toBeCloseTo(1000);
    expect(orbitHeight({ lon: 0, lat: 0, range: 1000, heading: 0, pitch: -30 })).toBeCloseTo(500);
  });
});

describe("switching between 2D and 3D keeps the place", () => {
  it("converts zoom to camera range and back", () => {
    const r = rangeForZoom(44.65, 14, 800);
    expect(zoomForRange(44.65, r, 800)).toBeCloseTo(14, 6);
  });
  it("round-trips centre, zoom, bearing and pitch", () => {
    const place = { lon: -63.58, lat: 44.65, zoom: 14.5, bearing: 30, pitch: 50 };
    const back = orbitToPlace(placeToOrbit(place, 800), 800);
    expect(back.lon).toBeCloseTo(place.lon);
    expect(back.lat).toBeCloseTo(place.lat);
    expect(back.zoom).toBeCloseTo(place.zoom, 4);
    expect(back.bearing).toBeCloseTo(30);
    expect(back.pitch).toBeCloseTo(50);
  });
  it("maps a flat 2D view to a camera looking straight down", () => {
    expect(placeToOrbit({ lon: -63.58, lat: 44.65, zoom: 13, bearing: 0, pitch: 0 }, 800).pitch).toBe(-90);
  });
});

describe("view in the URL", () => {
  it("keeps 3D with the story, lens and selection", () => {
    const v = { ...DEFAULT_VIEW, story: "TRN-Q01", lens: "live" as const, sel: { kind: "asset" as const, id: 744 }, view: "3d" as const };
    expect(serializeView(v)).toBe("?story=TRN-Q01&sel=asset%3A744&view=3d");
    expect(parseView(serializeView(v))).toEqual(v);
  });
});

describe("3D fallback", () => {
  const ok = { three_d_available: true, cesium_ion_token: "x", noIon: false, webgl: true, failed: null };
  it("offers 3D only with WebGL and a token from the API", () => {
    expect(threeDDecision(ok)).toEqual({ available: true, reason: null });
    expect(threeDDecision({ ...ok, webgl: false }).reason).toBe("no-webgl");
    expect(threeDDecision({ ...ok, three_d_available: false, cesium_ion_token: null }).reason).toBe("no-token");
  });
  it("falls back to 2D after a failure, with its reason", () => {
    expect(threeDDecision({ ...ok, failed: "tiles" })).toEqual({ available: false, reason: "tiles" });
    expect(threeDDecision({ ...ok, failed: "token-refused" }).reason).toBe("token-refused");
  });
  it("lets the developer globe (no ion) run without a token", () => {
    expect(threeDDecision({ ...ok, three_d_available: false, cesium_ion_token: null, noIon: true }).available).toBe(true);
  });
});
