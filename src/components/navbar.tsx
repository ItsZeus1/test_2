import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Plus, Shield, Wallet, X, Zap } from "lucide-react";

import { RoleBadge } from "@/components/role-badge";
import { ProfileSummary, applyDocumentLanguage, useProfileState } from "@/components/profile";
import { categoryName, useI18n } from "@/lib/i18n";
import { logoutAccount } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import { CATEGORIES } from "@/lib/store/types";
import { useNovaUi, type Lang } from "@/lib/ui-store";

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

function LanguageToggle() {
  const { t, language } = useI18n();
  const setLanguage = useNovaUi((state) => state.setLanguage);

  function choose(next: Lang) {
    setLanguage(next);
    applyDocumentLanguage(next, true);
  }

  return (
    <div className="flex shrink-0 items-center rounded-full border border-white/15 bg-white/5 p-0.5 text-xs font-bold" role="group" aria-label={t.langLabel}>
      <button
        type="button"
        onClick={() => choose("ar")}
        aria-pressed={language === "ar"}
        className={`min-h-9 rounded-full px-2.5 ${language === "ar" ? "bg-white/15 text-white" : "text-muted"}`}
      >
        AR
        <span className="sr-only"> العربية</span>
      </button>
      <button
        type="button"
        onClick={() => choose("en")}
        aria-pressed={language === "en"}
        className={`min-h-9 rounded-full px-2.5 ${language === "en" ? "bg-white/15 text-white" : "text-muted"}`}
      >
        EN
        <span className="sr-only"> English</span>
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
  const { profile, ready, authPending } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [open, setOpen] = useState(false);
  const isAdmin = profile?.role === "ADMIN";

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-4">
        <Link to="/" search={{ browse: true }} className="flex min-w-0 shrink-0 items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet via-fuchsia to-indigo shadow-[0_0_22px_-6px_rgba(139,92,246,0.9)]">
            <Zap className="size-4 text-white" />
          </span>
          <span className="truncate text-gradient">{t.brand}</span>
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

        <div className="ms-auto flex shrink-0 items-center gap-2">
          {profile ? <ProfileAvatar /> : null}
          <LanguageToggle />

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

          {authPending || (profile === null && !ready) ? (
            <div className="hidden h-11 w-28 animate-pulse rounded-full bg-white/10 md:block" />
          ) : profile ? (
            <div className="hidden items-center gap-2 md:flex">
              <RoleBadge role={profile.role} />
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 ps-3 pe-1">
                <Wallet className="size-4 text-violet" />
                <span className="text-sm font-semibold tabular-nums">{formatUsd(profile.balanceCents)}</span>
                <button type="button" onClick={openSelfTopUp} className="min-h-9 rounded-full bg-white/10 px-3 text-xs font-bold">
                  {t.topUp}
                </button>
              </div>
              <SignOutButton />
            </div>
          ) : (
            <Link
              to="/login"
              search={{ tab: undefined }}
              className="btn-glow hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold md:inline-flex"
            >
              {t.signIn}
            </Link>
          )}

          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border border-white/10 md:hidden"
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
            <div className="md:hidden">
              <button type="button" aria-label={t.menuClose} className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={close} />
              <div className="glass fixed inset-x-3 top-[4.75rem] z-50 max-h-[min(78vh,40rem)] overflow-y-auto rounded-[1.75rem] border border-white/15 bg-ink/80 p-3 shadow-[0_24px_80px_-24px_rgba(139,92,246,0.85)]">
                {profile ? (
                  <ProfileSummary
                    onTopUp={() => {
                      close();
                      openSelfTopUp();
                    }}
                  />
                ) : null}
                <nav className="mt-2 grid gap-1" aria-label="Mobile">
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
