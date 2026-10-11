import type { Metadata } from "next";
import SentinelApp from "@/components/app/SentinelApp";

export const metadata: Metadata = {
  title: "Earth Sentinel 3D",
  description:
    "Earth Sentinel 3D — interactive environmental-intelligence command center for live earthquakes, wildfires, air quality, and climate layers on a 3D globe.",
};

// The whole Sentinel UI is a client component tree (globe renderers, hooks,
// panels all need browser APIs). This page is intentionally a thin server
// wrapper so metadata stays server-rendered while the app hydrates on the
// client. API calls are same-origin (/api/v1) — no CORS, no env config.
//
// T3.2: deliberately NO `dynamic = "force-dynamic"` here. The page reads no
// request-time state (no cookies/headers/searchParams/personalization —
// `?renderer=` is read from window.location inside client effects only), so
// it prerenders statically: identical shell HTML with no per-request render.
// Client components still SSR their initial markup (header, rail, stage,
// status skeleton, renderer veil); browser-only work (WebGPU probe, clocks,
// data fetches) starts after hydration. API routes keep their own dynamic
// behavior independently.
export default function Home() {
  return <SentinelApp />;
}
