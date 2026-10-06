import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earth Sentinel 3D",
  description:
    "Earth Sentinel 3D — interactive environmental-intelligence command center for live earthquakes, wildfires, air quality, and climate layers on a 3D globe.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050607",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
