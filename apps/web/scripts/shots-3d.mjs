// Screenshots of the 3D view (and the refreshed 2D pins) at laptop and phone sizes, for the design reviews.
// Every 3D page load counts 1 against the ion budget (scripts/ion-tally.mjs); 2D shots cost nothing.
// Usage: node scripts/shots-3d.mjs <baseUrl> <prefix> [dark]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { add, guard } from "./ion-tally.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://127.0.0.1:5175";
const prefix = process.argv[3] || "r1";
const dark = process.argv[4] === "dark";
const final = process.argv[4] === "final";
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });

// [name, device, query, step]
const shots = dark
  ? [["3d-story-trn-dark", "laptop", "?story=TRN-Q01&view=3d", null]]
  : final
  ? [
      ["3d-city", "laptop", "?view=3d", null],
      ["3d-selected", "laptop", "?story=TRN-Q01&view=3d&panel=list", "select"],
      ["3d-story-hre", "laptop", "?story=HRE-Q29&view=3d", null],
      ["3d-story-trn", "phone", "?story=TRN-Q01&view=3d", null],
      ["3d-selected", "phone", "?story=TRN-Q01&view=3d&panel=list", "select"],
      ["2d-story-trn", "laptop", "?story=TRN-Q01", null],
      ["2d-story-trn", "phone", "?story=TRN-Q01", null],
    ]
  : [
      ["2d-story-trn", "laptop", "?story=TRN-Q01", null],
      ["2d-selected", "laptop", "?story=TRN-Q01&panel=list", "select"],
      ["2d-story-trn", "phone", "?story=TRN-Q01", null],
      ["3d-city", "laptop", "?view=3d", null],
      ["3d-story-trn", "laptop", "?story=TRN-Q01&view=3d", null],
      ["3d-selected", "laptop", "?story=TRN-Q01&view=3d&panel=list", "select"],
      ["3d-story-pwk", "laptop", "?story=PWK-Q13&view=3d", null],
      ["3d-story-hre", "laptop", "?story=HRE-Q29&view=3d", null],
      ["3d-story-trn", "phone", "?story=TRN-Q01&view=3d", null],
      ["3d-selected", "phone", "?story=TRN-Q01&view=3d&panel=list", "select"],
    ];
const loads = shots.filter(([, , q]) => q.includes("view=3d")).length;
guard(loads);

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
for (const [name, device, q, step] of shots) {
  const phone = device === "phone";
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  const is3d = q.includes("view=3d");
  if (is3d) add(1, `shots-3d ${prefix} ${name} ${device}`);
  await page.goto(`${base}/${q}`, { waitUntil: "domcontentloaded" });
  if (is3d) await page.waitForFunction(() => window.__globe3d && window.__globe3d.firstFrameMs !== null, null, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(is3d ? 5000 : 3000);
  if (step === "select") {
    await page.locator(".list-table .linklike").first().click();
    await page.waitForTimeout(is3d ? 4500 : 2500);
  }
  await page.screenshot({ path: join(out, `${prefix}-${device}-${name}.png`) });
  console.log(`${prefix}-${device}-${name}.png`);
  await ctx.close();
}
await browser.close();
