/**
 * T1.2 security headers + report-only CSP.
 *
 * Built from the app's ACTUAL resource requirements (verified in source):
 * - scripts: Next.js App Router emits inline bootstrap/hydration scripts, so
 *   `script-src` needs 'unsafe-inline' until a nonce-based setup lands.
 *   No `unsafe-eval` anywhere (three/R3F production builds don't eval).
 * - styles: single Tailwind CSS file, no runtime <style> injection found.
 * - images: self-hosted `/textures/*` only (three TextureLoader, same-origin).
 * - connections: client calls same-origin `/api/v1` only (services/api.ts).
 *   Upstream hosts (USGS/EONET/GIBS/Open-Meteo/AirNow/FIRMS) are fetched
 *   SERVER-side, so browsers never need them in connect-src/img-src.
 * - fonts: system stack, no external @font-face/@import found.
 * - workers / blob: / data: URLs: none found in src — NOT allow-listed.
 *   If report-only console output later proves a need, extend deliberately.
 * - GIBS tile hosts: the UI never loads them today (gibsTileUrl is only a
 *   builder + test). T2.8 extends img-src when real imagery ships.
 *
 * Report-Only on purpose: switching to enforcing is a separate, later task
 * after zero violations are observed across all layers and both renderers.
 */
const cspDirectives = [
  "default-src 'self'",
  // Next.js App Router requires inline scripts (no nonce plumbing yet).
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
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
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // One rule for every route: `/`, `/api/*`, and static/texture assets.
    // Headers only — response bodies (incl. the { success, data, meta }
    // envelope) are untouched.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
