import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// T3.12 consolidation guards for the single global stylesheet. These pin
// the stylesheet-level contracts that component tests cannot see: the
// preserved motion/token systems, and the dead selectors that must not be
// resurrected. They say nothing about pixels — the owner verifies visuals.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf8');

describe('global stylesheet contracts (T3.12)', () => {
  it('keeps the reduced-motion kill-switch for entrances and pulses', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-iteration-count: 1 !important');
    expect(css).toContain('transition-duration: 0.01ms !important');
    expect(css).toContain('@keyframes sentinel-live-pulse');
  });

  it('keeps the shell geometry tokens and responsive viewport sizing', () => {
    for (const token of [
      '--header-height',
      '--rail-width',
      '--panel-width',
      '--status-height',
      '--hairline',
      '--radius-shell',
      '--radius-panel',
      '--motion-fast',
      '--sentinel-accent-rgb',
      '--sentinel-accent-ring',
    ]) {
      expect(css).toContain(token);
    }
    // T3.9 dynamic viewport units must survive cleanup (the 52dvh panel
    // cap lives in DataPanel's own classes, asserted by its test suite).
    expect(css).toContain('100dvh');
    expect(css).toContain('50dvh');
  });

  it('keeps every live custom surface/type/stage class', () => {
    for (const selector of [
      '.sentinel-shell',
      '.sentinel-workspace',
      '.sentinel-chrome',
      '.sentinel-panel',
      '.sentinel-elev',
      '.sentinel-inset',
      '.intel-shell',
      '.intel-section',
      '.layer-rail',
      '.dotted-earth',
      '.globe-stage-frame',
      '.panel-enter',
      '.row-enter',
      '.sentinel-live-dot',
      '.sentinel-app-title',
      '.sentinel-section-title',
      '.sentinel-label',
      '.sentinel-micro',
      '.sentinel-mono',
    ]) {
      expect(css).toContain(selector);
    }
  });

  it('does not resurrect selectors removed as dead', () => {
    // Rule form (with brace): explanatory comments may still name the
    // removed selectors, but no rule may define them.
    for (const dead of [
      '.sentinel-floating {',
      '.sentinel-spot',
      '.sentinel-active-ring {',
      '.sentinel-panel-title {',
      '.sentinel-body {',
      '.sentinel-meta {',
      '.intel-flat {',
      '.loading-screen {',
      '.loading-ring {',
      '.modal-enter {',
      '.marker-pulse {',
      '.panel-exit {',
      '@keyframes sentinel-spin',
      '@keyframes sentinel-shimmer',
      '@keyframes sentinel-fade-in',
      '#root {',
    ]) {
      expect(css).not.toContain(dead);
    }
    // The Vite-era `.shimmer` class is gone; chart loading shimmer lives in
    // SVG/motion code, not in this stylesheet.
    expect(css).not.toMatch(/\.shimmer\s*\{/);
  });

  it('keeps one amber source and the live provenance token set', () => {
    // Single amber source: the rgb triplet (the hex twin was removed).
    expect(css).toContain('--sentinel-accent-rgb');
    expect(css).not.toContain('--sentinel-accent:');
    for (const token of [
      '--status-live-rgb',
      '--status-cached-rgb',
      '--status-simulated-rgb',
      '--status-stale-rgb',
      '--status-unavailable-rgb',
      '--status-neutral-rgb',
    ]) {
      expect(css).toContain(token);
    }
  });
});
