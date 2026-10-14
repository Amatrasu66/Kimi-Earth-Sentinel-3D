# T5.3A Security Remediation Plan — Evidence and Migration Options

**Plan date:** 2026-10-14 · **Environment:** npm 11.14.1 · Node 24.15.0
**Base commit:** `a23ccd9` (`T5.3: add supply-chain security checks`)
**Baseline:** `docs/audit/supply-chain.md` (2026-10-14 — preserved, not rewritten)

**Status: PLANNING ONLY. No dependency, package-file, CI, or application
change was made in this task. The `npm audit --audit-level=high` gate is
still RED. Nothing here claims an advisory fixed or the gate passed.**

---

## 1. Revalidation (commands run)

- `npm audit --json` (full tree), `npm audit --omit=dev --json`
  (production install), `npm audit --audit-level=high` (gate command)
- `npm ls <flagged packages>` (paths), `npm audit fix --dry-run`
  (reaffirmed: "up to date", nothing applicable without `--force`)
- `npm view` (registry metadata): vitest/tinypool/vite/esbuild/tailwindcss/
  next/postcss/postcss-selector-parser/@next/eslint-plugin-next versions,
  dependencies, peerDependencies, engines
- Vendor sources: GHSA pages for GHSA-5xrq-8626-4rwp, GHSA-5gmw-xhrv-c9v3,
  GHSA-82fw-gwwq-j7x9, GHSA-fxqj-rqcc-2cmp; OSV API
  (`api.osv.dev/v1/vulns/…`) for the remaining IDs; vitest migration
  guide, tailwindcss upgrade guide, Next.js 16 upgrade guide/blog
- Repo grep: `bench`, `test.sequential`, `expect.extend`, `VITEST_POOL_ID`,
  snapshots, `from 'chai'`, `toThrow('')`, `resolveConfig`, `next/image`,
  `vi.useFakeTimers` users, dynamic-route `params` handling,
  `postcss.config.mjs`, `tailwind.config.js`, `src/middleware.ts`

**Fresh counts (unchanged totals): 16 advisories — 6 moderate / 8 high /
2 critical.** Advisory DB movement since the T5.3 baseline (same totals):
postcss now cites 4 GHSA URLs (was 2), tinypool/vite/vitest entries gained
URLs, and the next fix rolled 16.4.0 → 16.4.1.

## 2. Corrections to the T5.3 assumptions (evidence-backed)

1. **"Vitest 5 is required" is wrong.** Vendor ranges show the vitest
   critical (GHSA-5xrq) patched in **4.1.0** (and 3.2.6), and the mocker
   moderate (GHSA-82fw) patched in **4.1.11** — with 2.x/3.x explicitly
   unmaintained. npm's `fixAvailable: 5.0.4` names the newest fix, not the
   minimal one. **vitest@4.1.11 is the minimal candidate** for the whole
   vitest chain (§4, option A).
2. **Production install is not advisory-free.** `npm audit --omit=dev`
   reports **1 high (postcss) + 1 moderate (next)** at
   `node_modules/next/node_modules/postcss` (8.4.31, shipped to the
   server). T5.3's "zero touch the production runtime" holds for
   *runtime code paths* (postcss only compiles CSS at build time; no
   remote input reaches it), but not for the installed set. 0 critical
   in the production install.
3. **Even all three majors leave exactly two HIGH nodes sharing one root
   cause**: `@next/eslint-plugin-next` (15.5.27 today, 16.4.1 latest)
   hard-depends on **fast-glob@3.3.1 → micromatch → braces@3.0.3
   (GHSA-vfj7, unpatched upstream)** — one finding on the plugin node, one
   on the nested fast-glob node. Verified in registry metadata for 16.4.1.
   No line fixes it; npm's `fix: 14.2.35` metadata is a stale downgrade
   pointer, not a path. Gate-green therefore ultimately needs a **scoped,
   expiring exception for this one residual chain** — or a separate
   plugin-removal evaluation. The owner must know this before approving
   any migration.

## 3. Remediation matrix (current audit data + vendor ranges)

Severities: (C)ritical, (H)igh, (M)oderate. "Path" abridged to the parent.

