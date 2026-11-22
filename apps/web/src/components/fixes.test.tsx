// Tests for the release 1 final-test findings (22 Nov 2026).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NumberData } from "../api/types";
import { displayName, formatMonth } from "../lib/format";
import { sheetOnFollow, storyAsOf } from "../lib/story";
import { busTitle, destination, mergeDetail } from "./panels";
import { ContextChart, labelStep, partialBuckets, seriesLabeller } from "./story";

describe("finding 2: bus title and detail", () => {
  it("never shows a dash when a headsign exists", () => {
    expect(destination("HERRING COVE VIA MUMFORD TERMINAL", "9B")).toBe("Herring Cove via Mumford Terminal");
    expect(destination("1 Spring Garden to Mumford", "1")).toBe("Mumford");
    expect(destination("9B", "9B")).toBe("9B");
    expect(destination("Route 9B Herring Cove", "9B")).toBe("Herring Cove");
    expect(destination(null, "9B")).toBeNull();
  });
  it("writes the title without a dash", () => {
    expect(busTitle({ id: 744, label: "744", route_short_name: "9B", headsign: "HERRING COVE VIA MUMFORD TERMINAL" })).toBe("Route 9B to Herring Cove via Mumford Terminal");
    expect(busTitle({ id: 744, label: "744", route_short_name: "9B", headsign: null })).toBe("Route 9B");
    expect(busTitle({ id: 744, label: "744", route_short_name: null, headsign: null })).toBe("Bus 744");
  });
  it("fills the detail's empty fields from the live feature, and prefers the detail where it has a value", () => {
    const detail = { kind: "asset", id: 744, label: "744", route_short_name: "9B", headsign: null, status: null };
    const live = { kind: "asset", id: 744, route_short_name: "9B", headsign: "HERRING COVE VIA MUMFORD TERMINAL", status: "late", delay_seconds: 420 };
    const merged = mergeDetail(detail, live);
    expect(merged.headsign).toBe("HERRING COVE VIA MUMFORD TERMINAL");
    expect(merged.status).toBe("late");
    expect(mergeDetail({ status: "on_time" }, { status: "late" }).status).toBe("on_time");
  });
  it("shows capital-letter names in title case for display only", () => {
    expect(displayName("HERRING COVE RD BEFORE OCEANBREEZE AVE (6902)")).toBe("Herring Cove Rd Before Oceanbreeze Ave (6902)");
    expect(displayName("Spring Garden Rd [Dresden Row]")).toBe("Spring Garden Rd [Dresden Row]");
  });
});

describe("finding 3: following a bus on a phone", () => {
  it("lowers the sheet to its smallest height", () => {
    expect(sheetOnFollow("full", true)).toBe("peek");
    expect(sheetOnFollow("half", true)).toBe("peek");
    expect(sheetOnFollow("full", false)).toBe("full");
  });
});

describe("finding 4: chart axis labels", () => {
  const hours = Array.from({ length: 12 }, (_, i) => `2026-11-21T${String(12 + i).padStart(2, "0")}:00:00Z`);
  it("thin the labels so they never run together", () => {
    const labels = hours.map(seriesLabeller(hours));
    const step = labelStep(labels, 360);
    expect(step).toBeGreaterThan(1);
    // each label gets a slot at least as wide as the label
    expect((360 / labels.length) * step).toBeGreaterThanOrEqual(labels[0].length * 7.4);
  });
  it("label the newest bucket and skip the ones in between", () => {
    const n: NumberData = { id: "trn.on_time_share_24h", label: "On time", value: 60, unit: "percent", series: hours.map((t) => ({ t, value: 60 })) };
    const html = renderToStaticMarkup(<ContextChart title="On time by hour" number={n} />);
    const ticks = [...html.matchAll(/class="chart-tick">([^<]*)</g)].map((m) => m[1]);
    expect(ticks.length).toBeLessThan(12);
    expect(ticks[ticks.length - 1]).toBe("19:00"); // 23:00 UTC is 19:00 in Halifax
    // no more labels than fit side by side: 360 units wide, a 5-character label is about 37 units plus a gap
    expect(ticks.length).toBeLessThanOrEqual(Math.floor(360 / (5 * 7.4 + 10)));
  });
  it("write months in the house style", () => {
    expect(formatMonth("2026-03")).toBe("Mar 2026");
    expect(formatMonth("2026-13")).toBe("–");
    expect(seriesLabeller(["2025-12", "2026-03"])("2026-03")).toBe("Mar 2026");
  });
  it("keep the end labels inside the chart", () => {
    const months = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
    const n: NumberData = { id: "pwk.closures_by_month", label: "Closures", value: 1, unit: "closures", series: months.map((t) => ({ t, value: 5 })) };
    const html = renderToStaticMarkup(<ContextChart title="Closures by month" number={n} />);
    expect(html).toContain('text-anchor="end" class="chart-tick">Nov 2026<');
    expect(html).not.toContain("2026-0");
  });
});

describe("smaller findings", () => {
  it("one as-of rule: the main layer's time, else the numbers'", () => {
    expect(storyAsOf("2026-11-22T01:00:00Z", "2026-11-22T05:30:00Z")).toBe("2026-11-22T01:00:00Z");
    expect(storyAsOf(null, "2026-11-22T05:30:00Z")).toBe("2026-11-22T05:30:00Z");
  });
  it("mark partial periods: flagged by the API, or the current bucket of a to-date series", () => {
    const n: NumberData = {
      id: "hre.permits_by_year", label: "Permits", value: 3114, unit: "permits",
      window: "Calendar years in Halifax time; value is the current year to date",
      series: [{ t: "2020", value: 40, partial: true }, { t: "2021", value: 4000 }, { t: "2026", value: 3114 }],
    };
    expect([...partialBuckets(n)].sort()).toEqual([0, 2]);
    const html = renderToStaticMarkup(<ContextChart title="Permits by year" number={n} />);
    expect(html.match(/is-partial/g)?.length).toBe(2);
    expect(html).toContain("Hatched bars cover only part of their period.");
  });
});
