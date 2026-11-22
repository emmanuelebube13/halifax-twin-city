import { describe, expect, it } from "vitest";
import { STATUS_SHAPE, busStatus, countByStatus, layerFreshness, onTimeRuleFrom, statusFromDelay } from "./status";

describe("on-time rule (interim: 60 s early to 300 s late)", () => {
  it("is on time inside the window, inclusive", () => {
    expect(statusFromDelay(0)).toBe("on_time");
    expect(statusFromDelay(300)).toBe("on_time");
    expect(statusFromDelay(-60)).toBe("on_time");
  });
  it("is late past 300 s and early before 60 s", () => {
    expect(statusFromDelay(301)).toBe("late");
    expect(statusFromDelay(-61)).toBe("early");
  });
  it("is unknown with no delay", () => {
    expect(statusFromDelay(null)).toBe("unknown");
  });
  it("prefers the status the API gives", () => {
    expect(busStatus("late", 0)).toBe("late");
    expect(busStatus("unknown", 400)).toBe("late");
  });
  it("reads the rule from client-config business rules", () => {
    expect(onTimeRuleFrom({ on_time: { early_seconds: 30, late_seconds: 120 } })).toEqual({ earlySeconds: 30, lateSeconds: 120 });
    expect(onTimeRuleFrom(undefined)).toEqual({ earlySeconds: 60, lateSeconds: 300 });
  });
});

describe("status shapes", () => {
  it("give every status its own shape, so colour never works alone", () => {
    expect(STATUS_SHAPE).toEqual({ on_time: "disc", late: "diamond", early: "ring", unknown: "square" });
    expect(new Set(Object.values(STATUS_SHAPE)).size).toBe(4);
  });
  it("count buses by status", () => {
    expect(countByStatus(["on_time", "late", "late", "early"])).toEqual({ on_time: 1, late: 2, early: 1, unknown: 0 });
  });
});

describe("layer freshness", () => {
  const now = Date.parse("2026-11-21T23:42:00Z");
  it("is fresh inside 2 minutes and stale after", () => {
    expect(layerFreshness({ asOf: "2026-11-21T23:41:00Z", now, staleAfterSeconds: 120 })).toBe("fresh");
    expect(layerFreshness({ asOf: "2026-11-21T23:39:00Z", now, staleAfterSeconds: 120 })).toBe("stale");
  });
  it("is down when the request failed or a source is down", () => {
    expect(layerFreshness({ asOf: "2026-11-21T23:41:00Z", now, staleAfterSeconds: 120, failed: true })).toBe("down");
    expect(layerFreshness({ asOf: "2026-11-21T23:41:00Z", now, staleAfterSeconds: 120, sources: [{ status: "down" }] })).toBe("down");
  });
  it("is empty before any data", () => {
    expect(layerFreshness({ asOf: null, now, staleAfterSeconds: 120 })).toBe("empty");
  });
  it("never goes stale on age for periodic layers", () => {
    expect(layerFreshness({ asOf: "2026-11-01T00:00:00Z", now, staleAfterSeconds: null })).toBe("fresh");
  });
});
