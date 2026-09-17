// app/layout.tsx
import type { Metadata } from "next";
import { Inter, Chakra_Petch } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "TopUp — Game Top-Ups & Digital Currency",
  description: "Instant, secure top-ups for Valorant, Mobile Legends, Genshin Impact, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${chakraPetch.variable}`}>
      <body>{children}</body>
    </html>
  );
}
