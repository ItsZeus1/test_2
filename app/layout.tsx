import type { Metadata } from "next";
import { Suspense } from "react";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { SupportButton } from "@/components/layout/SupportButton";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "700"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NovaCharge — Instant Game & Digital Top-Ups",
  description: "The #1 instant game & digital top-up hub. 40+ services, delivery in minutes, 24/7 support.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let profile: Profile | null = null;
  try {
    const session = await getCurrentUser();
    profile = session?.profile ?? null;
  } catch (error) {
    console.warn("[layout] could not load session:", error);
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-ink font-body text-text">
        {profile && (
          <Suspense fallback={null}>
            <Navbar profile={profile} />
          </Suspense>
        )}
        {children}
        <SupportButton />
      </body>
    </html>
  );
}
