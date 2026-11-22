// Opens the running app at laptop (1440 x 900) and phone (390 x 844) sizes and saves screenshots of the main
// screens to screenshots/ (git-ignored). Start the app first: npm run dev (API) or npm run dev:mock.
// Usage: node scripts/screenshots.mjs [baseUrl] [prefix]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://127.0.0.1:5173";
const prefix = process.argv[3] || "";
const only = process.argv[4] || "";
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });

const shots = [
  // [name, query, setup]
  ["01-city", "", null],
  ["02-all-sectors", "?panel=sectors", null],
  ["03-story-trn-q01", "?story=TRN-Q01", null],
  ["03b-story-selected-bus", "?story=TRN-Q01", "select-bus"],
  ["04-story-pwk-q13", "?story=PWK-Q13", null],
  ["05-story-hre-q29", "?story=HRE-Q29&lens=analytics", null],
  ["06-list-view", "?story=TRN-Q01&panel=list", null],
  ["07-sources", "?panel=sources", null],
  ["08-sector-transportation", "?sector=S04", null],
  ["09-analytics-trn", "?story=TRN-Q01&lens=analytics", null],
  ["10-story-not-live", "?story=TRN-Q02&lens=analytics", null],
  ["11-story-pwk-q16", "?story=PWK-Q16", null],
];

const sizes = [
  ["laptop", { width: 1440, height: 900 }, false],
  ["phone", { width: 390, height: 844 }, true],
];

const browser = await chromium.launch();
const problems = [];
for (const [size, viewport, mobile] of sizes.filter(([n]) => !only || n === only)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: "no-preference" });
  for (const [name, q, setup] of shots) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${size} ${name}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`${size} ${name}: console ${m.text()}`);
    });
    await page.goto(base + "/" + q, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    if (setup === "select-bus") {
      // pick the first bus from the list view, which also proves the list selects on the map
      await page.goto(base + "/" + q + (q ? "&" : "?") + "panel=list", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const row = page.locator(".list-table .linklike").first();
      if (await row.count()) await row.click();
      await page.waitForTimeout(2500);
    }
    if (mobile && /^(03|04|05|09|10|11)/.test(name)) {
      // phone: show the sheet at half height for story screens
      const handle = page.locator(".sheet-handle");
      if ((await page.locator(".sheet--peek").count()) && (await handle.count())) {
        await handle.click();
        await page.waitForTimeout(400);
      }
    }
    await page.screenshot({ path: join(out, `${prefix}${size}-${name}.png`) });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`Saved screenshots to ${out}`);
if (problems.length) {
  console.log("Problems seen:");
  for (const p of problems) console.log("  " + p);
}
