# T5.3 Supply-Chain Security — Audit and Maintenance Record

**Audit date:** 2026-10-14 · **Package manager:** npm 11.14.1 · **Runtime:** Node 24.15.0
**Base commit:** `0dc04f7` (`T4.6: add low-power mode`)
**Task commit:** `T5.3: add supply-chain security checks` (recorded on commit)
**Lockfile:** `package-lock.json` — unchanged by this task (see §3).

**Disposition: implementation COMPLETE; CI audit gate knowingly RED
(§5). This is not described as passing anywhere.**

---

## 1. Baseline (committed lockfile, fresh `npm audit --json`)

`npm audit`: **16 advisories — 6 moderate / 8 high / 2 critical**
(identical totals to the historical note, re-verified — not repeated).

### High (8) — all require a breaking major; none remediated

| Package (installed) | Advisory | Introduced via | Safe fix? |
|---|---|---|---|
| braces@3.0.3 (`*`) | GHSA-vfj7-8cjw-p6xm — stack-exhaustion DoS via nested patterns | tailwindcss@3.4.19 ← chokidar / micromatch (CSS build) | No — only tailwindcss 4.3.3 (major) |
| chokidar@3.6.0 (2.0.0–3.6.0) | via braces above | tailwindcss@3.4.19 | No — same major |
| fast-glob@3.3.1/3.3.3 (`*`) | via micromatch | tailwindcss@3.4.19 chain + @next/eslint-plugin-next@15.5.27 chain (bundled copy) | No — tailwindcss 4 / plugin major line |
| micromatch@4.0.8 (≥0.2.0) | via braces above | tailwindcss@3.4.19 | No — same major |
| postcss (nested 8.4.31, ≤8.5.22) | GHSA-qx2v-qp2m-jg93 (XSS via `</style>`) + GHSA-6g55-p6wh-862q (sourceMappingURL read) | next@15.5.27 hard dep (top-level postcss@8.5.29 is already patched) | No — only next 16.4.0 (major) |
| tailwindcss@3.4.19 | meta-entry for the chain above | devDependency (CSS build) | No — 4.3.3 (major) |
| vite@5.4.21 (≤6.4.2) | GHSA-4w7w-66w2-5vf9 — path traversal in optimized-deps `.map` | vitest@2.1.9 (test toolchain) | No — only vitest 5.0.4 (major) |
| @next/eslint-plugin-next@15.5.27 | via fast-glob above | devDependency (lint) | No compatible fix offered (only a major-line change) |

### Critical (2) — none remediated

| Package (installed) | Advisory | Introduced via | Safe fix? |
|---|---|---|---|
| tinypool@1.1.1 (≤2.1.1) | GHSA-… — prototype-pollution gadget in worker options → RCE | vitest@2.1.9 pins tinypool ^1 (fix exists upstream in 2.1.2, unreachable in the ^1 line) | No — only vitest 5.0.4 (major) |
| vitest@2.1.9 (≤4.1.10) | GHSA-… — arbitrary file read/exec when Vitest UI server listens | devDependency (test runner; UI server never started in CI) | No — 5.0.4 (major) |

### Moderate (6) — documented, not hidden by the high threshold

@vitest/mocker@2.1.9, esbuild@0.21.5, next@15.5.27 (via postcss),
postcss-nested@6.2.0, postcss-selector-parser@6.1.4, vite-node@2.1.9 —
every one resolves only through the same three breaking majors above.
Low/info: 0.

### Exposure (verified, not assumed)

- Every flagged advisory sits in a **dev/build-time chain**: test runner
  (vitest/vite/tinypool/esbuild/@vitest/mocker/vite-node), CSS build
  (tailwindcss/postcss/braces/chokidar/fast-glob/micromatch/
  postcss-nested/postcss-selector-parser), lint
  (@next/eslint-plugin-next), or Next build (next→postcss).
- **Zero flagged advisories touch the production runtime** (React,
  three.js, route handlers, `@photostructure/tz-lookup`, server deps).
- Exploitation would need attacker-controlled input into build/test
  tooling (dev servers, mock redirection, glob patterns, CSS sources) —
  none of which accept remote input in this pipeline (repo-controlled
  inputs only; CI runs `npm ci` + gates; production serves `next start`
  output). This bounds the risk; it does not erase the advisories.

## 2. Dependency-tree health

- `npm ls` for the flagged packages: single versions, deduped where
  overlapping, no `invalid`/peer-conflict markers.
- `@next/eslint-plugin-next@15.5.27` already matches `next@15.5.27`
  (the old B-01 major mismatch is gone).
- No unexpected package-manager files; lockfile synchronized with
  `package.json` (verified via `npm ci` in §6).

## 3. Remediation (conservative — no lockfile churn)

- Inspected every `fixAvailable` field: all highs/criticals (and 5 of 6
  moderates) resolve only via breaking majors — vitest 5.0.4,
  tailwindcss 4.3.3, next 16.4.0 — each explicitly out of scope
  (alignment scope; T4.5 bundle math assumes the current majors).
- `npm audit fix --dry-run` → **"up to date"**: nothing applicable
  without `--force`. `npm audit fix --force` was NOT run (it would drag
  three breaking majors at once, unreviewed).
- The lone `fixAvailable: true` (postcss-nested) resolves to nothing:
  its fix path requires the still-vulnerable selector-parser line.
- Targeted bumps were checked and rejected with evidence: tinypool 2.1.2+
  cannot satisfy vitest 2's ^1 range; selector-parser 7.1.6 cannot
  satisfy tailwind 3's 6.x line; top-level postcss is already patched
  (8.5.29) — the vulnerable copy is next's pinned 8.4.31.
- **Result: zero dependency changes, zero lockfile diff.** Nothing was
  suppressed, overridden, or threshold-gamed.

## 4. CI gate (blocking)

`.github/workflows/ci.yml` (Node 24, after `npm ci`, on the committed
lockfile): `npm audit --audit-level=high` — high AND critical fail the
job; no `continue-on-error`, no suppression. Moderate/low stay
documented here, never described as absent.

## 5. Gate status — RED, explicitly

`npm audit --audit-level=high` **fails on the final tree** (8 high +
2 critical, §1). Per the execution plan this task is therefore NOT
claimed complete while the gate is red: it needs an explicit owner
decision — either (a) a temporary exception with rationale, narrow scope
and expiry, or (b) approval to migrate vitest 5 / tailwindcss 4 /
next 16 as separately justified breaking-change tasks (each re-runs the
full gates + bundle budget, which the current majors satisfy).

## 6. Maintenance

`.github/dependabot.yml` (new, version 2, YAML-validated): npm `/` +
github-actions `/`, weekly, compatible minor+patch grouped (limit 5
open PRs each), majors arrive as separate reviewable PRs, no automerge.
No Renovate config exists — Dependabot is the single system. Every
update still passes full CI (including the audit gate) before merge.