| Advisory | Sev | Dependency path | Affected range (vendor) | Minimal fix that clears it |
|---|---|---|---|---|
| GHSA-5xrq-8626-4rwp (vitest UI/.map RCE-gated read; needs listening UI server or Windows browser mode — neither used here) | C | vitest@2.1.9 (dev) | ≥4.0.0,<4.1.0 and <3.2.6 (npm shows ≤4.1.10) | vitest **4.1.11** (patched 4.1.0) |
| GHSA-5gmw-xhrv-c9v3 (tinypool PP→RCE; needs PP primitive — none in tree) | C | vitest@2.1.9 → tinypool@1.1.1 | ≤2.1.0, patched 2.1.1 | vitest **4.1.11** (tinypool dep removed entirely) |
| GHSA-85c8-ppgw-ccpr (tinypool run() PP→RCE) | C | same as above | fixed 2.1.2 (1.x affected, ^1 range can't take 2.x) | vitest **4.1.11** (removed) |
| GHSA-4w7w-66w2-5vf9 (vite .map traversal; needs exposed dev server) | H | vitest@2.1.9 → vite@5.4.21 | <6.4.2 / <7.3.2 / 8.0.0–8.0.4 | vite ≥6.4.2 (via vitest 4 peer → vite 8.3.4) |
| GHSA-v6wh-96g9-6wx3 (launch-editor NTLMv2 leak, Windows) | H | same as above | fixed 6.4.3 / 7.3.5 / 8.0.16 | vite ≥6.4.3 (via vitest 4 peer → 8.3.4) |
| GHSA-fx2h-pf6j-xcff (vite fs.deny bypass, Windows) | H | same as above | fixed 6.4.3 / 7.3.5 / 8.0.16 | vite ≥6.4.3 (via vitest 4 peer → 8.3.4) |
| GHSA-82fw-gwwq-j7x9 (@vitest/mocker redirect read; needs reachable HMR socket) | M | vitest@2.1.9 → @vitest/mocker@2.1.9 | ≥2.1.0,<4.1.11 (2.x/3.x unmaintained, no fix planned) | **4.1.11** (patched) |
| GHSA-67mh-4wv8-2f99 (esbuild dev-server read) | M | … → vite@5.4.21 → esbuild@0.21.5 | fixed 0.25.0 | vite 8 (no esbuild dep at all — Rolldown-based) |
| vite-node range ≤2.2.0-beta.2 | M | vitest@2.1.9 → vite-node@2.1.9 | — | vitest 4 (dep removed) |
| GHSA-vfj7-8cjw-p6xm (braces stack-DoS; needs nested-pattern input) | H | tailwindcss@3.4.19 → chokidar/micromatch → braces@3.0.3; ALSO eslint-plugin@15.5.27 → fast-glob → micromatch → braces | no fix (3.0.3 latest) | tailwindcss **4.3.3** (zero JS deps — native binary; chain gone). Plugin path: NO fix on any line |
| chokidar / micromatch / fast-glob entries | H | tailwind chain (+ plugin chain for fast-glob) | via braces above | tailwindcss **4.3.3** (plugin path: none) |
| GHSA-rj75-hqrm-r3gf (selector-parser CPU exhaustion) | M | tailwindcss@3.4.19 → postcss-nested → selector-parser@6.1.4 | fixed 7.1.6 (6.x latest is 6.1.4; tailwind 3 can't take 7.x) | tailwindcss **4.3.3** |
| GHSA-qx2v-qp2m-jg93 (postcss XSS) | H | next@15.5.27 → postcss@8.4.31 (top-level 8.5.29 already clean) | fixed 8.5.10 | next **16.4.1** (pins postcss 8.5.23 ≥ all four fixes) |
| GHSA-6g55-p6wh-862q (postcss sourceMappingURL read) | H | same as above | fixed 8.5.12 | next **16.4.1** |
| GHSA-r28c-9q8g-f849 (postcss .map traversal) | H | same as above | fixed 8.5.18 | next **16.4.1** |
| GHSA-fxqj-rqcc-2cmp (postcss incomplete fix, no-`from` .map read) | M | same as above | fixed 8.5.23 | next **16.4.1** |
| next meta-entry (via postcss) | M | next@15.5.27 | — | next **16.4.1** |
| postcss-nested (via selector-parser) | M | tailwindcss@3.4.19 | `fix:true` resolves to nothing (needs still-vulnerable 6.x line) | tailwindcss **4.3.3** (chain gone) |

Dead ends verified (not assumed): tailwind 3.x latest IS 3.4.19 (no patch
line); every next 15.x pins postcss **8.4.31** (even 15.5.28); vitest 3.2.7
keeps tinypool ^1 + mocker 3.2.7 (both unfixable per vendor) — clears the
vitest-critical (3.2.6+ patched) but leaves the tinypool-critical, so it
cannot green the gate; overrides are forbidden by task policy.

## 4. Candidate migration sets (ranked)

### Option A (recommended first): vitest 2.1.9 → 4.1.11 — test-only major
- **Clears:** both criticals, vite-high ×3, mocker/esbuild/vite-node
  moderates (6 advisories: 2C/1H/3M). Registry-verified tree: no
  tinypool, no vite-node, mocker 4.1.11, vite peer ^6||^7||^8 → 8.3.4
  (clean per §3), vite 8 has no esbuild.
- **Scope:** one devDependency (+ vite peer auto-install; add explicit
  vite devDep in implementation). Node ≥20 ✓ (24), @types/node peer ✓
  (24), jsdom `*` ✓ (30). No app-code impact (runner only).
- **Repo-specific risks (all verification-bound, none blocking):**
  `vi.useFakeTimers` in 7 test files (v4 fake-timers are compatible, run
  the suite); `--min/maxWorkers` CLI flags vs consolidated `maxWorkers`
  (still supported); pool default is `forks` in v4 (fine headless);
  `vi.mock` already top-level everywhere (v5-only hard rule, N/A);
  no bench/sequential/snapshots/custom-matchers/`toThrow('')` per grep.
- **Verification:** clean install, `npm ls` peer-clean, lint, typecheck,
  full 741-test suite, build, bundle:check ≤204800 (runner isn't in the
  client bundle — expect byte-identical output), textures:report.
- **Leaves:** tailwind chain, next chain, plugin fast-glob (gate RED).

### Option B: vitest 3.2.7 — REJECTED for gate purposes
Clears the vitest-critical (vendor: patched 3.2.6) but leaves the
tinypool-critical (^1 line, vendor: no fix planned) — gate stays red on
a critical with no smaller alternative. Documented, not pursued.

### Option C: vitest 5.0.4 — deferred, not recommended now
Same advisory coverage as A (5.0.4 outside all ranges) with strictly
larger blast radius: Node ≥22.12 ✓, new chai ^6.3.0 + @types/chai deps,
`clearMocks` defaults TRUE (real breakage risk: cross-test mock-history
assertions need auditing — e.g. clipboard/fetch call counts),
removed entrypoints (unused per grep), unawaited-assertion failures,
`.vitest` artifact dir (`.gitignore`), pretty-format titles (no
snapshots ✓). Revisit at vitest-4 EOL, not for this gate.

### Option D: tailwindcss 3.4.19 → 4.3.3 — styling major (AFTER A)
- **Clears:** braces/chokidar/fast-glob(tw path)/micromatch/
  selector-parser/tailwindcss entries (4H/2M). v4 is native (no JS deps).
- **Scope:** new `@tailwindcss/postcss` dep; drop `tailwindcss` plugin +
  `autoprefixer` from `postcss.config.mjs`; `globals.css`
  `@tailwind`→`@import "tailwindcss"`; `tailwind.config.js` via `@config`
  or CSS-first migration (upgrade tool `npx @tailwindcss/upgrade` on a
  branch + diff review). Visual risks needing owner browser checks (no
  automation): ring 3px→1px, shadow/rounded/blur renames, outline-none→
  hidden (focus rings!), border default currentColor, divide/space
  selector changes, gradient renames, preflight placeholder/cursor.
  Verify: `tailwindcss-animate` v4 compat, globals-css tests, full suite,
  build. Browser support floor becomes Safari 16.4+/Chrome 111+/FF 128+
   (owner call). JS bundle impact: CSS-only — expect initial JS unchanged,
   re-verify budget anyway. Expected: 4 left (3H/1M: plugin-H,
   fast-glob-H via the plugin path, postcss-H, next-M).
- **Leaves:** next chain, plugin fast-glob (gate RED).

### Option E: next 15.5.27 → 16.4.1 — platform major (AFTER D)
- **Clears:** postcss-high + next-moderate — including the ONLY
  production-install high (pins postcss 8.5.23 ≥ all four fixes).
- **Scope (largest):** `src/middleware.ts` (T1.3 rate limiter!) →
  `proxy.ts` + export rename per v16 convention; peers React 18/19 ✓
  (19.2), Node ≥20.9 ✓, TS 5.1+ ✓; async `params` already used ✓;
  no `next/image` ✓; `@next/eslint-plugin-next`→16.4.1 +
  `@types/react*` latest; headers() config stable.
  **Two hard risks:** (1) Turbopack is the default `next build`
  bundler — the T4.5 budget tooling reads webpack manifests
  (`app-build-manifest.json`, `react-loadable-manifest.json`); if
  Turbopack output differs, either keep `next build --webpack` or
  re-tool the checker (separately justified, budget unchanged at
   204800). (2) eslint-plugin 16.4.1 STILL bundles fast-glob 3.3.1 →
   both plugin-chain HIGH nodes survive this migration.
- **Verification:** all standard gates + rate-limit 429/Retry-After
  suites, header/CSP suites, page SSR suites, bundle-manifest audit,
  owner production-deployment checks.
- **Leaves:** plugin fast-glob HIGH — unfixable upstream.

### Residual after A+D+E: exactly TWO high nodes, ONE root cause
`@next/eslint-plugin-next` (high node) + nested `fast-glob` (high node),
both tracing to braces GHSA-vfj7 through the plugin's fast-glob@3.3.1.
No fix on any line. Paths to green: (i) scoped, expiring owner exception
for this residual chain (recommended: lint-tooling-only, repo-controlled
glob inputs, no remote reachability); or (ii) a separate evaluation of
removing the plugin (loses Next-specific lint rules — not recommended
without its own review). **The owner must choose this before or with
the migrations — otherwise even all three majors end RED.**

## 5. Recommended sequence

1. **Option A** (vitest 4.1.11) — own commit, full gates. Test-only,
   no visual or production risk. Expected: 10 advisories left (0C/7H/3M).
2. **Option D** (tailwindcss 4.3.3) — own commit, full gates + owner
   visual pass (dotted/WebGL/WebGPU, viewports, focus rings). Expected:
   4 left (1H plugin + postcss-H + next-M + … recount: plugin-H,
   postcss-H, next-M = 1H/1M… plus nothing else: 2 left).
   Recount after A+D: remaining = postcss-H, next-M, plugin-H → 1H… wait:
   postcss-H (1H) + next-M (1M) + plugin-H (1H) = **2H/1M**.
3. **Option E** (next 16.4.1) — own commit, full gates + proxy/budget
   tooling verification + owner deployment checks. Expected: **2H left**
   (plugin + nested fast-glob nodes, one braces root cause).
4. Scoped exception for the residual plugin HIGH (or plugin-removal
   review) → gate green.

Each step re-runs: clean install, `npm ls`, lint, typecheck, full suite,
build, bundle:check (204800 unchanged), textures:report, plus the
migration-specific items above. No step changes the audit threshold,
adds exceptions, or touches unrelated code. T4.5 bundle headroom
(5,541 B) must be re-measured after E (bundler question) and D
(chunking shifts).

## 6. Uncertainty log

- vite 8.3.4 + vitest 4.1.11 runtime interop (peer range allows; prove
  via gates — `npm ls` + full suite).
- jsdom 30 under vitest 4/5 environments (peer `*`; prove via suite,
  esp. canvas/rAF/DOM suites).
- tailwindcss-animate@1.0.7 under v4 (verify in D; upgrade tool output
  will show).
- Next 16 Turbopack manifest compatibility with `bundle-budget.mjs`
  (verify in E; `--webpack` fallback documented).
- `npm audit` ranges are coarser than vendor ranges (e.g. vitest
  ≤4.1.10 vs vendor ≥4.0.0,<4.1.0 + <3.2.6) — remediation uses vendor
  ranges; audit re-verifies after each migration.
- No browser automation exists to verify visual migrations — owner-manual
  per standing decision.

## 7. References

- Audit: `npm audit --json`, `npm audit --omit=dev --json`,
  `npm audit --audit-level=high`, `npm ls`, `npm audit fix --dry-run`,
  `npm view` (registry metadata, 2026-10-14)
- https://github.com/vitest-dev/vitest/security/advisories
  (GHSA-5xrq-8626-4rwp, GHSA-82fw-gwwq-j7x9 + releases v3.2.6/v4.1.0/v4.1.11)
- https://vitest.dev/guide/migration/ (v5 + v4/v3 prerequisites)
- https://tailwindcss.com/docs/upgrade-guide (v3→v4: PostCSS plugin,
  directives, renames, preflight, `@config`, upgrade tool)
- https://nextjs.org/docs/app/guides/upgrading/version-16
  (proxy.ts, Turbopack default, async APIs, requirements)
- OSV API ranges for GHSA-4w7w/v6wh/fx2h/67mh/vfj7/rj75/85c8/
  qx2v/6g55/r28c; tinypool GHSA-5gmw; postcss GHSA-fxqj
- Baselines: `docs/audit/supply-chain.md`, `docs/audit/bundle-budget.md`
