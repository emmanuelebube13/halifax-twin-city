// Counts 3D page loads that use Google Photorealistic 3D Tiles through Cesium ion (the architect's free plan:
// 1,000 root tile requests a month; this task's budget is 60). Every script that opens 3D with ion calls add().
// The tally lives in .ion-tally.json (git-ignored). Usage: node scripts/ion-tally.mjs [show|add <n> <reason>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".ion-tally.json");
export const BUDGET = 60;
export const STOP_AT = 50;

export function read() {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { total: 0, entries: [] };
}

export function add(n, reason) {
  const t = read();
  t.total += n;
  t.entries.push({ at: new Date().toISOString(), n, reason });
  writeFileSync(file, JSON.stringify(t, null, 2));
  return t.total;
}

/** Throws before a run that would pass the stop line. */
export function guard(n) {
  const t = read();
  if (t.total + n > STOP_AT) throw new Error(`Ion budget: ${t.total} 3D loads used; ${n} more would pass the stop line of ${STOP_AT}.`);
}

if (process.argv[1] && process.argv[1].endsWith("ion-tally.mjs")) {
  const [cmd, n, ...reason] = process.argv.slice(2);
  if (cmd === "add") console.log(`total ${add(Number(n), reason.join(" "))}`);
  else console.log(JSON.stringify(read(), null, 2));
}
