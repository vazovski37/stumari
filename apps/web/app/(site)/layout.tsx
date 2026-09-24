import type { Metadata } from "next";
import { fontVariables } from "@/app/fonts";
import { siteUrl } from "@/lib/site";
import "../globals.css";

/** Root layout for English-only pages (privacy now; checkout, booking, dashboard and admin later). */
export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "Stumari",
  title: { default: "Stumari", template: "%s — Stumari" },
};

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
