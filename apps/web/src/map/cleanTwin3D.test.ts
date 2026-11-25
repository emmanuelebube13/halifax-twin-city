import { describe, expect, it } from "vitest";
import {
  cellKeyFor,
  interpolateGridHeight,
  normalizeArcgisBuildings,
  normalizeArcgisStreets,
  normalizeArcgisTrees,
  shouldShowCleanTwin,
  type ElevationGrid,
} from "./cleanTwin3D";

describe("shouldShowCleanTwin", () => {
  it("never activates in photo mode", () => {
    expect(shouldShowCleanTwin("photo", 50, false)).toBe(false);
    expect(shouldShowCleanTwin("photo", 50, true)).toBe(false);
  });

  it("applies auto hysteresis around 360 m and 420 m", () => {
    expect(shouldShowCleanTwin("auto", 360, false)).toBe(true);
    expect(shouldShowCleanTwin("auto", 361, false)).toBe(false);
    expect(shouldShowCleanTwin("auto", 400, true)).toBe(true);
    expect(shouldShowCleanTwin("auto", 420, true)).toBe(true);
    expect(shouldShowCleanTwin("auto", 421, true)).toBe(false);
  });

  it("applies clean hysteresis around 1250 m and 1400 m", () => {
    expect(shouldShowCleanTwin("clean", 1250, false)).toBe(true);
    expect(shouldShowCleanTwin("clean", 1251, false)).toBe(false);
    expect(shouldShowCleanTwin("clean", 1320, true)).toBe(true);
    expect(shouldShowCleanTwin("clean", 1400, true)).toBe(true);
    expect(shouldShowCleanTwin("clean", 1401, true)).toBe(false);
  });
});

describe("cellKeyFor", () => {
  it("snaps Halifax coordinates to a 0.008 x 0.006 neighbourhood cell", () => {
    const a = cellKeyFor(-63.5918, 44.6606);
    const b = cellKeyFor(-63.5901, 44.6592);
    expect(a.key).toBe(b.key);
    expect(a.bbox).toEqual(b.bbox);
    const [west, south, east, north] = a.bbox;
    expect(east - west).toBeCloseTo(0.008, 6);
    expect(north - south).toBeCloseTo(0.006, 6);
    expect(-63.5918).toBeGreaterThanOrEqual(west);
    expect(-63.5918).toBeLessThanOrEqual(east);
    expect(44.6606).toBeGreaterThanOrEqual(south);
    expect(44.6606).toBeLessThanOrEqual(north);
    expect(a.centre[0]).toBeCloseTo((west + east) * 0.5, 6);
    expect(a.centre[1]).toBeCloseTo((south + north) * 0.5, 6);
  });
});

describe("interpolateGridHeight", () => {
  const grid: ElevationGrid = {
    west: -63.6,
    south: 44.65,
    east: -63.58,
    north: 44.67,
    cols: 2,
    rows: 2,
    heights: [10, 20, 30, 40],
  };

  it("returns fallback when grid is null or empty", () => {
    expect(interpolateGridHeight(null, -63.59, 44.66)).toBe(-18);
    expect(interpolateGridHeight({ ...grid, heights: [] }, -63.59, 44.66, -12)).toBe(-12);
  });

  it("bilinearly interpolates heights and clamps outside bounds", () => {
    expect(interpolateGridHeight(grid, -63.6, 44.65)).toBeCloseTo(10, 6);
    expect(interpolateGridHeight(grid, -63.58, 44.65)).toBeCloseTo(20, 6);
    expect(interpolateGridHeight(grid, -63.6, 44.67)).toBeCloseTo(30, 6);
    expect(interpolateGridHeight(grid, -63.58, 44.67)).toBeCloseTo(40, 6);
    expect(interpolateGridHeight(grid, -63.59, 44.66)).toBeCloseTo(25, 6);
    expect(interpolateGridHeight(grid, -64.0, 44.0)).toBeCloseTo(10, 6);
    expect(interpolateGridHeight(grid, -63.0, 45.0)).toBeCloseTo(40, 6);
  });
});

describe("normalizeArcgisBuildings", () => {
  it("classifies small residential footprints with pitched roofs and large commercial footprints with flat roofs", () => {
    const residentialRing = [
      [-63.592, 44.66],
      [-63.5919, 44.66],
      [-63.5919, 44.6601],
      [-63.592, 44.6601],
      [-63.592, 44.66],
    ];
    const commercialRing = [
      [-63.591, 44.66],
      [-63.5906, 44.66],
      [-63.5906, 44.6602],
      [-63.591, 44.6602],
      [-63.591, 44.66],
    ];
    const out = normalizeArcgisBuildings(
      [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [residentialRing] },
          properties: { OBJECTID: 10, CIVIC_NUM: "5514", STREET_NAME: "Fuller Terrace" },
        },
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [commercialRing] },
          properties: { OBJECTID: 20, CIVIC_ADDRESS: "2500 Gottingen Street", BLDG_USE: "Commercial" },
        },
      ],
      44.66,
    );

    expect(out).toHaveLength(2);
    expect(out[0].roof_type).toBe("hip");
    expect(out[0].eave_height_m).toBeLessThan(out[0].height_m);
    expect(out[0].civic_address).toBe("5514 Fuller Terrace");

    expect(out[1].roof_type).toBe("flat");
    expect(out[1].eave_height_m).toBe(out[1].height_m);
    expect(out[1].civic_address).toBe("2500 Gottingen Street");
  });
});

describe("normalizeArcgisStreets", () => {
  it("marks Gottingen Street with a bus lane and gives arterials wider geometry", () => {
    const out = normalizeArcgisStreets([
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-63.59, 44.659],
            [-63.591, 44.662],
          ],
        },
        properties: { OBJECTID: 1, FULL_NAME: "Gottingen Street", ROAD_CLASS: "Major Arterial" },
      },
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-63.592, 44.66],
            [-63.593, 44.661],
          ],
        },
        properties: { OBJECTID: 2, STREET_NAME: "Fuller Terrace", ROAD_CLASS: "Local" },
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: "Gottingen Street",
      width_m: 14,
      sidewalk_width_m: 2.4,
      transit_corridor: true,
      bus_lane: true,
    });
    expect(out[1]).toMatchObject({
      name: "Fuller Terrace",
      width_m: 10,
      sidewalk_width_m: 1.8,
      transit_corridor: false,
      bus_lane: false,
    });
  });
});

describe("normalizeArcgisTrees", () => {
  it("normalizes DBH to clamped height and crown radius and assigns spruce foliage tone", () => {
    const out = normalizeArcgisTrees([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-63.592, 44.6605] },
        properties: { OBJECTID: 7, COMMON_NAME: "Atlantic Spruce", DBH: 40 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-63.591, 44.6606] },
        properties: { OBJECTID: 8, SPECIES: "Red Oak", DBH: 100 },
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "TRE-7",
      species: "Atlantic Spruce",
      foliage_tone: "#2d543e",
      height_m: 12.1,
      crown_radius_m: 4.2,
    });
    expect(out[1]).toMatchObject({
      id: "TRE-8",
      height_m: 15.5,
      crown_radius_m: 5.0,
    });
  });
});
