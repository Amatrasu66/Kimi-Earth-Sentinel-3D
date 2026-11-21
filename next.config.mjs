/**
 * T1.2 security headers + report-only CSP.
 *
 * Built from the app's ACTUAL resource requirements (verified in a real
 * browser via scripts/browser-smoke.mjs):
 * - scripts: Next.js App Router emits inline bootstrap/hydration scripts, so
 *   `script-src` needs 'unsafe-inline' until a nonce-based setup lands.
 *   App code never evals (dev-mode webpack eval reports are expected).
 * - styles: single Tailwind CSS file (third-party inline styles: see below).
 * - images + connections: same-origin `/api/v1` and `/textures/*`, plus the
 *   two hosts the Cesium globe loads tiles from directly in the browser:
 *   NASA GIBS (base imagery, WMTS) and Microsoft Planetary Computer (Sentinel
 *   scene tiles + previews). Cesium fetches tiles with XHR/fetch and shows
 *   previews as <img>, so the hosts are needed in both directives.
 * - fonts: system stack, no external @font-face/@import found.
 *
 * Report-Only on purpose: switching to enforcing is a separate, later task
 * after zero violations are observed across all layers and both renderers.
 * Production smoke run (2026-11-22) still reports: inline style attributes
 * from react-dom/Radix/Cesium (needs style-src 'unsafe-inline'), WebAssembly
 * compile from the Cesium chunk ('wasm-unsafe-eval'), and string eval from
 * Cesium's Knockout widgets ('unsafe-eval') — an owner decision before
 * enforcing.
 *
 * CSP-1: `upgrade-insecure-requests` is deliberately NOT in this
 * report-only policy — browsers ignore that directive outside an enforced
 * policy, so shipping it here only produces a permanent console warning
 * with zero protection. It is reserved for the future enforced policy.
 */
import { fileURLToPath } from "node:url";

const TILE_HOSTS = "https://gibs.earthdata.nasa.gov https://planetarycomputer.microsoft.com";

const cspDirectives = [
  "default-src 'self'",
  // Next.js App Router requires inline scripts (no nonce plumbing yet).
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  `img-src 'self' ${TILE_HOSTS}`,
  `connect-src 'self' ${TILE_HOSTS}`,
  "font-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: cspDirectives,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't let `next dev` write an AGENTS.md into the repo root.
  agentRules: false,
  async headers() {
    // One rule for every route: `/`, `/api/*`, and static/texture assets.
    // Headers only — response bodies (incl. the { success, data, meta }
    // envelope) are untouched.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack(config) {
    // Phase 2 defect repair (2026-10-15): `@cesium/engine` statically
    // imports `@spz-loader/core`, whose dist breaks the production
    // minified chunk with a parse-time SyntaxError in real browsers (see
    // `src/components/globe/cesiumSpzLoaderStub.ts`). Exact-match alias so
    // nothing else is redirected; the PoC loads zero SPZ models, so the
    // stub is linked but never called. Revisit if splat rendering lands.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@spz-loader/core$": fileURLToPath(
        new URL(
          "./src/components/globe/cesiumSpzLoaderStub.ts",
          import.meta.url,
        ),
      ),
    };
    return config;
  },
};

export default nextConfig;
