// Copies the contract's example responses into src/mocks/fixtures, so the app runs with no API
// (npm run dev:mock). Looks in the repository's engineering/contract/examples first, then in the API
// workstream's worktree; override with HALIFAX_TWIN_CONTRACT_EXAMPLES.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.HALIFAX_TWIN_CONTRACT_EXAMPLES,
  resolve(root, "..", "..", "engineering", "contract", "examples"),
  "C:/halifax-twin-data/worktrees/api/engineering/contract/examples",
].filter(Boolean);
const from = candidates.find((p) => existsSync(p));
if (!from) {
  console.error("No contract examples found. Looked in:\n  " + candidates.join("\n  "));
  process.exit(1);
}
const to = join(root, "src", "mocks", "fixtures");
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith(".json"));
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`Copied ${files.length} example responses from ${from}`);
