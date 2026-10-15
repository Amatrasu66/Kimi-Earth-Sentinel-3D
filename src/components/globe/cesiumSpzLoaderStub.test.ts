import { describe, expect, it } from 'vitest';
import { loadSpz } from './cesiumSpzLoaderStub';

/**
 * Phase 2 defect repair: the webpack alias in `next.config.mjs` points
 * `@spz-loader/core` at this stub so the production Cesium chunk parses in
 * a real browser. The stub must stay honest — it is linked but never
 * called by the GIBS + ellipsoid PoC, and any accidental call must fail
 * loudly instead of silently returning garbage splat data.
 */
describe('cesiumSpzLoaderStub', () => {
  it('rejects instead of decoding', async () => {
    await expect(loadSpz()).rejects.toThrow(/not supported in this build/);
  });

  it('mentions the stub file in the error for diagnosability', async () => {
    await expect(loadSpz()).rejects.toThrow(/cesiumSpzLoaderStub/);
  });
});
