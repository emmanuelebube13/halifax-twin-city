// Automated accessibility scan (axe-core, WCAG 2.2 A and AA rules) of the main screens at laptop and phone
// sizes. Start the app first (npm run dev or npm run dev:mock). Usage: node scripts/a11y.mjs [baseUrl]
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.argv[2] || "http://127.0.0.1:5173";
// "3d" as the second argument scans the 3D view (use a plain-globe server, VITE_3D_NO_ION=1, to spend no ion)
const threeD = process.argv[3] === "3d";
const pages = threeD
  ? ["?view=3d", "?story=TRN-Q01&view=3d", "?story=PWK-Q13&view=3d", "?story=HRE-Q29&view=3d"]
  : ["", "?story=TRN-Q01", "?story=TRN-Q02", "?panel=sectors", "?panel=sources", "?story=TRN-Q01&panel=list"];
const browser = await chromium.launch();
let total = 0;
for (const [size, viewport] of [["laptop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  for (const q of pages) {
    await page.goto(base + "/" + q, { waitUntil: "networkidle" });
    await page.waitForTimeout(threeD ? 4000 : 1500);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude(".maplibregl-canvas").exclude(".globe-canvas").analyze();
    for (const v of r.violations) {
      total += v.nodes.length;
      console.log(`${size} ${q || "/"}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log("    " + n.target.join(" ") + " | " + (n.failureSummary || "").split("\n").slice(1, 2).join(" ").trim());
    }
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `${total} problem nodes` : "No violations found");
process.exit(total ? 1 : 0);
