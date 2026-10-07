import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// testing-library's auto-cleanup relies on a global afterEach, which
// vitest only provides with globals:true — register it explicitly so
// renders and window listeners never leak between tests.
afterEach(() => {
  cleanup();
});

// jsdom has no layout engine: stub scrollIntoView (used to keep highlighted
// combobox options visible) so component effects don't throw under test.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// jsdom has no ResizeObserver (Bklit charts size themselves with it via
// @visx/responsive). Report a fixed content box on observe so charts render
// deterministically under test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 300, height: 100, top: 0, left: 0, bottom: 100, right: 300, x: 0, y: 0, toJSON: () => ({}) },
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
