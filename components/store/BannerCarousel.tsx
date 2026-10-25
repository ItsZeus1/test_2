"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Flame, Sparkles } from "lucide-react";

const BANNERS = [
  {
    icon: Crown,
    tag: "VIP",
    title: "VIP members save on every top-up",
    text: "Upgrade your account and unlock lower VIP prices across all services.",
    href: "/category/games",
    cta: "Browse games",
    bg: "linear-gradient(120deg,#3b1d8f 0%,#1a1040 55%,#0d2a26 100%)",
  },
  {
    icon: Flame,
    tag: "FLASH SALE",
    title: "Weekend flash sale on UC & Diamonds",
    text: "PUBG Mobile, Free Fire and Valorant bundles — delivered in minutes.",
    href: "/category/games",
    cta: "Shop the sale",
    bg: "linear-gradient(120deg,#7a1d4f 0%,#2a1040 55%,#101a3a 100%)",
  },
  {
    icon: Sparkles,
    tag: "NEW",
    title: "New: TikTok Coins & Bigo Live",
    text: "Recharge your favourite live apps with instant delivery.",
    href: "/category/apps",
    cta: "See apps",
    bg: "linear-gradient(120deg,#0b4d3f 0%,#14203a 55%,#2a1a5e 100%)",
  },
];

export function BannerCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), 5000);
    return () => clearInterval(id);
  }, []);

  const b = BANNERS[index];
  const Icon = b.icon;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35 }}
          className="flex min-h-[170px] flex-col justify-center gap-2 p-6 md:min-h-[200px] md:p-10"
          style={{ background: b.bg }}
        >
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wider">
            <Icon className="h-3 w-3" /> {b.tag}
          </span>
          <h2 className="max-w-xl font-display text-2xl font-medium md:text-4xl">{b.title}</h2>
          <p className="max-w-lg text-sm text-white/70 md:text-base">{b.text}</p>
          <Link
            href={b.href}
            className="mt-2 w-fit rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mint"
          >
            {b.cta}
          </Link>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-3 right-4 flex gap-1.5">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Show banner ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
