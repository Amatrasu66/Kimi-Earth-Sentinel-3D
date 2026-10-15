/**
 * Phase 4 `useAppUrlState` imagery coverage: mount restore of `?imagery=`,
 * canonicalization of unknown ids, validated selection sync (push), and
 * rejection of unknown ids. jsdom history only — no app shell.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppUrlState } from '@/components/app/useAppUrlState';

function setUrl(search: string) {
  window.history.replaceState(null, '', search === '' ? '/' : `/${search}`);
}

function currentSearch(): string {
  return window.location.search;
}

const hookOptions = {
  selectedEventId: null as string | null,
  clearEventSelection: () => {},
};

beforeEach(() => {
  setUrl('');
});

afterEach(() => {
  setUrl('');
  vi.restoreAllMocks();
});

describe('base-imagery URL state (Phase 4)', () => {
  it('restores a supported imagery selection on mount without pushing history', () => {
    setUrl('?imagery=gibs-modis-truecolor');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useAppUrlState(hookOptions));
    expect(result.current.baseImagery).toBe('gibs-modis-truecolor');
    // Mount canonicalization replaces (first-run default layer included).
    expect(pushSpy).not.toHaveBeenCalled();
    expect(currentSearch()).toBe('?layer=earthquakes&imagery=gibs-modis-truecolor');
  });

  it('drops unknown imagery ids and canonicalizes them away', () => {
    setUrl('?layer=earthquakes&imagery=sentinel-2');
    renderHook(() => useAppUrlState(hookOptions));
    // Unknown ids never reach state and vanish from the URL in place.
    expect(currentSearch()).toBe('?layer=earthquakes');
  });

  it('syncs validated selections to the URL as discrete (push) entries', () => {
    setUrl('');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useAppUrlState(hookOptions));
    expect(result.current.baseImagery).toBeNull();

    act(() => {
      result.current.setBaseImagery('gibs-modis-truecolor');
    });
    expect(result.current.baseImagery).toBe('gibs-modis-truecolor');
    expect(pushSpy).toHaveBeenCalled();
    expect(currentSearch()).toContain('imagery=gibs-modis-truecolor');
    // Existing URL-state fields survive the imagery change.
    expect(currentSearch()).toContain('layer=earthquakes');
  });

  it('resolves unknown selections to the default (no URL param)', () => {
    setUrl('');
    const { result } = renderHook(() => useAppUrlState(hookOptions));
    act(() => {
      result.current.setBaseImagery('gibs-modis-truecolor');
    });
    expect(currentSearch()).toContain('imagery=');

    act(() => {
      result.current.setBaseImagery('ndvi');
    });
    expect(result.current.baseImagery).toBeNull();
    expect(currentSearch()).not.toContain('imagery=');
  });
});
