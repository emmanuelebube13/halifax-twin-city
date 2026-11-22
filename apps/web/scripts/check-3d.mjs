// One 3D page load with Google Photorealistic 3D Tiles (counts 1 against the ion budget), then:
// - the 3D metrics (time to first frame, tiles loaded, frames), and ion and Google request counts;
// - token safety: the ion token is not in localStorage, sessionStorage, cookies, the URL, the Cache Storage or
//   any console message. The token is read from client-config in memory and compared; it is never printed.
// - optional screenshots of named steps.
// Usage: node scripts/check-3d.mjs <baseUrl> <query> <name> [phone]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { add, guard } from "./ion-tally.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [base = "http://127.0.0.1:5175", query = "?story=TRN-Q01&view=3d", name = "3d-check", device = "laptop"] = process.argv.slice(2);
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });
const phone = device === "phone";

guard(1);
const cfg = await (await fetch(`${base}/v1/client-config`)).json();
const token = cfg?.data?.cesium_ion_token ?? null;
console.log(`client-config: 3D available ${cfg?.data?.three_d_available}, token handed over ${token !== null}`);
console.log(`ion tally now ${add(1, `check-3d ${name} ${device}`)}`);

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone });
const page = await ctx.newPage();
let tokenInConsole = false;
const counts = { google: 0, ion: 0 };
page.on("console", (m) => {
  if (token && m.text().includes(token)) tokenInConsole = true;
});
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("tile.googleapis.com")) counts.google++;
  else if (u.includes("cesium.com")) counts.ion++;
});
page.on("pageerror", (e) => console.log("page error:", e.message.slice(0, 160)));

await page.goto(`${base}/${query}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__globe3d && window.__globe3d.firstFrameMs !== null, null, { timeout: 60_000 }).catch(() => undefined);
await page.waitForTimeout(6000);
const metrics = await page.evaluate(() => window.__globe3d ?? null);
await page.screenshot({ path: join(out, `${name}-${device}.png`) });

const safety = token
  ? await page.evaluate(async (tok) => {
      const inStore = (s) => {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k?.includes(tok) || s.getItem(k ?? "")?.includes(tok)) return true;
        }
        return false;
      };
      let inCache = false;
      if ("caches" in window) {
        for (const key of await caches.keys()) {
          const c = await caches.open(key);
          for (const req of await c.keys()) if (req.url.includes(tok)) inCache = true;
        }
      }
      return { localStorage: inStore(localStorage), sessionStorage: inStore(sessionStorage), cookie: document.cookie.includes(tok), url: location.href.includes(tok), cacheStorage: inCache };
    }, token)
  : null;

console.log(JSON.stringify({ metrics, requests: counts, tokenInConsole, tokenFound: safety }, null, 1));
await browser.close();
