export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Earth Sentinel 3D API</h1>
      <p>Status: running. Frontend is served separately; this deployment exposes:</p>
      <ul>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          <a href="/api/v1/health">GET /api/v1/health</a>
        </li>
        <li>
          <a href="/api/v1/layers">GET /api/v1/layers</a>
        </li>
      </ul>
      <p>
        Version 1.0.0 — Next.js App Router backend (migrated from Flask). Same-origin API base:{" "}
        <code>/api/v1</code>.
      </p>
    </main>
  );
}
