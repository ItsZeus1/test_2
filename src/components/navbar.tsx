import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Plus, Shield, Wallet, X, Zap } from "lucide-react";

import { RoleBadge } from "@/components/role-badge";
import { useProfileState } from "@/components/profile";
import { logoutAccount } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import { CATEGORIES } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

const LINKS = [
  { label: "All Services", to: "/" as const },
  ...CATEGORIES.map((category) => ({
    label: category.label,
    to: "/category/$slug" as const,
    slug: category.slug,
  })),
];

function SignOutButton({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const { profile } = useProfileState();
  if (!profile) return null;
  return (
    <button
      type="button"
      className="min-h-11 rounded-full border border-white/10 px-3 text-sm font-semibold text-muted hover:text-white"
      onClick={() => {
        void logoutAccount().then(() => {
          onDone?.();
          void navigate({ to: "/login", search: { tab: undefined } });
        });
      }}
    >
      Sign out
    </button>
  );
}

export function Navbar() {
  const { profile, ready, authPending } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [open, setOpen] = useState(false);
  const isAdmin = profile?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" search={{ browse: true }} className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet via-fuchsia to-indigo shadow-[0_0_22px_-6px_rgba(139,92,246,0.9)]">
            <Zap className="size-4 text-white" />
          </span>
          <span className="text-gradient">NovaCharge</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((link) =>
            link.to === "/" ? (
              <Link
                key={link.label}
                to="/"
                search={{ browse: true }}
                className="rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
                activeOptions={{ exact: true, includeSearch: false }}
                activeProps={{ className: "rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.label}
                to="/category/$slug"
                params={{ slug: link.slug }}
                className="rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
                activeProps={{ className: "rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
              >
                {link.label}
              </Link>
            ),
          )}
          <Link
            to="/orders"
            className="rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            activeProps={{ className: "rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
          >
            My Orders
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAdmin ? (
            <div className="hidden items-center gap-2 md:flex">
              <button
                type="button"
                onClick={openCreateService}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet/40 bg-violet/15 px-3 text-sm font-semibold hover:border-violet"
              >
                <Plus className="size-4" />
                Add New Service
              </button>
              <Link
                to="/admin"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-fuchsia/40 px-3 text-sm font-semibold text-fuchsia-100"
              >
                <Shield className="size-4" />
                Admin Panel
              </Link>
            </div>
          ) : null}

          {authPending || (profile === null && !ready) ? (
            <div className="h-11 w-28 animate-pulse rounded-full bg-white/10" />
          ) : profile ? (
            <div className="hidden items-center gap-2 sm:flex">
              <RoleBadge role={profile.role} />
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-1 pl-3">
                <Wallet className="size-4 text-violet" />
                <span className="text-sm font-semibold tabular-nums">{formatUsd(profile.balanceCents)}</span>
                <button type="button" onClick={openSelfTopUp} className="min-h-9 rounded-full bg-white/10 px-3 text-xs font-bold">
                  + Top Up
                </button>
              </div>
              <SignOutButton />
            </div>
          ) : (
            <Link
              to="/login"
              search={{ tab: undefined }}
              className="btn-glow hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold sm:inline-flex"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-white/10 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-2 border-t border-white/10 px-4 py-4 lg:hidden">
          {profile ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <RoleBadge role={profile.role} />
              <span className="font-semibold tabular-nums">{formatUsd(profile.balanceCents)}</span>
              <button type="button" onClick={openSelfTopUp} className="min-h-11 rounded-full border border-white/15 px-3 text-sm font-semibold">
                + Top Up
              </button>
            </div>
          ) : null}
          <Link to="/" search={{ browse: true }} className="block rounded-2xl px-3 py-3 text-sm" onClick={() => setOpen(false)}>
            All Services
          </Link>
          {CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              to="/category/$slug"
              params={{ slug: category.slug }}
              className="block rounded-2xl px-3 py-3 text-sm"
              onClick={() => setOpen(false)}
            >
              {category.label}
            </Link>
          ))}
          <Link to="/orders" className="block rounded-2xl px-3 py-3 text-sm" onClick={() => setOpen(false)}>
            My Orders
          </Link>
          {isAdmin ? (
            <>
              <button
                type="button"
                className="block w-full rounded-2xl px-3 py-3 text-left text-sm"
                onClick={() => {
                  setOpen(false);
                  openCreateService();
                }}
              >
                + Add New Service
              </button>
              <Link to="/admin" className="block rounded-2xl px-3 py-3 text-sm" onClick={() => setOpen(false)}>
                Admin Panel
              </Link>
            </>
          ) : null}
          {!profile && ready ? (
            <Link
              to="/login"
              search={{ tab: undefined }}
              className="btn-glow mt-2 flex min-h-11 items-center justify-center rounded-full text-sm font-semibold"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          ) : (
            <div className="pt-2">
              <SignOutButton onDone={() => setOpen(false)} />
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
