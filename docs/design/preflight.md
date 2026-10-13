# Taste pre-flight checklist — Earth Sentinel 3D (T3.14 requirement)

**Source:** Section 14, “FINAL PRE-FLIGHT CHECK”, of the installed
`design-taste-frontend` skill (`.agents/skills/design-taste-frontend/SKILL.md`;
PRD T3.14 requires it “fully ticked in `docs/design/preflight.md`”).

**How to read the boxes:** only `[x]` means satisfied (with code/test
evidence). `[ ]` means classified otherwise — the **status word** governs:
**Complete** / **Owner verification required** / **Deferred by explicit
decision** / **Not complete** / **N/A** (reason given). Nothing is ticked
merely because the project builds.

**Scope honesty first:** that skill designs landing pages and portfolios, and
its §13 explicitly excludes dense product UI — which is what this app is (a
dark scientific workstation, `DESIGN.md` §1). Visual/GPU/browser verification
throughout remains owner-manual (no Playwright, screenshots, Lighthouse or
Axe in CI).

Related gates (not duplicated here): `web-design-guidelines` and
`react-best-practices` reviews live in
`docs/audit/phase-3-review-gates.md` §2; the manual register lives in
`docs/design/audit.md` §5.

## Matrix

- [ ] **Brief inference declared** — N/A. No brief exists; this is an
  existing product under an owner-locked preservation direction
  (reconciliation §13), audited in redesign mode instead (next item).
- [ ] **Dial values explicit** — N/A, same reason; no silent-baseline risk
  because nothing is being restyled.
- [x] **Design system chosen honestly** — Complete. One dark-only Sentinel
  system, recorded in `docs/design/DESIGN.md`; no stacked aesthetics.
- [x] **Redesign mode + audit performed** — Complete. Audit-first evidence:
  `docs/audit/current-state-reconciliation.md`, `phase-3-review-gates.md`,
  `DESIGN.md`, `docs/design/audit.md` (this task).
- [ ] **ZERO em-dashes on the page** — Not complete. Pre-existing em dashes
  in ~6 user-visible status/error strings (`api.ts` network/timeout errors,
  search empty-state, diagnostics rows, geography status). Changing product
  copy is out of scope — owner decision whether to restyle.
- [x] **Page Theme Lock** — Complete. Dark-only enforced (`dark` root,
  `color-scheme: dark`); no mid-page inversions (`SentinelApp.tsx`,
  `globals.css`).
- [x] **Color Consistency Lock** — Complete. Single `--sentinel-accent-rgb`
  source for all accent usage (`globals-css.test.ts`); the severity ramp is
  data encoding, not accent.
- [x] **Shape Consistency Lock** — Complete. 10/12/5–7px system, pills for
  semantic status only (`globals.css`, `SeverityBadge`, `ViewToggle`).
- [ ] **Button Contrast Check** — Owner verification required. No measured
  contrast ratios anywhere (unit suites assert structure, not ratios).
- [ ] **CTA Button Wrap** — N/A. No marketing CTAs; compact controls
  truncate by design (opposite rule).
- [ ] **Form Contrast Check** — Owner verification required. Search
  input/placeholder/focus-ring tokens exist but are unmeasured.
- [ ] **Serif discipline** — N/A. No serif in the stack
  (Instrument Sans / Inter).
- [ ] **Premium-consumer palette check** — N/A. Not a premium-consumer brief.
- [ ] **Italic descender clearance** — N/A. No italic display type in `src`.
- [ ] **Hero fits the viewport** — N/A. No hero; application shell.
- [ ] **Hero top padding** — N/A, same reason.
- [ ] **Hero stack discipline** — N/A, same reason.
- [ ] **Eyebrow count** — N/A. `sentinel-label` micro-labels are functional
  section labels of a dense workstation, not marketing eyebrows; capping
  them would remove information hierarchy.
- [ ] **Split-Header Ban** — N/A. Panel title rows are instrument headers,
  not marketing section headers.
- [ ] **Zigzag Alternation Cap** — N/A. No marketing sections.
- [ ] **No Duplicate CTA Intent** — N/A. Actions are distinct (Refresh vs
  Retry vs close/back); no same-intent pairs.
- [ ] **Logo wall = logo only** — N/A. No logo wall; credits as text
  (About tab, `public/geo/NOTICE.md`).
- [ ] **Bento Background Diversity** — N/A. No bento.
- [ ] **Logo-wall placement** — N/A, same reason.
- [ ] **Copy Self-Audit** — Owner verification required. No recorded
  systematic copy re-read (tracked in `audit.md` §3).
- [x] **Motion motivated** — Complete. Every animation one-line-justified:
  entrances (hierarchy), live-dot (data freshness), rotation (ambient
  globe), fly-to (state transition) — `DESIGN.md` §7, code comments.
- [x] **Marquee max-one-per-page** — Complete. Absent by construction (grep).
- [x] **Navigation on ONE line ≤80px** — Complete. 56px three-zone header
  grid (`--header-height`, `AppHeader.tsx`).
