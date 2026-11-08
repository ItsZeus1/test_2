import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import "@/styles.css";

export const metadata: Metadata = {
  title: "ZovaCharge — Instant game & app top-ups",
  description: "Instant top-ups for games, apps, subscriptions, and mobile data.",
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ZovaCharge", statusBarStyle: "default" },
  openGraph: { type: "website", title: "ZovaCharge — Instant game & app top-ups" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#F8FAFC", width: "device-width", initialScale: 1 };

/** Runs before first paint so there is no theme flash. New visitors start in Light mode. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("novacharge-theme")==="dark"?"dark":"light";var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
