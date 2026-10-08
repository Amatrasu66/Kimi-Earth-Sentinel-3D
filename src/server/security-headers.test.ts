/**
 * T1.2 automated coverage: security headers ship on every route, CSP stays
 * report-only, and the policy contains exactly the directives the app needs
 * (no wildcards, no unsafe-eval, no enforcing switch without owner sign-off).
 */
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";

type Header = { key: string; value: string };

async function allHeaders(): Promise<Header[]> {
  const rules = (await nextConfig.headers?.()) ?? [];
  expect(rules.length).toBeGreaterThan(0);
  // `/:path*` covers `/`, `/api/*`, and static/texture assets alike.
  expect(rules.some((r) => r.source === "/:path*")).toBe(true);
  return rules.flatMap((r) => r.headers as Header[]);
}

function headerValue(headers: Header[], name: string): string {
  const found = headers.find((h) => h.key.toLowerCase() === name.toLowerCase());
  expect(found, `expected header ${name}`).toBeDefined();
  return found!.value;
}

describe("security headers (T1.2)", () => {
  it("sends the hardening headers on every route", async () => {
    const headers = await allHeaders();
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    const pp = headerValue(headers, "Permissions-Policy");
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
      expect(pp).toContain(feature);
    }
  });

  it("CSP is report-only (never enforcing) with frame-ancestors none", async () => {
    const headers = await allHeaders();
    const names = headers.map((h) => h.key.toLowerCase());
    expect(names).toContain("content-security-policy-report-only");
    expect(names).not.toContain("content-security-policy");
    const csp = headerValue(headers, "Content-Security-Policy-Report-Only");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("CSP allows exactly what the app needs — no wildcards, no unsafe-eval", async () => {
    const headers = await allHeaders();
    const csp = headerValue(headers, "Content-Security-Policy-Report-Only");
    // No wildcard origins.
    expect(csp).not.toMatch(/(^|[;\s])\*(;|$)/);
    expect(csp).not.toContain("unsafe-eval");
    // Same-origin client: API + textures + fonts + workers resolve to self.
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "worker-src 'self'",
      "style-src 'self'",
      "base-uri 'self'",
    ]) {
      expect(csp).toContain(directive);
    }
    // Next.js App Router inline bootstrap scripts: documented exception.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });
});
