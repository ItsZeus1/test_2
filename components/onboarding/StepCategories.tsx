"use client";

import { motion } from "framer-motion";
import { Gamepad2, LayoutGrid, RefreshCw, Smartphone, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const CATEGORIES = [
  { icon: Gamepad2, name: "Games", desc: "Diamonds, UC, VP, and more" },
  { icon: LayoutGrid, name: "Apps", desc: "In-app credit and store balance" },
  { icon: RefreshCw, name: "Subscriptions", desc: "Streaming, music, cloud" },
  { icon: Smartphone, name: "Mobile Charge", desc: "Prepaid top-ups, any carrier" },
];

export function StepCategories({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <section className="flex min-h-screen flex-col justify-center px-6 py-24 md:px-16 lg:px-24">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-ember text-sm font-medium tracking-wide mb-3"
      >
        What you'll find
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="font-display text-4xl md:text-5xl font-medium max-w-2xl"
      >
        Four ways to top up, one checkout.
      </motion.h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mt-12">
        {CATEGORIES.map(({ icon: Icon, name, desc }, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
            whileHover={{ borderColor: "#FF6B4A" }}
            className="border border-line rounded-sharp p-6 bg-panel cursor-default transition-colors"
          >
            <Icon className="w-5 h-5 text-ember mb-4" strokeWidth={2} />
            <div className="font-display text-lg font-medium">{name}</div>
            <div className="text-muted text-sm mt-1">{desc}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 mt-12">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button size="lg" onClick={onNext}>
          Continue
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </section>
  );
}
