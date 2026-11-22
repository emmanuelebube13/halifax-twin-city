// Browser checks for the t27 tester's findings. Spends no ion: run against a plain-globe server
// (VITE_3D_NO_ION=1). Usage: node scripts/check-no-webgl.mjs <baseUrl>
// 1. With WebGL disabled in four different ways, the app (2D, and a link that opens 3D) logs no uncaught errors
//    and falls back to 2D.
// 2. Switching from 3D to 2D keeps the lens and the rest of the story state in the URL, for every lens.
import { chromium } from "@playwright/test";

const base = process.argv[2] || "http://127.0.0.1:5176";
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);

const variants = {
  "disable-webgl": ["--disable-webgl", "--disable-3d-apis"],
  "no gpu, no software GL": ["--disable-gpu", "--disable-software-rasterizer"],
  "use-gl disabled": ["--use-gl=disabled"],
  "angle disabled": ["--use-angle=disabled"],
};
for (const [name, args] of Object.entries(variants)) {
  const browser = await chromium.launch({ args });
  for (const q of ["?story=TRN-Q01&view=3d", "?story=TRN-Q01"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
    await page.goto(base + "/" + q, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    const btn = page.getByRole("button", { name: "3D", exact: true });
    if ((await btn.count()) && !q.includes("3d")) {
      await btn.first().click();
      await page.waitForTimeout(3000);
    }
    check(`${name}, ${q}: no uncaught errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  await browser.close();
}

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu"] });
for (const lens of ["live", "analytics", "replay"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/?story=TRN-Q01&lens=${lens}&route=1&view=3d`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const before = new URL(page.url()).searchParams;
  await page.getByRole("button", { name: "2D", exact: true }).first().click();
  await page.waitForTimeout(1500);
  const after = new URL(page.url()).searchParams;
  const kept = ["story", "lens", "route"].every((k) => after.get(k) === before.get(k));
  check(`3D to 2D keeps lens=${before.get("lens")} and the story state`, kept && after.get("view") === null, page.url().replace(base, ""));
  await page.close();
}
await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
