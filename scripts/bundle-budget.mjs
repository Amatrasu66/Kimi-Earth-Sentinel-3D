// T4.5 initial-route JavaScript bundle budget: reproducible accounting +
// hard CI gate. No dependencies — Node built-ins + the existing Next.js
// build output only (no bundle analyzer, no browser tooling).
//
// Usage: npm run bundle:check  (runs `next build` first; CI runs it after
// the build step so manifests and assets exist)
//
// What it measures:
// - the actual initial JavaScript assets for `/`, taken from the
//   production `app-build-manifest.json` `pages["/page"]` list (the exact
//   files Next.js schedules for the route — never filename guesses);
// - per-file gzip bytes via Node zlib (level 6, the Node/Vercel default),
//   summed per file because browsers download the files separately (no
//   cross-file compression);
// - against the budget INITIAL_ROUTE_JS_GZIP_BUDGET_BYTES = 200 KiB.
//
// What is excluded (and why):
// - only the lazily loaded globe chunks, identified by their
//   `react-loadable-manifest.json` import-graph keys
//   (`EarthRenderer.tsx -> ./WebGPUEarth`, `EarthRenderer.tsx -> ./GlobeScene`)
//   — a deterministic manifest/import mapping, never a filename substring.
//   They are reported (informational) and verified ABSENT from the counted
//   set: if a mapped globe file ever lands in the initial set, the split
//   regressed and the script fails instead of hiding it.
// - source maps, CSS, images, API payloads, textures and GPU estimates are
//   never part of a JavaScript budget and are ignored.
//
// Fail-safe: missing `.next`, missing/malformed manifests, an empty or
// ambiguous initial asset set, or a missing chunk file all fail with a
// clear diagnostic — never a falsely small (passing) total.
//
// This script intentionally does NOT measure LCP/FCP, Web Vitals, FPS or
// GPU memory. Those need real browser/device captures (owner-manual).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

/** 200 KiB, in bytes. "KB" in the task text is read as KiB (1024). */
export const INITIAL_ROUTE_JS_GZIP_BUDGET_BYTES = 200 * 1024;

/** Gzip level: Node's default (also Vercel's transfer encoding level). */
export const GZIP_LEVEL = 6;

/** Route key for `/` in app-build-manifest.json `pages`. */
export const INITIAL_ROUTE_KEY = '/page';

/**
 * Import-graph keys (react-loadable-manifest.json) whose files are the
 * lazily loaded globe chunks. Matched on the normalized manifest key
 * (`/`-separated), never on chunk filenames.
 */
export const LAZY_GLOBE_KEY_MATCHERS = [
  /components\/globe\/EarthRenderer\.tsx\s*->\s*\.\/WebGPUEarth$/,
  /components\/globe\/EarthRenderer\.tsx\s*->\s*\.\/GlobeScene$/,
];

export function loadJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(
      `bundle-budget: cannot read ${filePath} — run \`npm run build\` first (${err.message})`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`bundle-budget: malformed JSON in ${filePath} (${err.message})`);
  }
}

/**
 * The initial JavaScript asset set for `/`: the manifest's route file
 * list, `.js` only, deduplicated in order. Throws when the set cannot be
 * determined safely — an unknown set must never read as zero bytes.
 */
export function selectInitialJsFiles(appBuildManifest) {
  const pages = appBuildManifest?.pages;
  if (!pages || typeof pages !== 'object') {
    throw new Error('bundle-budget: app-build-manifest.json has no `pages` map');
  }
  const routeFiles = pages[INITIAL_ROUTE_KEY];
  if (!Array.isArray(routeFiles)) {
    throw new Error(
      `bundle-budget: app-build-manifest.json has no "${INITIAL_ROUTE_KEY}" file list`,
    );
  }
  const jsFiles = [...new Set(routeFiles.filter((f) => typeof f === 'string' && f.endsWith('.js')))];
  if (jsFiles.length === 0) {
    throw new Error(
      `bundle-budget: "${INITIAL_ROUTE_KEY}" lists no JavaScript assets — refusing to report 0 bytes`,
    );
  }
  return jsFiles;
}

/**
 * The lazily loaded globe chunk files, with the import-graph key that
 * proves each one lazy (`via`). Keys are separator-normalized so builds
 * on any OS match. Non-matching mappings (charts, pages router) are left
 * alone: they are lazy too, but the budget exclusion is globe-only and
 * they are not in the initial set either.
 */
export function selectLazyGlobeFiles(reactLoadableManifest) {
  const out = [];
  if (!reactLoadableManifest || typeof reactLoadableManifest !== 'object') {
    throw new Error('bundle-budget: react-loadable-manifest.json is not an object');
  }
  for (const [rawKey, entry] of Object.entries(reactLoadableManifest)) {
    const key = rawKey.replace(/\\/g, '/');
    if (!LAZY_GLOBE_KEY_MATCHERS.some((re) => re.test(key))) continue;
    const files = Array.isArray(entry?.files) ? entry.files : [];
    for (const file of files) {
      if (typeof file !== 'string' || !file.endsWith('.js')) continue;
      if (!out.some((row) => row.file === file)) out.push({ file, via: rawKey });
    }
  }
  return out;
}

