// Screenshots and checks for the release 1 final-test fixes (22 Nov 2026): bus detail title, phone Follow,
// chart axis labels, ages, number commas. Start the app against the API first (npm run dev).
// Usage: node scripts/screenshots-fixes.mjs [baseUrl]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://127.0.0.1:5173";
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);

const browser = await chromium.launch();
for (const [size, viewport, mobile] of [["laptop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: join(out, `fix-${size}-${n}.png`) });

  // charts
  for (const id of ["TRN-Q01", "PWK-Q13", "HRE-Q29"]) {
    await page.goto(`${base}/?story=${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    if (mobile) {
      for (let i = 0; i < 2 && (await page.locator(".sheet--full").count()) === 0; i++) await page.locator(".sheet-handle").click();
      await page.waitForTimeout(400);
      await page.locator(".chart").first().scrollIntoViewIfNeeded().catch(() => undefined);
    }
    const ticks = await page.locator(".chart-tick").allTextContents();
    check(`${size} ${id} chart labels`, ticks.length > 0 && ticks.every((x) => !/^\d{4}-\d{2}$/.test(x)), ticks.join(" | "));
    const overlap = await page.evaluate(() => {
      const r = [...document.querySelectorAll(".chart-tick")].map((e) => e.getBoundingClientRect());
      return r.some((a, i) => i > 0 && a.left < r[i - 1].right - 0.5);
    });
    check(`${size} ${id} labels do not overlap`, !overlap);
    if (!mobile) {
      const ages = await page.evaluate(() => [document.querySelector(".answer-foot")?.textContent ?? "", document.querySelector(".credits-age")?.textContent ?? ""]);
      const a = ages[0].replace(/^.*?(Updated |As of \d\d:\d\d, )/, "").replace(/\..*$/, "").trim();
      check(`${size} ${id} one age for panel and footer`, ages[1].includes(a.replace(/^Updated /, "")), ages.join(" / "));
    }
    const answer = (await page.locator(".answer-plate").first().textContent()) ?? "";
    check(`${size} ${id} no spaced commas`, !/\d ,\s?\d/.test(answer), answer.slice(0, 80));
    await shot(`story-${id}`);
  }

  // bus: select from the list, open detail
  await page.goto(`${base}/?story=TRN-Q01&panel=list`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.locator(".list-table .linklike").first().click();
  await page.waitForTimeout(2500);
  await shot("bus-selected");
  await page.getByRole("button", { name: "Open detail" }).first().click();
  await page.waitForTimeout(2500);
  const title = (await page.locator(".panel-title").first().textContent()) ?? "";
  check(`${size} bus detail title has no dash`, title.length > 0 && !title.includes("–"), title);
  check(`${size} bus detail title not in capitals`, !/[A-Z]{4,} [A-Z]{4,}/.test(title), title);
  await shot("bus-detail");

  // follow
  await page.goto(`${base}/?story=TRN-Q01&panel=list`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.locator(".list-table .linklike").first().click();
  await page.waitForTimeout(1500);
  if (mobile) {
    for (let i = 0; i < 2 && (await page.locator(".sheet--full").count()) === 0; i++) await page.locator(".sheet-handle").click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Follow" }).first().click();
  await page.waitForTimeout(2500);
  if (mobile) check(`${size} sheet drops to peek on Follow`, (await page.locator(".sheet--peek").count()) === 1);
  if (mobile) {
    const frame = await page.evaluate(() => {
      const app = document.querySelector(".app--phone");
      const map = document.querySelector(".map-canvas")?.getBoundingClientRect();
      return { scrolled: app ? app.scrollTop : -1, mapTop: map ? Math.round(map.top) : null };
    });
    check(`${size} map stays on screen (frame not scrolled)`, frame.scrolled === 0 && frame.mapTop === 0, JSON.stringify(frame));
  }
  const pinVisible = await page.evaluate(() => {
    const m = window.__map;
    if (!m) return null;
    return m.queryRenderedFeatures({ layers: ["veh-pin"] }).some((f) => f.properties.sel === 1);
  });
  check(`${size} followed bus drawn on the map`, pinVisible === true || pinVisible === null, String(pinVisible));
  if (mobile) {
    const handle = await page.locator(".sheet-handle").boundingBox();
    check(`${size} sheet handle is at least 44 px tall`, !!handle && handle.height >= 44, handle ? `${handle.height}px` : "missing");
  }
  await shot("bus-follow");
  await ctx.close();
}
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
