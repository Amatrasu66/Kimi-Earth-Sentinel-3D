import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Earth Sentinel 3D API",
  description: "Environmental-intelligence API (Next.js, migrated from Flask)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
