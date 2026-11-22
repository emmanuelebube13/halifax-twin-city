// Tests for the t27 tester's findings (22 Nov 2026): no uncaught errors without WebGL, and the lens kept in the
// URL across a switch between 3D and 2D.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasWebGL } from "./profileChoice";
import { threeDDecision } from "./threeD";
import { DEFAULT_VIEW, parseView, serializeView, type ViewState } from "./url";

describe("switching between 3D and 2D keeps the lens and the story state", () => {
  for (const lens of ["live", "replay", "analytics"] as const) {
    it(`keeps lens=${lens}`, () => {
      const in3d: ViewState = { ...DEFAULT_VIEW, story: "TRN-Q01", lens, sel: { kind: "asset", id: 744 }, route: "9B", view: "3d" };
      const url3d = serializeView(in3d);
      expect(url3d).toContain(`lens=${lens}`);
      // the switch changes only the view
      const in2d = { ...parseView(url3d), view: "2d" as const };
      const url2d = serializeView(in2d);
      expect(url2d).toContain(`lens=${lens}`);
      expect(parseView(url2d)).toEqual({ ...in3d, view: "2d" });
    });
  }
  it("keeps the City view's URL short", () => {
    expect(serializeView({ ...DEFAULT_VIEW, view: "3d" })).toBe("?view=3d");
  });
});

describe("without WebGL the app stays in 2D, quietly", () => {
  it("detects that WebGL is missing (this test runner has none) and refuses 3D with a reason", () => {
    expect(hasWebGL()).toBe(false);
    expect(threeDDecision({ three_d_available: true, cesium_ion_token: "x", noIon: false, webgl: hasWebGL(), failed: null })).toEqual({ available: false, reason: "no-webgl" });
  });
  it("catches the map and 3D viewer constructors instead of letting them throw", () => {
    const map = readFileSync(join(__dirname, "..", "map", "MapView.tsx"), "utf8");
    expect(map).toMatch(/try \{\s*map = new maplibregl\.Map\(/);
    expect(map).toMatch(/onMapFailed\?\.\(\)/);
    const globe = readFileSync(join(__dirname, "..", "map", "Globe3D.tsx"), "utf8");
    expect(globe).toMatch(/try \{\s*viewer = new C\.Viewer\(/);
    expect(globe).toMatch(/showRenderLoopErrors: false/);
    expect(globe).toMatch(/renderError\.addEventListener/);
  });
});
