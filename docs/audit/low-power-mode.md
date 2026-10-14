# T4.6 Low-Power Rendering Mode — Implementation Record

**Date:** 2026-10-14 · **Base commit:** `7364c4e` (plan) on `87cc989` (T4.5)
**Task commit:** `T4.6: add low-power mode` (recorded on commit)
**Method:** code inspection + deterministic unit/component tests only — no
browser automation (owner-cancelled). No FPS, battery, or GPU-memory
numbers were measured by the agent; none are claimed.

**Disposition: code COMPLETE; device behavior OWNER VERIFICATION REQUIRED.**

---

## 1. Audit findings (what already existed)

- Tiers: `textureTiers.ts` — `standard` (2K) / `high` (4K) manifest,
  capability-gated `resolveTextureTier`, per-texture standard fallback,
  mount-stable `useTextureTier()`, disposal via renderer teardown.
- DPR: three separate inline policies — WebGL `getAdaptiveDpr`
  (coarse 1.5 / fine 2), WebGPU `setPixelRatio` (same numbers), dotted
  `getPixelRatio` (same numbers). No central policy.
- Preferences: `useSingleKeyShortcuts` / `useFirstRunHint` localStorage
  contract — `useState(default)` + post-hydration read, guarded
  try/catch, SSR-safe, no write-back on mount. No URL-state for prefs.
- Reduced motion: independent `usePrefersReducedMotion` subscription
  consumed by all three engines (never in markup).
- Loops: T4.2 demand gates on all paths; cloud drift already follows the
  activity gate. Decorative-but-removable: the cloud shells (WebGL
  `CloudLayer`, WebGPU clouds mesh + 809 KB texture fetch).
- Settings: `SettingsModal` Globe tab (auto-rotate switch + status),
  Diagnostics rows via pure `buildDiagnosticRows` + copyable report.

## 2. Implemented policy

Preference `auto` (default) / `on` / `off` (`src/lib/low-power.ts`,
pure, three-free so the initial bundle is untouched):
- **Auto** engages only on: Save-Data, coarse pointer, or known
  `deviceMemory` ≤ 2 GB. Unknown signals never engage. WebGPU support is
  not a signal in either direction. Mount-stable snapshot — signals are
  never re-subscribed, so the mode cannot flap.
- **On** always activates; **Off** always vetoes the heuristic and
  restores the normal adaptive tier (never forces high).
- Status text always shows preference vs active
  (`Auto — low-power active (mobile display)` vs `Auto — full quality…`).

Active low-power rendering (all paths that have the control):
- **Textures:** standard tier forced — WebGL via
  `useTextureTier(lowPowerActive)`, WebGPU at init. High-tier URLs are
  never requested. WebGPU additionally never fetches the unused 809 KB
  cloud texture (progress counts 4/4, honestly).
- **DPR:** centralized `maxDprForMode` — ceiling **1** in low-power
  (was 1.5 coarse / 2 fine), applied in WebGL (`dpr` prop, live),
  WebGPU (`setPixelRatio` at init) and dotted (backing-store rebuild).
- **Effects:** decorative cloud shell off in both 3D paths (WebGL: not
  mounted, so its texture never downloads; WebGPU: mesh not created).
  Atmosphere, stars, lighting, markers, picking, fly-to untouched.
- **Dotted:** DPR cap only, applied via a resize re-evaluation without
  remount — drag/zoom view state survives the toggle. Dots, markers,
  picking, reduced motion untouched.
- **Mode flips:** the 3D branch remounts (`key`), so the old texture set
  releases through the existing teardown before the new set allocates —
  never a mid-life swap, never double allocation. Dotted never remounts.
- **Reduced motion:** fully independent — separate preference, separate
  plumbing, separate tests; the two compose (still AND dimmer).

## 3. Settings UX

- Globe tab: Auto / On / Off radio group + live status line.
- Diagnostics: new `Low-power mode` row (preference + resolved state),
  included in the copyable report. Old `buildDiagnosticRows` callers
  without the fields read `—`, never a fabricated mode.

## 4. Verification (actually run)

- `npm run lint` / `npm run typecheck` — clean.
- `npm test` (constrained workers, two runs): **77/77 files, 741/741
  tests green** (baseline 712/75; +29: 14 policy, 6 hook, 2 tier, 7
  settings). First run lost one file to a tinypool worker crash
  (environmental OOM flake); the re-run completed fully. Residual: the
  5 pre-existing radix/jsdom teardown warnings from
  `SentinelApp.a11y.test.tsx`, also present before this task.
- `npm run build` — green (`/` 96.2 kB / 199 kB display).
- `npm run bundle:check` — **PASS: 199,259 B (194.6 KiB) ≤ 204,800**;
  headroom 5,541 B (was 6,702). No threshold/exclusion changes. T4.6
  cost ≈ 1.2 KiB gzip.
- `npm run textures:report` — both tiers MET (unaffected).
- `?renderer=` plumbing, fallback chain, URL contracts — unchanged,
  covered by existing suites.

## 5. Not measured — owner-manual checklist

On desktop and a representative mobile device, in dotted / WebGL /
WebGPU where supported (see task brief §5 for the full list):
- Auto / On / Off switching, persistence across reload, status-line
  truthfulness (esp. Auto reason on mobile vs desktop).
- Standard-tier textures under low-power (compare clarity vs full).
- DPR/effect differences (resolution softness, absent clouds).
- Reduced-motion × low-power composition (four combinations).
- Renderer fallback + texture cleanup on mode flips (no stale visuals,
  no console errors, diagnostics sane).
- Real battery/FPS/thermal outcomes — unmeasured; unit tests assert
  code policy only.

## 6. Limitations

- Thin bundle headroom (~5.5 KiB): future dependency growth can breach
  the gate — by design; next lever is further lazy-splitting, never
  budget edits without approval.
- Mode-flip 3D remount re-runs init (veil → textures → ready); the
  drei texture cache is URL-keyed and shared, so re-entry is cheap but
  not free — owner to confirm feel.
- Auto heuristic is conservative by design (may stay full-quality on
  some weak devices with no readable signal); manual On covers that.
- Phase 3 disposition unchanged (NOT COMPLETE).
