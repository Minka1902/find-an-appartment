import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/AppShell";
import { StoreHydrator } from "@/store/StoreHydrator";
import "./globals.css";

export const metadata: Metadata = {
  title: "Where To Live",
  description:
    "Rank areas for a whole household at once — every commute, family, transit, parking and price level in one score.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The map needs pinch-zoom; never disable user scaling.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreHydrator />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
