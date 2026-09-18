import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NovaTopUp — Instant Game Top-Ups & Digital Codes",
  description:
    "Buy in-game currency, PINs, and digital codes for your favorite games. Instant delivery, 24/7.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: "USER" | "ADMIN" | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? "USER";
  }

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased min-h-screen flex flex-col`}>
        <Navbar user={user ? { email: user.email ?? "" } : null} role={role} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} NovaTopUp. All codes delivered instantly & securely.
        </footer>
      </body>
    </html>
  );
}
