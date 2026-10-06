import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WebGpuErrorBoundary from './WebGpuErrorBoundary';

function Boom(): never {
  throw new Error('chunk failed');
}

describe('WebGpuErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <WebGpuErrorBoundary onError={vi.fn()}>
        <span>earth here</span>
      </WebGpuErrorBoundary>,
    );
    expect(screen.getByText('earth here')).toBeInTheDocument();
  });

  it('reports the failure and renders nothing (parent swaps in WebGL)', () => {
    const onError = vi.fn();
    // Silence React's error logging for the intentional throw.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <WebGpuErrorBoundary onError={onError}>
          <Boom />
        </WebGpuErrorBoundary>,
      );
    } finally {
      consoleSpy.mockRestore();
    }
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(screen.queryByText('chunk failed')).not.toBeInTheDocument();
  });
});
