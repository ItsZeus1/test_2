"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, LogOut, Plus, Search, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RoleBadge } from "@/components/ui/primitives";
import { WalletModal } from "@/components/wallet/WalletModal";
import { ServiceFormModal } from "@/components/admin/ServiceFormModal";
import { signOutAction } from "@/app/(auth)/actions";
import { formatMoney } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function Navbar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [walletOpen, setWalletOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const isAdmin = profile.role === "ADMIN";

  function onChange(value: string) {
    setQ(value);
    // On the store page filter live without a server round-trip.
    if (pathname === "/") {
      window.history.replaceState(null, "", value ? `/?q=${encodeURIComponent(value)}` : "/");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pathname !== "/") router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  const links = [
    { href: "/", label: "Store" },
    { href: "/category/games", label: "Categories" },
    { href: "/orders", label: "My Orders" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-mint text-ink">
              <Zap className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">
              Nova<span className="text-mint">Charge</span>
            </span>
          </Link>

          <nav className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 ${
                  pathname === l.href ? "text-text" : "text-muted"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => setWalletOpen(true)}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/10"
            >
              Add Balance
            </button>
          </nav>

          <form onSubmit={onSubmit} className="relative order-3 min-w-[160px] flex-1 md:order-none md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Search games & services…"
              aria-label="Search services"
              className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted/70 focus:border-violet"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <>
                <Button size="sm" variant="glow" onClick={() => setServiceOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Add New Service</span>
                </Button>
                <Link href="/admin">
                  <Button size="sm" variant="secondary">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Admin Dashboard</span>
                  </Button>
                </Link>
              </>
            )}

            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1">
              <Wallet className="h-4 w-4 text-mint" />
              <span className="font-tabular text-sm font-semibold">{formatMoney(profile.balance)}</span>
              <button
                onClick={() => setWalletOpen(true)}
                aria-label="Add balance"
                className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-violet text-white hover:bg-violet-soft"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <RoleBadge role={profile.role} />
            <span className="hidden text-sm text-muted xl:inline">{profile.name}</span>

            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Log out"
                className="rounded-lg p-2 text-muted transition-colors hover:bg-white/10 hover:text-text"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {walletOpen && <WalletModal onClose={() => setWalletOpen(false)} />}
      {serviceOpen && <ServiceFormModal initial={null} onClose={() => setServiceOpen(false)} />}
    </>
  );
}
