import { describe, expect, it } from "vitest";
import {
  LIVE_LAG_MS,
  RouteShapeIndex,
  TrackStore,
  bearingBetween,
  estimatedSpeedMps,
  positionAt,
  smoothStepOnStop,
  snapTrackPosition,
} from "./glide";

describe("glide between reports", () => {
  const a = { t: 0, lon: -63.6, lat: 44.6 };
  const b = { t: 30_000, lon: -63.5, lat: 44.7 };
  it("interpolates on the line between two reports", () => {
    const p = positionAt([a, b], 15_000)!;
    expect(p.lon).toBeCloseTo(-63.55);
    expect(p.lat).toBeCloseTo(44.65);
  });
  it("holds the ends", () => {
    expect(positionAt([a, b], -5)).toEqual({ lon: a.lon, lat: a.lat });
    expect(positionAt([a, b], 99_000)).toEqual({ lon: b.lon, lat: b.lat });
    expect(positionAt([], 0)).toBeNull();
  });
  it("draws a bus 60 s behind real time", () => {
    const s = new TrackStore();
    s.add(1, a);
    s.add(1, b);
    expect(s.displayPosition(1, 15_000 + LIVE_LAG_MS, true)!.lon).toBeCloseTo(-63.55);
  });
  it("jumps to the latest report when motion is reduced", () => {
    const s = new TrackStore();
    s.add(1, a);
    s.add(1, b);
    expect(s.displayPosition(1, 15_000, false)).toEqual({ lon: b.lon, lat: b.lat });
  });
  it("ignores repeated reports and forgets vehicles that left", () => {
    const s = new TrackStore();
    s.add(1, a);
    s.add(1, a);
    s.add(2, b);
    expect(s.get(1)).toHaveLength(1);
    s.retain(new Set([2]));
    expect(s.ids()).toEqual([2]);
  });
  it("computes compass bearings", () => {
    expect(bearingBetween({ lon: 0, lat: 0 }, { lon: 1, lat: 0 })).toBeCloseTo(90);
    expect(bearingBetween({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(0);
  });
});

describe("route-snapped movement around street corners", () => {
  // L-shaped route: North St northwards to Gottingen St corner, then eastwards.
  const corner: [number, number] = [-63.5860, 44.6550];
  const lRoute: number[][][] = [[
    [-63.5860, 44.6530], // south start (~221 m south of corner)
    corner,
    [-63.5830, 44.6550], // east end (~238 m east of corner)
  ]];

  it("keeps a bus turning a 90-degree corner on the street instead of cutting across blocks", () => {
    const p1 = { t: 0, lon: -63.5860, lat: 44.6530 };
    const p2 = { t: 30_000, lon: -63.5830, lat: 44.6550 };

    // Before the corner: travels due north along North St (lon stays at -63.5860, bearing ~0).
    const beforeCorner = snapTrackPosition([p1, p2], 7_500, lRoute)!;
    expect(beforeCorner.lon).toBeCloseTo(-63.5860, 5);
    expect(beforeCorner.lat).toBeLessThan(corner[1]);
    expect(beforeCorner.bearing).toBeCloseTo(0, 0);

    // Near the midpoint of the path: stays near the L-corner rather than cutting diagonally through (-63.5845, 44.6540).
    const atCorner = snapTrackPosition([p1, p2], 14_500, lRoute)!;
    expect(Math.abs(atCorner.lon - (-63.5845))).toBeGreaterThan(0.001);
    expect(atCorner.lat).toBeCloseTo(corner[1], 3);

    // After the corner: travels due east along Gottingen St (lat stays at 44.6550, bearing ~90).
    const afterCorner = snapTrackPosition([p1, p2], 22_500, lRoute)!;
    expect(afterCorner.lat).toBeCloseTo(44.6550, 5);
    expect(afterCorner.lon).toBeGreaterThan(corner[0]);
    expect(afterCorner.bearing).toBeCloseTo(90, 0);
  });

  it("supports TrackStore.setRoutes with GeoJSON features and reverse travel direction", () => {
    const store = new TrackStore();
    store.setRoutes([
      {
        geometry: { type: "LineString", coordinates: lRoute[0] },
        properties: { route_short_name: "7A" },
      },
    ]);
    // Bus running inbound (east -> corner -> south)
    store.add(10, { t: 0, lon: -63.5830, lat: 44.6550 });
    store.add(10, { t: 30_000, lon: -63.5860, lat: 44.6530 });

    const eastLeg = store.displayPosition(10, 7_500 + LIVE_LAG_MS, true, "7A")!;
    expect(eastLeg.lat).toBeCloseTo(44.6550, 5);
    expect(eastLeg.bearing).toBeCloseTo(270, 0);

    const southLeg = store.displayPosition(10, 22_500 + LIVE_LAG_MS, true, "7A")!;
    expect(southLeg.lon).toBeCloseTo(-63.5860, 5);
    expect(southLeg.bearing).toBeCloseTo(180, 0);
  });

  it("produces identical results with pre-indexed polylines and raw route arrays", () => {
    const idx = new RouteShapeIndex({ "7A": lRoute });
    const raw = idx.get("7A")!;
    const indexed = idx.getIndexed("7A")!;
    const samples = [
      { t: 0, lon: -63.5860, lat: 44.6530 },
      { t: 15_000, lon: -63.5860, lat: 44.6550 },
      { t: 30_000, lon: -63.5830, lat: 44.6550 },
    ];
    for (const t of [0, 5_000, 14_500, 15_000, 22_500, 30_000]) {
      expect(snapTrackPosition(samples, t, indexed)).toEqual(snapTrackPosition(samples, t, raw));
    }
  });

  it("falls back to straight-line interpolation when off-route (beyond 65 m)", () => {
    const offA = { t: 0, lon: -63.5900, lat: 44.6530 }; // > 300 m west of lRoute
    const offB = { t: 30_000, lon: -63.5900, lat: 44.6550 };
    const idx = new RouteShapeIndex({ "7A": lRoute });
    const store = new TrackStore();
    store.setRoutes(idx);
    store.add(20, offA);
    store.add(20, offB);
    const p = store.displayPosition(20, 15_000 + LIVE_LAG_MS, true, "7A")!;
    expect(p.lon).toBeCloseTo(-63.5900, 6);
    expect(p.lat).toBeCloseTo(44.6540, 6);
    expect(p.bearing).toBeUndefined();
  });
});

describe("stop ease-in/ease-out and estimatedSpeedMps", () => {
  it("eases gently out of a stop and into a stop while keeping linear midpoint symmetric", () => {
    expect(smoothStepOnStop(0.25, false, false)).toBeCloseTo(0.25);
    expect(smoothStepOnStop(0.25, true, false, 200, 30)).toBeLessThan(0.25);
    expect(smoothStepOnStop(0.75, false, true, 200, 30)).toBeGreaterThan(0.75);
    expect(smoothStepOnStop(0.5, true, true, 200, 30)).toBeCloseTo(0.5);

    // Consecutive GPS pings with speedMps=0 at start ease the bus out gently
    const s1 = { t: 0, lon: -63.5860, lat: 44.6530, speedMps: 0 };
    const s2 = { t: 30_000, lon: -63.5860, lat: 44.6550, speedMps: 10 };
    const pQuarter = positionAt([s1, s2], 7_500)!;
    expect(pQuarter.lat).toBeLessThan(44.6535);
  });

  it("computes realistic fallback speed along route and clamps GPS outliers", () => {
    const lRoute: number[][][] = [[
      [-63.5860, 44.6530],
      [-63.5860, 44.6550],
      [-63.5830, 44.6550],
    ]];
    // Around the corner: ~221 m + ~238 m = ~459 m in 30 s => ~15.3 m/s (faster than straight-line ~11.1 m/s)
    const s1 = { t: 0, lon: -63.5860, lat: 44.6530 };
    const s2 = { t: 30_000, lon: -63.5830, lat: 44.6550 };
    const snappedSpeed = estimatedSpeedMps([s1, s2], lRoute)!;
    const straightSpeed = estimatedSpeedMps([s1, s2])!;
    expect(snappedSpeed).toBeGreaterThan(straightSpeed);
    expect(snappedSpeed).toBeCloseTo(15.3, 0);

    // GPS glitch jumping 5 km in 5 s -> clamped to 33 m/s
    const glitch = estimatedSpeedMps([
      { t: 0, lon: -63.60, lat: 44.65 },
      { t: 5_000, lon: -63.53, lat: 44.65 },
    ])!;
    expect(glitch).toBe(33);

    // Single or zero-dt samples return null
    expect(estimatedSpeedMps([s1])).toBeNull();
    expect(estimatedSpeedMps([s1, { ...s1 }])).toBeNull();
  });
});