/** Gzip byte size of one asset (level pinned for reproducibility). */
export function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: GZIP_LEVEL }).length;
}

/**
 * Evaluate the budget. Returns the full report; throws on any accounting
 * failure. A lazy globe file present in the initial set is a regressed
 * code-split and fails — it must be counted, never silently excluded.
 */
export function evaluateBudget({ nextDir, initialFiles, lazyGlobeFiles, budgetBytes }) {
  if (!Array.isArray(initialFiles) || initialFiles.length === 0) {
    throw new Error('bundle-budget: empty initial asset set — refusing to pass');
  }
  const initialSet = new Set(initialFiles);
  for (const { file, via } of lazyGlobeFiles) {
    if (initialSet.has(file)) {
      throw new Error(
        `bundle-budget: lazy globe chunk ${file} (via "${via}") is in the initial route set — the globe code-split regressed`,
      );
    }
  }
  const rows = initialFiles.map((file) => {
    const abs = path.join(nextDir, file);
    let buffer;
    try {
      buffer = fs.readFileSync(abs);
    } catch {
      throw new Error(`bundle-budget: initial asset missing on disk: ${file}`);
    }
    return { file, rawBytes: buffer.length, gzipBytes: gzipSize(buffer) };
  });
  rows.sort((a, b) => b.gzipBytes - a.gzipBytes);
  const totalGzipBytes = rows.reduce((sum, row) => sum + row.gzipBytes, 0);
  const totalRawBytes = rows.reduce((sum, row) => sum + row.rawBytes, 0);

  const lazyRows = lazyGlobeFiles.map(({ file, via }) => {
    const abs = path.join(nextDir, file);
    let buffer;
    try {
      buffer = fs.readFileSync(abs);
    } catch {
      throw new Error(`bundle-budget: lazy globe asset missing on disk: ${file}`);
    }
    return { file, via, rawBytes: buffer.length, gzipBytes: gzipSize(buffer) };
  });
  const lazyTotalGzipBytes = lazyRows.reduce((sum, row) => sum + row.gzipBytes, 0);

  return {
    rows,
    totalRawBytes,
    totalGzipBytes,
    budgetBytes,
    pass: totalGzipBytes <= budgetBytes,
    lazyRows,
    lazyTotalGzipBytes,
  };
}

export function formatBytes(bytes) {
  return `${bytes} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

export function printReport(report, nextDir) {
  const lines = [];
  lines.push(`initial-route JS bundle report — ${nextDir}`);
  lines.push(`route: / (app-build-manifest pages["${INITIAL_ROUTE_KEY}"])`);
  lines.push('');
  lines.push(`counted (initial, ${report.rows.length} files):`);
  for (const row of report.rows) {
    lines.push(`  ${row.file}  raw=${row.rawBytes} gzip=${row.gzipBytes}`);
  }
  lines.push(`  TOTAL raw=${report.totalRawBytes} gzip=${report.totalGzipBytes}`);
  lines.push('');
  lines.push(
    `budget: ${formatBytes(report.budgetBytes)} — ` +
      `total ${formatBytes(report.totalGzipBytes)} → ${report.pass ? 'PASS' : 'FAIL'}`,
  );
  lines.push('');
  lines.push(
    `excluded lazy globe chunks (react-loadable-manifest import graph, not initially loaded):`,
  );
  if (report.lazyRows.length === 0) {
    lines.push('  (none mapped — no exclusion applied)');
  } else {
    for (const row of report.lazyRows) {
      lines.push(`  ${row.file}  raw=${row.rawBytes} gzip=${row.gzipBytes}  via "${row.via}"`);
    }
    lines.push(`  excluded total gzip=${report.lazyTotalGzipBytes} (informational only)`);
  }
  lines.push('');
  lines.push(
    `gzip: Node zlib level ${GZIP_LEVEL} per file (files download separately; no cross-file compression).`,
  );
  return lines.join('\n');
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const nextDir = path.join(repoRoot, '.next');
  try {
    const appManifest = loadJson(path.join(nextDir, 'app-build-manifest.json'));
    const loadableManifest = loadJson(path.join(nextDir, 'react-loadable-manifest.json'));
    const initialFiles = selectInitialJsFiles(appManifest);
    const lazyGlobeFiles = selectLazyGlobeFiles(loadableManifest);
    const report = evaluateBudget({
      nextDir,
      initialFiles,
      lazyGlobeFiles,
      budgetBytes: INITIAL_ROUTE_JS_GZIP_BUDGET_BYTES,
    });
    console.log(printReport(report, nextDir));
    if (!report.pass) {
      console.error(
        `bundle-budget: FAIL — initial-route JS ${report.totalGzipBytes} B exceeds ${report.budgetBytes} B. ` +
          `Do not raise the budget or widen exclusions without owner approval.`,
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`bundle-budget: ERROR — ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  }
}

const invokedAsScript =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) main();