- [ ] **Section-Layout-Repetition** — N/A. Workspace stacking is the
  intentional system, not marketing sections.
- [ ] **Bento rhythm / cell count** — N/A. No bento.
- [x] **Long lists use the right component** — Complete. Bespoke `EventList`
  (button rows, severity/location lines, cap 50 + counts), the panel's
  keyboard alternative — not a default list.
- [x] **Real images used** — Complete. Real NASA Blue Marble textures and
  live data; zero fabricated screenshots or placeholder slots.
- [x] **No pills/labels overlaid on images** — Complete. Absent; severity
  pills never overlay imagery.
- [ ] **No photo-credit captions as decoration** — N/A. Credits as text
  (see above).
- [x] **No version footers** — Complete. Absent (dock shows UTC/renderer
  state, no version).
- [ ] **No micro-meta-sentences** — N/A. No marketing eyebrows.
- [x] **No decoration text strip** — Complete. Absent (stage locator is a
  functional WGS-84 tag).
- [x] **No floating top-right sub-text** — Complete. Absent.
- [x] **No scoring bars with filled tracks** — Complete. Distribution bars
  always pair with text counts (text-plus-colour rule,
  `SeverityDistribution.tsx`).
- [x] **No locale / time strips** — Complete via the rule's own exception:
  the product is genuinely place/time-focused (cursor coords, UTC clock are
  core function, `StatusDock.tsx`).
- [x] **No scroll cues** — Complete. Absent.
- [ ] **No version labels in hero** — N/A. No hero/launch.
- [x] **No section-numbering eyebrows** — Complete. Absent.
- [x] **No decorative dots** — Complete. Land dots encode landmass and
  markers encode events — real semantic state, expressly allowed.
- [x] **No `border-t` + `border-b` boxed rows** — Complete. Hairline
  dividers only; flat sections (`EventList.tsx`, `intel-section`).
- [x] **Content density sane** — Complete. Cap 50 + counts, real stats, no
  fake precision (T2.x honesty rules + tests).
- [ ] **Quotes ≤3 lines** — N/A. No quotes.
- [ ] **Motion claimed = motion shown** — N/A. No intensity claims exist.
- [ ] **GSAP sticky-stack** — N/A. No GSAP.
- [x] **No `window` scroll listener** — Complete. None in `src` (pointer,
  wheel-zoom, keydown, rAF only — grep).
- [x] **Reduced motion wrapped** — Complete. CSS kill-switch + shared engine
  policy incl. mid-session flips (`motion.test.ts`,
  `usePrefersReducedMotion.test.tsx`, dotted integration tests).
- [ ] **Dark mode in both modes** — Deferred by explicit decision. Dark-only
  per owner ruling (reconciliation §13.4); there is no second mode to test.
- [x] **Mobile collapse explicit** — Complete. Stacked workspace, `dvh`
  caps, `min-w-0` truncation (responsive suites).
- [x] **Viewport stability** — Complete. `h-dvh`/`100dvh` throughout, never
  `h-screen` (grep).
- [x] **`useEffect` animations cleaned up** — Complete. Listeners,
  intervals, aborts, rAF loops and GPU resources all dispose (teardown
  effects + disposal paths).
- [x] **Empty / loading / error states** — Complete. Five-state UI with
  dedicated suites (`SentinelApp.firstrun/view.test.tsx`,
  `DataPanel.test.tsx`).
- [x] **Cards omitted for spacing** — Complete. Flat sections, zero nested
  cards (`DataPanel.tsx`, `LayerOverview.tsx`).
- [x] **Icons from an allowed library** — Complete with recorded deviation:
  `lucide-react` is the project-standard library and no hand-rolled SVG
  paths exist in UI (chart SVGs are visx-rendered data, not decoration);
  lucide is not among the skill's four named libraries.
- [x] **Motion isolated, memoized** — Complete. `StableEarthRenderer` /
  `DottedEarth` memos, client boundaries, engine props via refs.
- [x] **No AI tells** — Complete. Instrument Sans primary (not Inter
  default), no purple, no placeholder names in UI copy.
- [ ] **Core Web Vitals plausibly hit** — Owner verification required. No
  Lighthouse or field data (static shell prerender noted, unmeasured).
- [x] **One design system per project** — Complete. Single Sentinel system
  plus shadcn primitives; no mixed libraries.

## Tally (honest, not fully ticked)

- Complete (incl. 1 recorded deviation): 32
- Not complete: 1 (em-dash microcopy — owner decision)
- Deferred by explicit decision: 1 (dark-only)
- Owner verification required: 4 in-matrix (button contrast, form contrast,
  copy audit, Web Vitals) plus the render/GPU/browser register in
  `audit.md` §5
- N/A with reason: 23 (landing-page constructs with no counterpart here)

The PRD's “fully ticked” wording cannot be satisfied honestly for this
product: the checklist assumes a marketing page (its own §13 excludes dense
product UI), and several items need instruments, eyes or GPUs no automation
here may claim. This file ticks what code and tests prove, defers what
owners decided, and leaves the rest explicitly pending.
