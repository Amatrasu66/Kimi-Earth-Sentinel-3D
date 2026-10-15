/**
 * Copy CesiumJS static assets into public/ for serving at /cesium.
 *
 * CesiumJS (npm `cesium`, verified 1.146.0) requires four static directories
 * next to its runtime base URL (see CESIUM_BASE_URL in
 * src/components/globe/cesiumAssets.ts):
 *
 *   Workers, ThirdParty, Assets, Widgets
 *
 * Source of truth is always the installed package
 * (`node_modules/cesium/Build/Cesium`), never a committed copy — generated
 * output stays out of git (see .gitignore `/public/cesium/`).
 *
 * Properties:
 * - Idempotent: the destination is removed and re-copied, so repeated runs
 *   never nest duplicates (no public/cesium/cesium/...).
 * - Fails non-zero with a clear message when the source package (or one of
 *   the four directories) is missing instead of producing a half-copied tree.
 * - Reports every copied directory with file counts.
 * - No global packages, no network: pure node:fs, works on Node 24+.
 *
 * Runs automatically via the `postinstall` hook (covers `npm ci`, local
 * installs, and Vercel builds) and manually via `npm run cesium:assets`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CESIUM_BUILD = path.join(REPO_ROOT, "node_modules", "cesium", "Build", "Cesium");
const DEST_ROOT = path.join(REPO_ROOT, "public", "cesium");

// The four directories CesiumJS requires at runtime (official Cesium +
// cesium-webpack-example convention). Order is cosmetic.
const REQUIRED_DIRS = ["Workers", "ThirdParty", "Assets", "Widgets"];

// Marker files that must exist after a successful copy; guards against a
// silently partial tree (e.g. interrupted install).
const MARKER_FILES = [
  path.join("Widgets", "widgets.css"),
];

function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFiles(full) : 1;
  }
  return count;
}

function fail(message) {
  console.error(`[cesium:assets] ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(CESIUM_BUILD) || !statSync(CESIUM_BUILD).isDirectory()) {
  fail(
    `Cesium package not found at ${CESIUM_BUILD}. ` +
      `Run \`npm ci\` (or \`npm install\`) first so \`cesium\` is installed.`,
  );
}

for (const dir of REQUIRED_DIRS) {
  const src = path.join(CESIUM_BUILD, dir);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    fail(
      `Required Cesium asset directory missing: ${src}. ` +
        `The installed cesium version may have changed its layout — ` +
        `inspect node_modules/cesium/Build/Cesium before proceeding.`,
    );
  }
}

// Remove-then-copy keeps reruns deterministic (no nested duplicates).
rmSync(DEST_ROOT, { recursive: true, force: true });
mkdirSync(DEST_ROOT, { recursive: true });

let total = 0;
for (const dir of REQUIRED_DIRS) {
  const src = path.join(CESIUM_BUILD, dir);
  const dest = path.join(DEST_ROOT, dir);
  cpSync(src, dest, { recursive: true });
  const files = countFiles(dest);
  total += files;
  console.log(`[cesium:assets] ${dir}/: ${files} files -> public/cesium/${dir}/`);
}

for (const marker of MARKER_FILES) {
  if (!existsSync(path.join(DEST_ROOT, marker))) {
    fail(`Post-copy verification failed: public/cesium/${marker} is missing.`);
  }
}

console.log(
  `[cesium:assets] done: ${total} files under public/cesium/ ` +
    `(served at ${"/cesium"}; CESIUM_BASE_URL must match).`,
);
