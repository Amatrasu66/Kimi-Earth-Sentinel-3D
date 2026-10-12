/**
 * T3.17 `useFocusRestore` ownership tests: request/apply lifecycle,
 * panel→list-stage fallback, settings/workspace targets, and the
 * surface-containment checks. Plain DOM nodes — no app shell.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFocusRestore } from '@/components/app/useFocusRestore';

function mountSurface(withPanel: boolean) {
  document.body.innerHTML =
    '<main id="sentinel-workspace" tabindex="-1">workspace</main>' +
    (withPanel ? '<section id="sentinel-data-panel" tabindex="-1">panel</section>' : '') +
    '<section id="sentinel-list-stage" tabindex="-1">list</section>' +
    '<button id="sentinel-settings-button">settings</button>';
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('request/apply lifecycle', () => {
  it('moves focus to the workspace on request', () => {
    mountSurface(true);
    const { result } = renderHook(() => useFocusRestore());
    act(() => {
      result.current.requestFocus('workspace');
    });
    expect(document.activeElement).toBe(document.getElementById('sentinel-workspace'));
  });

  it('prefers the panel for panel requests, falling back to the list stage', () => {
    mountSurface(true);
    const first = renderHook(() => useFocusRestore());
    act(() => {
      first.result.current.requestFocus('panel');
    });
    expect(document.activeElement).toBe(document.getElementById('sentinel-data-panel'));
    first.unmount();

    mountSurface(false);
    const second = renderHook(() => useFocusRestore());
    act(() => {
      second.result.current.requestFocus('panel');
    });
    expect(document.activeElement).toBe(document.getElementById('sentinel-list-stage'));
  });

  it('returns focus to the settings opener', () => {
    mountSurface(true);
    const { result } = renderHook(() => useFocusRestore());
    act(() => {
      result.current.requestFocus('settings');
    });
    expect(document.activeElement).toBe(document.getElementById('sentinel-settings-button'));
  });

  it('drops a request when its target no longer exists', () => {
    document.body.innerHTML = '<main id="sentinel-workspace" tabindex="-1">workspace</main>';
    const { result } = renderHook(() => useFocusRestore());
    const before = document.activeElement;
    act(() => {
      result.current.requestFocus('settings');
    });
    expect(document.activeElement).toBe(before);
  });
});

describe('surface-containment checks', () => {
  it('detects focus inside the panel or list stage', () => {
    mountSurface(true);
    document.getElementById('sentinel-data-panel')!.innerHTML = '<button id="in-panel">x</button>';
    document.getElementById('sentinel-list-stage')!.innerHTML = '<button id="in-list">x</button>';
    document.body.insertAdjacentHTML('beforeend', '<button id="outside">x</button>');
    const { result } = renderHook(() => useFocusRestore());

    (document.getElementById('in-panel') as HTMLElement).focus();
    expect(result.current.focusInDataSurface()).toBe(true);
    (document.getElementById('in-list') as HTMLElement).focus();
    expect(result.current.focusInDataSurface()).toBe(true);
    (document.getElementById('outside') as HTMLElement).focus();
    expect(result.current.focusInDataSurface()).toBe(false);
  });

  it('treats body focus as restorable while a surface exists', () => {
    mountSurface(false);
    const { result } = renderHook(() => useFocusRestore());
    document.body.focus();
    expect(document.activeElement).toBe(document.body);
    expect(result.current.focusInDataSurface()).toBe(true);

    document.body.innerHTML = '<button id="outside">x</button>';
    (document.getElementById('outside') as HTMLElement).focus();
    expect(result.current.focusInDataSurface()).toBe(false);
  });

  it('checks arbitrary selector containment for dialogs and hints', () => {
    document.body.innerHTML =
      '<div role="dialog"><button id="in-dialog">x</button></div><button id="outside">x</button>';
    const { result } = renderHook(() => useFocusRestore());
    (document.getElementById('in-dialog') as HTMLElement).focus();
    expect(result.current.focusWithin('[role="dialog"]')).toBe(true);
    (document.getElementById('outside') as HTMLElement).focus();
    expect(result.current.focusWithin('[role="dialog"]')).toBe(false);
  });
});
