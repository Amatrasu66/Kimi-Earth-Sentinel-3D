# Kimi Earth Sentinel — frontend

React + TypeScript + Vite + Three.js client for Kimi Earth Sentinel. See the repository-root `README.md` for the full documentation (architecture, data sources, deployment, shortcuts).

```bash
npm install
npm run dev     # http://localhost:3000 (expects the API at VITE_API_BASE_URL)
npm run lint
npm run build   # outputs dist/
```

Environment: copy `.env.example` to `.env` and set `VITE_API_BASE_URL` (dev defaults to `http://localhost:5001/api/v1`; a production build without it fails loudly instead of calling localhost).

Earth: `components/globe/WebGPUEarth.tsx` (WebGPU + TSL, lazy-loaded) with the WebGL `Globe`/`GlobeScene` fallback behind `EarthRenderer.tsx`. Settings → Diagnostics shows API base, backend health/latency, provenance, and the active renderer.
