// Whether the 3D view may run, and why not. The 2D map is never worse off: any "no" keeps or returns the
// user to 2D with a short note.

export type ThreeDFailure = "no-webgl" | "no-token" | "token-refused" | "tiles" | "load" | "timeout";

export interface ThreeDInput {
  three_d_available: boolean;
  /** Only used to see that it is there; never stored, logged or shown. */
  cesium_ion_token: string | null;
  /** Developer mode: Cesium's plain globe without Google tiles, so 3D work spends no ion requests. */
  noIon: boolean;
  webgl: boolean;
  failed: ThreeDFailure | null;
}

export function threeDDecision(i: ThreeDInput): { available: boolean; reason: ThreeDFailure | null } {
  if (!i.webgl) return { available: false, reason: "no-webgl" };
  if (i.failed) return { available: false, reason: i.failed };
  if (i.noIon) return { available: true, reason: null };
  if (!i.three_d_available || !i.cesium_ion_token) return { available: false, reason: "no-token" };
  return { available: true, reason: null };
}
