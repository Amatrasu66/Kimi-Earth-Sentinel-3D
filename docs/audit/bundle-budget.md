# T4.5 Initial JS Bundle Budget — Enforcement Record

**Date:** 2026-10-14 · **Base commit:** `ab12794` (`T4.3: measure and optimise marker scalability`)
**Task commit:** `T4.5: enforce initial JS bundle budget` (recorded on commit)
**Method:** production `next build` output + Node zlib accounting only — no
bundle analyzer, no Lighthouse, no browser automation (all excluded by
owner decision).

**Disposition: COMPLETE — gate green in CI (`PASS`, 193.5 KiB ≤ 200 KiB).**

---

## 1. Budget definition

- **Threshold:** 200 KiB gzip = **204,800 bytes** ("KB" read as KiB).
- **Counted:** the JavaScript files in production
  `app-build-manifest.json` `pages["/page"]` — the exact files Next.js
  schedules for `/` — deduplicated, `.js` only. Shared/runtime chunks
  stay counted.
- **Excluded:** only the lazily loaded globe chunks, identified by their
  `react-loadable-manifest.json` import-graph keys
  (`EarthRenderer.tsx -> ./WebGPUEarth`, `EarthRenderer.tsx -> ./GlobeScene`),
  verified absent from the counted set on every run.
- **Compression:** Node zlib level 6 per file, summed (browsers download
  files separately; no cross-file compression).
- **Not this metric:** the Next.js route-size display (raw-ish, not gzip),
  HTML/CSS size, texture payload, GPU memory, frame rates, Web Vitals.

## 2. Baseline and remediation (no threshold/exclusion gaming)

| Stage | Initial gzip | Verdict |
|---|---|---|
| Pre-T4.5 baseline (WebGL globe static, `three` via `lib/geo`) | **450,856 B (440.3 KiB)**, 9 files | BREACH (+246,056 B) |
| After `GlobeScene` → lazy `ssr:false` chunk | 299,080 B (292.1 KiB) | BREACH (+94,280 B) |
| After `lib/geo` three-free (**final**) | **198,098 B (193.5 KiB)**, 6 files | **PASS** (margin 6,702 B) |

Root causes (both proven from the asset graph, both genuinely initial):
1. The default dotted route downloaded ~238 KiB gzip of three.js/R3F/drei
   it never executes — `GlobeScene` was statically imported although both
   3D renderers are opt-in. Fix: lazy `ssr:false` chunk with a
   veil-then-globe fallback, mirroring the existing WebGPU pattern.
   `?renderer=webgl`, the WebGPU→WebGL fallback, DPR, disposal and
   reduced-motion behavior are unchanged (plumbing pinned by
   `EarthRenderer.test.tsx`).
2. The three.js core (383 KB raw / ~101 KiB gzip) still shipped initially
   for two vector helpers — `src/lib/geo.ts` (`import * as THREE`) sits in
   the initial graph via the default dotted renderer. Fix: plain
   `Vec3`/`Quat` math in `lib/geo` (same formulas, bit-for-bit);
   the lazy 3D paths convert once at their boundary. Parity against the
   real three.js implementation (coordinate grid + antiparallel guard)
   pinned in `geo.test.ts`; `solar`/`motion`/`markerSync` suites green.

Final counted set (largest first):
`575-*` 64,372 · `4bd1b696-*` (react-dom) 54,363 · `255-*` 46,331 ·
`page-*` 30,795 · `webpack-*` 2,003 · `main-app-*` 234 → **198,098 B**.

Excluded lazy globe chunks (informational, verified not initial):
WebGL set 5 files (~255 KiB gzip, incl. the three.js core) +
WebGPU set 3 files (~191 KiB gzip).

Deliberately not counted: the legacy-only `noModule` polyfill chunk
(~39.6 KiB gzip) — evergreen browsers skip it.

## 3. Enforcement

- `scripts/bundle-budget.mjs` (zero dependencies) + `npm run bundle:check`.
- CI (`.github/workflows/ci.yml`, Node 24): `npm ci → lint → typecheck →
  test → build → bundle:check`. Exit 1 on breach, exit 2 on any
  accounting failure (missing build, malformed/ambiguous manifests, empty
  asset set, missing chunk file, regressed code-split). A red gate blocks
  the job; the budget/exclusions may not be loosened without owner approval.
- Logic tests: `src/lib/bundle-budget.test.ts` (20 tests — manifest
  parsing, dedupe, gzip math, exact-boundary pass/fail, fail-safe paths,
  lazy-mapping provenance, split-regression guard, shared-chunks-counted).
  Fixtures only; the production verdict always comes from real `.next` output.

## 4. Verification (this task)

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test -- --minWorkers=1 --maxWorkers=2` — full suite green
  (baseline 689/74 + 20 new budget tests + 3 new geo parity tests).
- `npm run build` — green (`/` 95 kB / 198 kB display sizes).
- `npm run bundle:check` — **PASS** (198,098 ≤ 204,800).
- `npm run textures:report` — both tiers MET (unaffected).
- `?renderer=webgl|webgpu` plumbing, fallback chain and URL contracts —
  unchanged, covered by existing suites (browser visual check owner-manual).

## 5. Limitations and follow-ups

- Thin margin (~6.7 KiB, ~3.3%): future dependency growth can breach the
  gate — that is the gate working as intended, not a defect. The next
  honest lever, if needed, is further code-splitting of genuinely
  lazy content — never budget/threshold edits without approval.
- File-level gzip is a transfer proxy, not a browser measurement.
- Phase 3 disposition unchanged (NOT COMPLETE); this record does not
  amend it.
