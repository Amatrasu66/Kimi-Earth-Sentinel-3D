import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface WebGpuErrorBoundaryProps {
  children: ReactNode;
  /** Called once when the WebGPU subtree crashes (e.g. lazy-chunk load
   * failure). The parent switches to the WebGL fallback. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

/**
 * Catches render-time failures of the lazy WebGPU Earth subtree and routes
 * them to the WebGL fallback instead of unmounting the whole viewport.
 *
 * Without this, a failed `import('./WebGPUEarth')` chunk load (network
 * hiccup, stale deploy) or a render throw inside the WebGPU tree leaves a
 * permanently blank Earth: `EarthRenderer` only fell back on explicit
 * `onStatus({ phase: 'error' })`, which a chunk failure never emits.
 */
export default class WebGpuErrorBoundary extends Component<WebGpuErrorBoundaryProps> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    // Render nothing on failure — the parent swaps in <GlobeScene/>.
    if (this.state.failed) return null;
    return this.props.children;
  }
}
