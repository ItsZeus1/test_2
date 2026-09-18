import Link from "next/link";
import { Zap, ShieldCheck, Clock } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-zinc-900">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-72 w-72 rounded-full bg-emerald-500/20 blur-[100px]" />
        <div className="absolute right-1/4 top-20 h-72 w-72 rounded-full bg-purple-500/20 blur-[100px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            Instant delivery, 24/7
          </span>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Top up your games in{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-purple-400 bg-clip-text text-transparent">
              seconds
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Diamonds, UC, gems, and gift cards — delivered straight to your
            dashboard the moment your payment clears. No waiting, no hassle.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-zinc-500">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Secure checkout
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              Delivered in seconds
            </span>
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              Trusted by thousands
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
