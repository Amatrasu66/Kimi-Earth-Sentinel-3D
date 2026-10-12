import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

function Probe() {
  const reduced = usePrefersReducedMotion();
  return <span data-testid="probe">{String(reduced)}</span>;
}

function probeText(): string {
  return screen.getByTestId('probe').textContent ?? '';
}

/** Controllable matchMedia double with a live change trigger. */
function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: () => void) => {
      listeners.delete(cb);
    }),
  };
  const prev = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => {
      mql.matches = matches;
      return mql;
    }),
  });
  return {
    mql,
    setMatches(next: boolean) {
      matches = next;
      act(() => {
        listeners.forEach((cb) => cb());
      });
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: prev,
      });
    },
  };
}

describe('usePrefersReducedMotion (T3.11)', () => {
  afterEach(() => {
    cleanup();
  });

  it('server-renders false without touching window.matchMedia', () => {
    const prev = window.matchMedia;
    const spy = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: spy,
    });
    try {
      // getServerSnapshot must answer without reading the media query —
      // SSR markup stays deterministic and hydration cannot mismatch on it.
      const html = renderToString(<Probe />);
      expect(html).toContain('false');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: prev,
      });
    }
  });

  it('reads false when no preference is set', () => {
    const mm = mockMatchMedia(false);
    try {
      render(<Probe />);
      expect(probeText()).toBe('false');
    } finally {
      mm.restore();
    }
  });

  it('reads true when the OS requests reduced motion', () => {
    const mm = mockMatchMedia(true);
    try {
      render(<Probe />);
      expect(probeText()).toBe('true');
    } finally {
      mm.restore();
    }
  });

  it('updates when the preference changes while mounted (no remount)', () => {
    const mm = mockMatchMedia(false);
    try {
      render(<Probe />);
      expect(probeText()).toBe('false');
      mm.setMatches(true);
      expect(probeText()).toBe('true');
      mm.setMatches(false);
      expect(probeText()).toBe('false');
    } finally {
      mm.restore();
    }
  });

  it('removes its listener on unmount', () => {
    const mm = mockMatchMedia(false);
    try {
      const { unmount } = render(<Probe />);
      expect(mm.mql.addEventListener).toHaveBeenCalledTimes(1);
      unmount();
      expect(mm.mql.removeEventListener).toHaveBeenCalledTimes(1);
    } finally {
      mm.restore();
    }
  });
});
