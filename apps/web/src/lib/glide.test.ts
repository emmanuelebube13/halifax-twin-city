import { describe, expect, it } from "vitest";
import { LIVE_LAG_MS, TrackStore, bearingBetween, positionAt } from "./glide";

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
