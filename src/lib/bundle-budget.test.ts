/**
 * T4.5 bundle-budget logic tests (deterministic, offline).
 *
 * The pure accounting in `scripts/bundle-budget.mjs` is exercised here
 * against synthetic fixture manifests and temp-dir files — fixtures are
 * never production assets and prove nothing about browser performance,
 * LCP, or FPS. The real production verdict comes from `npm run
 * bundle:check` against actual `.next` build output.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  GZIP_LEVEL,
  INITIAL_ROUTE_JS_GZIP_BUDGET_BYTES,
  evaluateBudget,
  gzipSize,
  selectInitialJsFiles,
  selectLazyGlobeFiles,
} from '../../scripts/bundle-budget.mjs';

const tmpRoots: string[] = [];

function makeNextDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

const MANIFEST = (pageFiles: unknown) => ({ pages: { '/page': pageFiles } });

const LOADABLE = {
  'components\\globe\\EarthRenderer.tsx -> ./WebGPUEarth': {
    id: 1,
    files: ['static/chunks/globe-webgpu.js', 'static/chunks/shared.css'],
  },
  'components\\globe\\EarthRenderer.tsx -> ./GlobeScene': {
    id: 2,
    files: ['static/chunks/globe-webgl.js'],
  },
  'components\\intelligence\\LayerOverview.tsx -> @/components/charts/ValueHistogram': {
    id: 3,
    files: ['static/chunks/charts.js'],
  },
};

describe('budget constants', () => {
  it('pins the 200 KiB budget in bytes and the gzip level', () => {
    expect(INITIAL_ROUTE_JS_GZIP_BUDGET_BYTES).toBe(200 * 1024);
    expect(GZIP_LEVEL).toBe(6);
  });
});

describe('selectInitialJsFiles', () => {
  it('selects the /page JavaScript assets in order', () => {
    expect(
      selectInitialJsFiles(MANIFEST(['static/chunks/a.js', 'static/chunks/b.js'])),
    ).toEqual(['static/chunks/a.js', 'static/chunks/b.js']);
  });

  it('deduplicates repeated chunk references', () => {
    expect(
      selectInitialJsFiles(MANIFEST(['static/chunks/a.js', 'static/chunks/a.js', 'static/chunks/b.js'])),
    ).toEqual(['static/chunks/a.js', 'static/chunks/b.js']);
  });

  it('ignores non-JavaScript entries (CSS, maps)', () => {
    expect(
      selectInitialJsFiles(
        MANIFEST(['static/chunks/a.js', 'static/css/app.css', 'static/chunks/a.js.map']),
      ),
    ).toEqual(['static/chunks/a.js']);
  });

  it.each([
    ['missing pages map', {}],
    ['missing /page key', { pages: {} }],
    ['non-array file list', MANIFEST('nope')],
    ['empty file list', MANIFEST([])],
    ['no JavaScript after filtering', MANIFEST(['static/css/app.css'])],
  ])('fails safely on %s (never a silent 0-byte pass)', (_label, manifest) => {
    expect(() => selectInitialJsFiles(manifest)).toThrow();
  });
});

describe('selectLazyGlobeFiles', () => {
  it('collects globe lazy chunks with their import-graph provenance', () => {
    const rows = selectLazyGlobeFiles(LOADABLE);
    expect(rows).toEqual([
      {
        file: 'static/chunks/globe-webgpu.js',
        via: 'components\\globe\\EarthRenderer.tsx -> ./WebGPUEarth',
      },
      {
        file: 'static/chunks/globe-webgl.js',
        via: 'components\\globe\\EarthRenderer.tsx -> ./GlobeScene',
      },
    ]);
  });

  it('ignores non-globe mappings (charts stay counted-if-initial, never excluded)', () => {
    const rows = selectLazyGlobeFiles(LOADABLE);
    expect(rows.some((row) => row.file === 'static/chunks/charts.js')).toBe(false);
  });

  it('normalizes Windows separators and skips non-JS files', () => {
    const rows = selectLazyGlobeFiles({
      'components/globe/EarthRenderer.tsx -> ./WebGPUEarth': {
        files: ['static/chunks/a.js', 'static/chunks/a.js', 'static/chunks/b.css'],
      },
    });
    expect(rows).toEqual([
      { file: 'static/chunks/a.js', via: 'components/globe/EarthRenderer.tsx -> ./WebGPUEarth' },
    ]);
  });

  it('fails safely on a malformed manifest', () => {
    expect(() => selectLazyGlobeFiles(null)).toThrow();
    expect(() => selectLazyGlobeFiles(42)).toThrow();
  });
});

describe('gzipSize', () => {
  it('matches Node zlib at the pinned level', () => {
    const buf = Buffer.from('const x = 1;'.repeat(100));
    expect(gzipSize(buf)).toBe(zlib.gzipSync(buf, { level: GZIP_LEVEL }).length);
    expect(gzipSize(buf)).toBeLessThan(buf.length);
  });
});

describe('evaluateBudget', () => {
  it('passes under budget and reports per-file rows largest-first', () => {
    const nextDir = makeNextDir({
      'static/chunks/small.js': '1',
      'static/chunks/big.js': 'x'.repeat(5000),
    });
    const report = evaluateBudget({
      nextDir,
      initialFiles: ['static/chunks/small.js', 'static/chunks/big.js'],
      lazyGlobeFiles: [],
      budgetBytes: 1_000_000,
    });
    expect(report.pass).toBe(true);
    expect(report.rows.map((row) => row.file)).toEqual([
      'static/chunks/big.js',
      'static/chunks/small.js',
    ]);
    expect(report.totalGzipBytes).toBe(
      report.rows.reduce((sum, row) => sum + row.gzipBytes, 0),
    );
  });

  it('passes exactly at the threshold and fails one byte over', () => {
    const nextDir = makeNextDir({ 'static/chunks/a.js': 'y'.repeat(3000) });
    const size = gzipSize(fs.readFileSync(path.join(nextDir, 'static/chunks/a.js')));
    const base = {
      nextDir,
      initialFiles: ['static/chunks/a.js'],
      lazyGlobeFiles: [],
    };
    expect(evaluateBudget({ ...base, budgetBytes: size }).pass).toBe(true);
    expect(evaluateBudget({ ...base, budgetBytes: size - 1 }).pass).toBe(false);
  });

  it('fails safely on a missing chunk file', () => {
    const nextDir = makeNextDir({});
    expect(() =>
      evaluateBudget({
        nextDir,
        initialFiles: ['static/chunks/gone.js'],
        lazyGlobeFiles: [],
        budgetBytes: 1_000_000,
      }),
    ).toThrow(/missing on disk/);
  });

  it('fails safely on an empty initial set (cannot accidentally pass)', () => {
    const nextDir = makeNextDir({});
    expect(() =>
      evaluateBudget({ nextDir, initialFiles: [], lazyGlobeFiles: [], budgetBytes: 1 }),
    ).toThrow(/empty initial asset set/);
  });

  it('fails when a lazy globe chunk is in the initial set (split regressed)', () => {
    const nextDir = makeNextDir({ 'static/chunks/globe.js': 'z'.repeat(100) });
    expect(() =>
      evaluateBudget({
        nextDir,
        initialFiles: ['static/chunks/globe.js'],
        lazyGlobeFiles: [{ file: 'static/chunks/globe.js', via: 'EarthRenderer.tsx -> ./GlobeScene' }],
        budgetBytes: 1_000_000,
      }),
    ).toThrow(/code-split regressed/);
  });

  it('keeps shared/runtime chunks counted while globe chunks stay excluded', () => {
    const nextDir = makeNextDir({
      'static/chunks/webpack.js': 'w'.repeat(100),
      'static/chunks/app.js': 'a'.repeat(200),
      'static/chunks/globe-webgl.js': 'g'.repeat(5000),
    });
    const report = evaluateBudget({
      nextDir,
      initialFiles: ['static/chunks/webpack.js', 'static/chunks/app.js'],
      lazyGlobeFiles: [
        { file: 'static/chunks/globe-webgl.js', via: 'EarthRenderer.tsx -> ./GlobeScene' },
      ],
      budgetBytes: 1_000_000,
    });
    expect(report.pass).toBe(true);
    expect(report.rows.map((row) => row.file).sort()).toEqual([
      'static/chunks/app.js',
      'static/chunks/webpack.js',
    ]);
    expect(report.lazyRows).toHaveLength(1);
    expect(report.lazyTotalGzipBytes).toBeGreaterThan(0);
  });
});
