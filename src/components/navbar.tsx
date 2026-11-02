"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@/lib/nav";
import { Menu, MessageCircle, Plus, Shield, Wallet, X, Zap } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

import { ThemeIconButton, ThemeSegmented } from "@/components/theme-toggle";
import { ProfileSummary, useProfileState } from "@/components/profile";
import { CurrencyPreviewSwitch } from "@/components/currency-switch";
import { categoryName, useI18n, useMoney } from "@/lib/i18n";
import { logoutAccount } from "@/lib/store/api";
import { CATEGORIES } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

function SignOutButton({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const { t } = useI18n();
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
      {t.signOut}
    </button>
  );
}

/** High-visibility wallet balance + glowing quick top-up, shown on every screen size. */
function WalletPill() {
  const { t } = useI18n();
  const money = useMoney();
  const { profile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  if (!profile) return null;
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-full border border-violet/40 bg-violet/10 py-1 ps-2.5 pe-1 shadow-[0_0_22px_-10px_rgba(99,102,241,0.9)]">
      <Wallet className="hidden size-4 shrink-0 text-violet sm:block" aria-hidden />
      <span className="min-w-0 max-w-[6.5rem] truncate text-xs font-extrabold tabular-nums sm:max-w-none sm:text-sm" dir="ltr">
        {money(profile.balanceCents, profile.currency)}
      </span>
      <button
        type="button"
        onClick={openSelfTopUp}
        aria-label={t.topUpShort}
        className="btn-glow keep-white inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-white"
      >
        <Plus className="size-3.5" />
        <span className="hidden sm:inline">{t.topUpShort}</span>
      </button>
    </div>
  );
}

function ProfileAvatar() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { profile } = useProfileState();
  const openProfile = useNovaUi((state) => state.openProfile);
  if (!profile) return null;
  const admin = profile.role === "ADMIN";
  return (
    <button
      type="button"
      aria-label={admin ? t.admin : t.profile}
      title={admin ? t.admin : t.profile}
      className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-sm font-bold"
      onClick={() => {
        if (admin) void navigate({ to: "/admin" });
        else openProfile();
      }}
    >
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        profile.name.slice(0, 1).toUpperCase()
      )}
    </button>
  );
}

export function Navbar() {
  const { t } = useI18n();
  const setSupportOpen = useNovaUi((state) => state.setSupportOpen);
  const supportOpen = useNovaUi((state) => state.supportOpen);
  const { profile, ready, authPending } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [open, setOpen] = useState(false);
  const isAdmin = profile?.role === "ADMIN";

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link to="/" search={{ browse: true }} className="flex min-w-0 shrink items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet via-fuchsia to-indigo shadow-[0_0_22px_-6px_rgba(139,92,246,0.9)]">
            <Zap className="size-4 text-white" />
          </span>
          <span className="truncate text-gradient max-[400px]:hidden">{t.brand}</span>
        </Link>

        <nav className="ms-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Primary">
          <Link
            to="/"
            search={{ browse: true }}
            className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
          >
            {t.allServices}
          </Link>
          {CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              to="/category/$slug"
              params={{ slug: category.slug }}
              className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
              activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
            >
              {categoryName(t, category.slug)}
            </Link>
          ))}
          <Link
            to="/orders"
            className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
          >
            {t.orders}
          </Link>
        </nav>

        <div className="ms-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {authPending || (profile === null && !ready) ? (
            <div className="h-10 w-24 animate-pulse rounded-full bg-white/10" />
          ) : profile ? (
            <WalletPill />
          ) : (
            <Link
              to="/login"
              search={{ tab: undefined }}
              className="btn-glow hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold sm:inline-flex"
            >
              {t.signIn}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setSupportOpen(!supportOpen)}
            aria-label={t.liveSupport}
            aria-expanded={supportOpen}
            className="relative grid size-10 shrink-0 place-items-center rounded-full border border-white/10 md:hidden"
          >
            <MessageCircle className="size-[18px] text-violet" />
            <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[var(--nc-ink)]" />
          </button>

          {profile ? (
            <span className="hidden sm:block">
              <ProfileAvatar />
            </span>
          ) : null}
          <CurrencyPreviewSwitch className="hidden lg:flex" />
          <ThemeIconButton />

          {isAdmin ? (
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={openCreateService}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet/40 bg-violet/15 px-3 text-sm font-semibold hover:border-violet"
              >
                <Plus className="size-4" />
                {t.addService}
              </button>
              <Link
                to="/admin"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-fuchsia/40 px-3 text-sm font-semibold text-fuchsia-100"
              >
                <Shield className="size-4" />
                {t.admin}
              </Link>
            </div>
          ) : null}

          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 sm:size-11"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? t.menuClose : t.menuOpen}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div>
              <button type="button" aria-label={t.menuClose} className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={close} />
              <div className="glass fixed inset-x-3 top-[4.75rem] z-50 max-h-[min(80vh,42rem)] overflow-y-auto overflow-x-hidden md:inset-x-auto md:end-4 md:w-[24rem] rounded-[1.75rem] border border-white/15 bg-ink/80 p-3 shadow-[0_24px_80px_-24px_rgba(139,92,246,0.85)]">
                {profile ? (
                  <ProfileSummary
                    onTopUp={() => {
                      close();
                      openSelfTopUp();
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setSupportOpen(true);
                  }}
                  className="keep-white mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(16,185,129,0.9)]"
                >
                  {t.liveSupport}
                </button>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LanguageToggle />
                  <CurrencyPreviewSwitch />
                </div>
                <div className="mt-2">
                  <ThemeSegmented />
                </div>
                <nav className="mt-2 grid gap-1 md:hidden" aria-label="Mobile">
                  <Link to="/" search={{ browse: true }} className="min-h-11 rounded-2xl px-3 py-3 text-sm hover:bg-white/5" onClick={close}>
                    {t.allServices}
                  </Link>
                  {CATEGORIES.map((category) => (
                    <Link
                      key={category.slug}
                      to="/category/$slug"
                      params={{ slug: category.slug }}
                      className="min-h-11 rounded-2xl px-3 py-3 text-sm hover:bg-white/5"
                      onClick={close}
                    >
                      {categoryName(t, category.slug)}
                    </Link>
                  ))}
                  <Link to="/orders" className="min-h-11 rounded-2xl px-3 py-3 text-sm hover:bg-white/5" onClick={close}>
                    {t.orders}
                  </Link>
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        className="min-h-11 rounded-2xl px-3 py-3 text-start text-sm hover:bg-white/5"
                        onClick={() => {
                          close();
                          openCreateService();
                        }}
                      >
                        + {t.addService}
                      </button>
                      <Link to="/admin" className="min-h-11 rounded-2xl px-3 py-3 text-sm hover:bg-white/5" onClick={close}>
                        {t.admin}
                      </Link>
                    </>
                  ) : null}
                </nav>
                {!profile && ready ? (
                  <Link
                    to="/login"
                    search={{ tab: undefined }}
                    className="btn-glow mt-3 flex min-h-11 items-center justify-center rounded-full text-sm font-semibold"
                    onClick={close}
                  >
                    {t.signIn}
                  </Link>
                ) : (
                  <div className="mt-3">
                    <SignOutButton onDone={close} />
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
