/**
 * Browser stub for `@spz-loader/core` (Phase 2 defect repair, 2026-10-15).
 *
 * Root cause: `cesium@1.146.0` → `@cesium/engine` statically imports
 * `{ loadSpz }` from `@spz-loader/core` (see
 * `@cesium/engine/Source/Scene/GltfSpzLoader.js`, re-exported from the
 * engine barrel, so it enters every `import('cesium')` bundle). The real
 * `dist/index.js` ships Node-isms (a top-level `createRequire("file://…")`
 * with an absolute install path) plus a binary blob that the production
 * minifier re-encodes with octal escapes inside a template literal. The
 * emitted lazy chunk therefore throws
 * `SyntaxError: Octal escape sequences are not allowed in template strings`
 * at parse time in a real browser, `import('cesium')` rejects, and the
 * `?renderer=cesium` branch can never boot (verified in Edge against a
 * production build; unit mocks never execute the chunk, so CI stayed green).
 *
 * This stub replaces that module via an exact webpack alias in
 * `next.config.mjs`. It is safe because `loadSpz` is only invoked inside
 * `GltfSpzLoader.processData`, i.e. when decoding `.spz` Gaussian-splat
 * model content — this proof of concept loads zero models (token-free GIBS
 * imagery + ellipsoid terrain only), so the stub is linked but never
 * called. If splat rendering is ever needed (Phase 6+), remove the alias
 * and bundle a browser-safe SPZ decoder instead of silently keeping this.
 */
export function loadSpz(): Promise<never> {
  return Promise.reject(
    new Error(
      'SPZ Gaussian-splat decoding is not supported in this build ' +
        '(@spz-loader/core is stubbed; see cesiumSpzLoaderStub.ts).',
    ),
  );
}
