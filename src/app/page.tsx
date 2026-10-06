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
// force-dynamic: prerendering an interactive globe page buys nothing (every
// pixel depends on client state, WebGPU probing, and live API data), and
// static prerender would evaluate client-only module graphs on the server.
export const dynamic = "force-dynamic";
export default function Home() {
  return <SentinelApp />;
}
