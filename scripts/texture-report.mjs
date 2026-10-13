// T4.1 texture payload report: reproducible before/after accounting for
// the globe texture pipeline. No dependencies — parses PNG IHDR and JPEG
// SOF markers directly, so it runs anywhere Node does (CI included).
//
// Usage: npm run textures:report [-- public/textures]
// Output: per-file dimensions/bytes, per-tier totals (file payload +
// estimated GPU allocation), and the 6 MB PRD budget verdict.
//
// GPU figures are ESTIMATES (decoded RGBA8 + full mipmap chain ≈
// w*h*4*4/3), reported separately from measured file bytes per the T4.1
// acceptance criteria — never confuse the two.
import fs from 'node:fs';
import path from 'node:path';

export const BUDGET_BYTES = 6 * 1024 * 1024;

// Slot → tier → file, mirroring TEXTURE_URLS in
// src/components/globe/textureTiers.ts (single source stays in code;
// this script only reports what is on disk).
const TIERS = {
  standard: {
    day: 'earth-day-2k.jpg',
    night: 'earth-night-2k.jpg',
    clouds: 'earth-clouds.jpg',
    topology: 'earth-topology.png',
    water: 'earth-water.png',
  },
  high: {
    day: 'earth-day.jpg',
    night: 'earth-night.jpg',
    clouds: 'earth-clouds.jpg',
    topology: 'earth-topology.png',
    water: 'earth-water.png',
  },
};

function probeImage(buffer) {
  if (buffer[0] === 137 && buffer[1] === 80) {
    const ct = buffer[25];
    return {
      kind: 'PNG',
      w: buffer.readUInt32BE(16),
      h: buffer.readUInt32BE(20),
      channels: ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1,
    };
  }
  if (buffer[0] === 255 && buffer[1] === 216) {
    let o = 2;
    while (o < buffer.length) {
      if (buffer[o] !== 255) {
        o += 1;
        continue;
      }
      const m = buffer[o + 1];
      if (m === 216 || (m >= 208 && m <= 215)) {
        o += 2;
        continue;
      }
      if (m === 192 || m === 193 || m === 194) {
        return {
          kind: 'JPEG',
          w: buffer.readUInt16BE(o + 7),
          h: buffer.readUInt16BE(o + 5),
          channels: buffer[o + 9],
        };
      }
      o += 2 + buffer.readUInt16BE(o + 2);
    }
  }
  return null;
}

function mib(bytes) {
  return `${(bytes / 1048576).toFixed(3)} MiB`;
}

export function reportTextures(dir) {
  const files = {};
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!fs.statSync(p).isFile()) continue;
    const buffer = fs.readFileSync(p);
    const info = probeImage(buffer);
    if (!info) continue;
    const gpu = Math.round((info.w * info.h * 4 * 4) / 3);
    files[f] = { ...info, bytes: buffer.length, gpu };
  }
  const tiers = {};
  for (const [tier, slots] of Object.entries(TIERS)) {
    let bytes = 0;
    let gpu = 0;
    const missing = [];
    const rows = [];
    for (const [slot, file] of Object.entries(slots)) {
      const info = files[file];
      if (!info) {
        missing.push(`${slot} → ${file}`);
        continue;
      }
      bytes += info.bytes;
      gpu += info.gpu;
      rows.push({ slot, file, ...info });
    }
    tiers[tier] = { rows, bytes, gpu, missing, withinBudget: bytes <= BUDGET_BYTES };
  }
  return { dir, files, tiers, budgetBytes: BUDGET_BYTES };
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('texture-report.mjs');
if (invokedDirectly) {
  const dir = path.resolve(process.argv[2] || path.join(process.cwd(), 'public', 'textures'));
  const report = reportTextures(dir);
  console.log(`texture payload report — ${dir}\n`);
  for (const [tier, t] of Object.entries(report.tiers)) {
    console.log(`tier: ${tier}`);
    for (const r of t.rows) {
      console.log(
        `  ${r.slot.padEnd(8)} ${r.file.padEnd(22)} ${r.kind} ${`${r.w}x${r.h}`.padEnd(10)} ${mib(r.bytes).padStart(10)} file   ~${mib(r.gpu).padStart(9)} GPU`,
      );
    }
    for (const m of t.missing) console.log(`  MISSING  ${m}`);
    console.log(
      `  total: ${mib(t.bytes)} file / ~${mib(t.gpu)} GPU  — 6 MB budget: ${t.withinBudget ? 'MET' : 'EXCEEDED'}\n`,
    );
  }
  const failed = Object.values(report.tiers).some((t) => t.missing.length > 0 || !t.withinBudget);
  process.exit(failed ? 1 : 0);
}
