// Measures the 3D view per device profile: time to first 3D frame, frames per second while panning and while
// following a bus, JS heap, tiles loaded. Each run is one page load with Google tiles and counts 1 against the
// ion budget (scripts/ion-tally.mjs). Results go to screenshots/perf-3d.json (git-ignored folder).
// Usage: node scripts/perf-3d.mjs <baseUrl> [runs]   runs: comma list of profile:condition, condition one of
// desk, cpu4, phone. Default: high:desk,medium:desk,low:desk,high:cpu4,medium:cpu4,low:cpu4,low:phone
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { add, guard } from "./ion-tally.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://127.0.0.1:5175";
const runs = (process.argv[3] || "high:desk,medium:desk,low:desk,high:cpu4,medium:cpu4,low:cpu4,low:phone").split(",").map((r) => r.split(":"));
mkdirSync(join(root, "screenshots"), { recursive: true });
const outFile = join(root, "screenshots", "perf-3d.json");
const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : [];

guard(runs.length);
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const renderer = await (async () => {
  const p = await browser.newPage();
  const r = await p.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const e = gl?.getExtension("WEBGL_debug_renderer_info");
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  await p.close();
  return r;
})();
console.log(`GPU: ${renderer}`);

const frames = (page) => page.evaluate(() => window.__globe3d?.frames ?? 0);

for (const [profile, condition] of runs) {
  const phone = condition === "phone";
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 3 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.addInitScript((p) => localStorage.setItem("halifax-twin.profile3d", p), profile);
  const page = await ctx.newPage();
  if (condition === "cpu4") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  add(1, `perf-3d ${profile} ${condition}`);
  const r = { profile, condition, gpu: renderer, firstFrameS: null, panFps: null, followFps: null, heapMB: null, tiles: null, notes: [] };
  try {
    await page.goto(`${base}/?story=TRN-Q01&view=3d`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__globe3d && window.__globe3d.firstFrameMs !== null, null, { timeout: 90_000 });
    r.firstFrameS = Math.round((await page.evaluate(() => window.__globe3d.firstFrameMs)) / 100) / 10;
    const actual = await page.evaluate(() => window.__globe3d.profile);
    if (actual !== profile) r.notes.push(`profile was ${actual}`);
    await page.waitForTimeout(3000);

    // panning: 5 s of continuous dragging across the middle of the map
    const vp = page.viewportSize();
    const cx = phone ? vp.width / 2 : 560;
    const cy = phone ? 300 : 450;
    let f0 = await frames(page);
    let t0 = Date.now();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 100; i++) {
      await page.mouse.move(cx + Math.sin(i / 8) * (phone ? 120 : 260), cy + Math.cos(i / 11) * (phone ? 80 : 160));
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    r.panFps = Math.round(((await frames(page)) - f0) / ((Date.now() - t0) / 1000));

    // following: pick the first bus from the list, then Follow for 5 s
    await page.getByRole("button", { name: phone ? "List" : "List view" }).first().click();
    await page.waitForTimeout(800);
    await page.locator(".list-table .linklike").first().click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Follow" }).first().click();
    await page.waitForTimeout(1000);
    f0 = await frames(page);
    t0 = Date.now();
    await page.waitForTimeout(5000);
    r.followFps = Math.round(((await frames(page)) - f0) / ((Date.now() - t0) / 1000));

    r.heapMB = Math.round((await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 1048576);
    r.tiles = await page.evaluate(() => window.__globe3d.tilesLoaded);
    await page.screenshot({ path: join(root, "screenshots", `perf-${profile}-${condition}.png`) });
  } catch (e) {
    r.notes.push(String(e.message).split("\n")[0].slice(0, 160));
  }
  console.log(JSON.stringify(r));
  results.push({ at: new Date().toISOString(), ...r });
  await ctx.close();
}
await browser.close();
writeFileSync(outFile, JSON.stringify(results, null, 2));
