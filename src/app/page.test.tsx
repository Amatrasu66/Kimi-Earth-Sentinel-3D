/**
 * T3.2 server-shell boundary tests: the `/` page prerenders statically with
 * meaningful shell HTML, and the client tree server-renders deterministically.
 * HTTP-level verification (status/landmarks/static route) happens against
 * `next start` during task verification — these unit tests pin the
 * source-level contracts that make that true. No browser automation.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import SentinelApp from '@/components/app/SentinelApp';
import * as page from './page';

function shellHtml(): string {
  return renderToString(<SentinelApp />);
}

describe('page render mode (T3.2)', () => {
  it('exports no dynamic setting — the shell prerenders statically', () => {
    // Any `dynamic = "force-dynamic"` (or other request-time setting) added
    // back here fails this test: the page reads no cookies/headers/
    // searchParams, so per-request rendering buys nothing.
    expect((page as Record<string, unknown>).dynamic).toBeUndefined();
  });
});

describe('initial shell HTML (T3.2)', () => {
  it('server-renders the application shell: identity, header, rail, stage, status', () => {
    const html = shellHtml();
    // Application identity + accessible shell landmarks.
    expect(html).toContain('Earth Sentinel 3D');
    expect(html).toContain('Skip to data panel');
    expect(html).toContain('role="status"');
    // Layer rail: all 8 layers present as toggle buttons (no fabricated state).
    for (const label of ['Temperature', 'Precipitation', 'Cloud Cover', 'Wind', 'Earthquakes', 'Disasters', 'Air Quality', 'Wildfires']) {
      expect(html).toContain(label);
    }
    // Command search + settings entry points.
    expect(html).toContain('Search');
    expect(html).toContain('Open settings');
    // Stable globe-stage region + renderer loading fallback (client boot next).
    expect(html).toContain('SENTINEL STAGE');
    expect(html).toContain('Initializing Earth renderer');
    // Substantial shell markup, not an empty mount node.
    expect(html.length).toBeGreaterThan(10_000);
  });

  it('renders deterministically with no live clock or wall-time leakage', () => {
    const first = shellHtml();
    const second = shellHtml();
    expect(first).toBe(second);
    // Status-dock clock placeholder (live UTC starts after hydration).
    expect(first).toContain('— —');
    expect(first).not.toMatch(/202\d-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
  });

  it('emits no inline style attributes in the static shell (CSP-1)', () => {
    // Every `style="..."` in SSR markup is a `style-src 'self'` report, so
    // the static shell keeps all of its styling in classes. Dynamic values
    // (provenance colors, hover-card position) only ever render client-side
    // through React/CSSOM, which the policy does not flag.
    expect(shellHtml()).not.toContain('style="');
  });
});
