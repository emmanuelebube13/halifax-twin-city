// Copies CesiumJS's prebuilt files (workers, assets, widgets) into public/cesium so the 3D view can load them
// on demand. public/cesium is git-ignored. Runs after "npm install".
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "cesium", "Build", "Cesium");
const to = join(root, "public", "cesium");
if (!existsSync(from)) {
  console.log("CesiumJS is not installed; the 3D view will be unavailable.");
  process.exit(0);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("Copied CesiumJS into public/cesium");
