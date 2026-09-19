"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { Zap, Clock, Headset, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const value = useMotionValue(0);
  const rounded = useTransform(value, (v) => Math.round(v).toString());

  useEffect(() => {
    const controls = animate(value, to, { duration: 1.4, ease: "easeOut", delay: 0.4 });
    return controls.stop;
  }, [to, value]);

  return (
    <span className="font-tabular">
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

export function StepWelcome({ onNext }: { onNext: () => void }) {
  const stats = [
    { icon: Zap, value: 40, suffix: "+", label: "Games Supported" },
    { icon: Clock, value: 5, suffix: " Min", label: "Delivery, Under" },
    { icon: Headset, value: 24, suffix: "/7", label: "Support" },
  ];

  return (
    <section className="flex min-h-screen flex-col justify-center px-6 py-24 md:px-16 lg:px-24">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-ember text-sm font-medium tracking-wide mb-4"
      >
        NovaCharge
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="font-display text-5xl md:text-7xl font-medium leading-[1.05] max-w-3xl text-balance"
      >
        Instant top-ups for every game.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="text-muted text-lg mt-6 max-w-xl"
      >
        Diamonds, VP, UC, gift cards, or a straight mobile top-up — paid and
        delivered before your squad finishes loading in.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-10 grid grid-cols-3 gap-6 max-w-xl border-t border-line pt-6"
      >
        {stats.map(({ icon: Icon, value, suffix, label }) => (
          <div key={label}>
            <Icon className="w-4 h-4 text-ember mb-2" strokeWidth={2} />
            <div className="font-display text-2xl md:text-3xl font-medium">
              <Counter to={value} suffix={suffix} />
            </div>
            <div className="text-muted text-xs mt-1">{label}</div>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
        className="mt-12"
      >
        <Button size="lg" onClick={onNext}>
          Get started
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </section>
  );
}
