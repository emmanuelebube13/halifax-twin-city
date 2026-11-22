// Tests for t27: data age for checked sources, bus pin ids and status shapes, 3D decluttering, and the rules that
// keep the Cesium ion token out of storage, URLs, the service worker and logs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clusterScreenPoints } from "../map/declutter";
import { busImageId, parseBusImageId } from "../map/pins";
import { ageLine } from "./ago";
import { STATUS_SHAPE } from "./status";
import { DEFAULT_VIEW, serializeView } from "./url";

const now = Date.parse("2026-11-22T13:00:00Z");

describe("data age: checked sources and live feeds", () => {
  it("says when a checked source was checked and since when it is unchanged", () => {
    const src = [{ source_id: "SRC-015", name: "Street closures", publisher: "HRM", checked_ts: "2026-11-22T12:48:00Z", last_changed_ts: "2026-11-21T12:07:27Z" }];
    expect(ageLine(src, "2026-11-21T12:07:27Z", now)).toBe("Checked 12 min ago, unchanged since 21 Nov 2026");
  });
  it("keeps as_of for live feeds", () => {
    const src = [{ source_id: "SRC-001", name: "Vehicle positions", publisher: "Halifax Transit", checked_ts: "2026-11-22T12:59:48Z", last_changed_ts: null }];
    expect(ageLine(src, "2026-11-22T12:59:48Z", now)).toBe("Updated 12 s ago");
    expect(ageLine(undefined, "2026-11-22T12:59:48Z", now)).toBe("Updated 12 s ago");
    expect(ageLine([], null, now)).toBeNull();
  });
});

describe("bus pins", () => {
  it("carry status, direction, selection and route in one image id, and read it back", () => {
    const id = busImageId("late", true, true, "9B");
    expect(id).toBe("bus-late-w-sel-r-9B");
    expect(parseBusImageId(id)).toEqual({ status: "late", facingWest: true, selected: true, route: "9B" });
    expect(parseBusImageId("bus-on_time-e")).toEqual({ status: "on_time", facingWest: false, selected: false, route: null });
    expect(parseBusImageId("cluster-13232e-4")).toBeNull();
  });
  it("draw status by shape in 2D and 3D alike: disc, diamond, ring, square", () => {
    expect(STATUS_SHAPE).toEqual({ on_time: "disc", late: "diamond", early: "ring", unknown: "square" });
  });
  it("keep their models under 100 kB", () => {
    for (const f of ["bus-near.glb", "bus-mid.glb"]) {
      const size = statSync(join(__dirname, "..", "..", "public", "models", f)).size;
      expect(size).toBeLessThan(100 * 1024);
    }
  });
});

describe("3D decluttering", () => {
  it("merges pins that overlap on screen and keeps lone pins apart", () => {
    const groups = clusterScreenPoints([{ id: 1, x: 10, y: 10 }, { id: 2, x: 20, y: 30 }, { id: 3, x: 400, y: 300 }], 52);
    expect(groups.map((g) => g.ids.sort()).sort((a, b) => a.length - b.length)).toEqual([[3], [1, 2]]);
  });
});

describe("the ion token stays in memory", () => {
  it("is never part of the view in the URL", () => {
    const keys = Object.keys(DEFAULT_VIEW);
    expect(keys.some((k) => /token/i.test(k))).toBe(false);
    expect(serializeView({ ...DEFAULT_VIEW, view: "3d" })).toBe("?view=3d");
  });
  it("is never cached by the service worker: API answers and other origins are passed straight through", () => {
    const sw = readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8");
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);
    expect(sw).toMatch(/startsWith\("\/v1\/"\)/);
  });
  it("is never stored or logged anywhere in the app's code", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    walk(join(__dirname, ".."));
    const offending: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/token/i.test(line) && /(console\.|localStorage|sessionStorage|indexedDB|caches\.|history\.|location\.(search|hash|href)\s*=|document\.cookie)/.test(line)) {
            offending.push(`${f}:${i + 1}`);
          }
        });
    }
    expect(offending).toEqual([]);
  });
});

describe("data age from the contract's own examples", () => {
  it("reads the road closures example as checked, unchanged since its last change", async () => {
    const env = JSON.parse(readFileSync(join(__dirname, "..", "mocks", "fixtures", "layers-road-closures.json"), "utf8"));
    const checked = Date.parse(env.source[0].checked_ts);
    expect(ageLine(env.source, env.as_of, checked + 5 * 60_000)).toBe("Checked 5 min ago, unchanged since 21 Nov 2026");
  });
  it("reads the live vehicles example with as_of", () => {
    const env = JSON.parse(readFileSync(join(__dirname, "..", "mocks", "fixtures", "live-vehicles.json"), "utf8"));
    expect(ageLine(env.source, env.as_of, Date.parse(env.as_of) + 12_000)).toBe("Updated 12 s ago");
  });
});
