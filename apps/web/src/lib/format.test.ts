import { describe, expect, it } from "vitest";
import {
  NO_VALUE, formatAge, formatByUnit, formatClock, formatCount, formatDate, formatDateTime, formatDelay,
  formatDistance, formatDuration, formatMoney, formatPercent,
} from "./format";

describe("counts", () => {
  it("use a thousands separator and no decimals", () => {
    expect(formatCount(1240)).toBe("1,240");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12.6)).toBe("13");
  });
  it("show a dash, never a zero, for no value", () => {
    expect(formatCount(null)).toBe(NO_VALUE);
    expect(formatCount(undefined)).toBe(NO_VALUE);
    expect(formatCount(Number.NaN)).toBe(NO_VALUE);
  });
});

describe("percentages", () => {
  it("are whole numbers at 10% and above", () => {
    expect(formatPercent(81.4)).toBe("81%");
    expect(formatPercent(10)).toBe("10%");
  });
  it("keep one decimal below 10%", () => {
    expect(formatPercent(4.5)).toBe("4.5%");
    expect(formatPercent(4)).toBe("4%");
  });
  it("accept fractions", () => {
    expect(formatPercent(0.81, true)).toBe("81%");
    expect(formatPercent(0.045, true)).toBe("4.5%");
  });
});

describe("durations and delays", () => {
  it("use the largest sensible unit with a space", () => {
    expect(formatDuration(12)).toBe("12 s");
    expect(formatDuration(240)).toBe("4 min");
    expect(formatDuration(4800)).toBe("1 h 20 min");
    expect(formatDuration(7200)).toBe("2 h");
  });
  it("say early and late in words, never with signs", () => {
    expect(formatDelay(240)).toBe("4 min late");
    expect(formatDelay(-120)).toBe("2 min early");
    expect(formatDelay(0)).toBe("on time");
    expect(formatDelay(-120)).not.toMatch(/[+-]/);
  });
});

describe("distances and money", () => {
  it("are metric", () => {
    expect(formatDistance(300)).toBe("300 m");
    expect(formatDistance(1200)).toBe("1.2 km");
  });
  it("are Canadian dollars without cents above $100", () => {
    expect(formatMoney(412000)).toBe("$412,000");
    expect(formatMoney(12.5)).toBe("$12.50");
  });
});

describe("clock and dates", () => {
  // 23:42 UTC on 21 Nov 2026 is 19:42 in Halifax (AST, UTC-4)
  const t = "2026-11-21T23:42:05Z";
  it("use the 24-hour clock in Halifax time", () => {
    expect(formatClock(t)).toBe("19:42");
    expect(formatClock("2026-11-22T04:05:00Z")).toBe("00:05");
    expect(formatClock(t, true)).toBe("19:42:05");
  });
  it("write dates as 21 Nov 2026", () => {
    expect(formatDate(t)).toBe("21 Nov 2026");
    expect(formatDate("2026-09-03T12:00:00Z")).toBe("3 Sep 2026");
    expect(formatDateTime(t)).toBe("21 Nov 2026 19:42");
  });
  it("follow daylight time in summer (ADT, UTC-3)", () => {
    expect(formatClock("2026-07-01T12:00:00Z")).toBe("09:00");
  });
  it("give the age of data", () => {
    const now = Date.parse(t);
    expect(formatAge("2026-11-21T23:41:53Z", now)).toBe("12 s");
    expect(formatAge("2026-11-21T23:30:05Z", now)).toBe("12 min");
    expect(formatAge("2026-11-19T10:00:00Z", now)).toBe("19 Nov 2026");
    expect(formatAge(null, now)).toBe(NO_VALUE);
  });
});

describe("formatting by unit", () => {
  it("picks the rule from the unit", () => {
    expect(formatByUnit(81, "percent")).toBe("81%");
    expect(formatByUnit(212, "buses")).toBe("212");
    expect(formatByUnit(1240, "permits")).toBe("1,240");
    expect(formatByUnit(null, "buses")).toBe(NO_VALUE);
  });
});
