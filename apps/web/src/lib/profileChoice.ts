// The small part of the 3D device profiles that the 2D app needs: the user's saved choice and a WebGL check.
// Everything else (the profile table, the automatic choice) lives in the lazily loaded 3D chunk.

export type ProfileName = "high" | "medium" | "low";

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

/** Is WebGL there at all? Checked only when the user asks for 3D, so 2D start-up never opens a GL context. */
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
