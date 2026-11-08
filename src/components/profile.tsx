"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { LanguageToggle } from "@/components/language-toggle";
import { SignOutButton } from "@/components/confirm-dialog";
import { VipMarginPicker } from "@/components/vip-margin";
import { Link } from "@/lib/nav";
import { ThemeSegmented, applyTheme, readSavedTheme } from "@/components/theme-toggle";
import { useI18n, useMoney } from "@/lib/i18n";
import { onStoreChange, readProfile, setSavedPlayerId, updateProfile, warmupStore } from "@/lib/store/api";
import type { Profile } from "@/lib/store/types";
import { CURRENCY_KEY, useNovaUi, type Lang } from "@/lib/ui-store";
import { RoleBadge } from "@/components/receipt-badge";
import { toast } from "sonner";

const LANG_KEY = "novacharge.lang";

export function applyDocumentLanguage(language: Lang, persist = false) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  if (!persist) return;
  try {
    localStorage.setItem(LANG_KEY, language);
  } catch {
    /* private mode */
  }
}

type ProfileState = {
  profile: Profile | null;
  ready: boolean;
  authPending: boolean;
  setProfile: (profile: Profile | null) => void;
  refreshProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function useProfileState(): ProfileState {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("Profile provider missing");
  return value;
}

export function ProfileSummary({ onTopUp }: { onTopUp?: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const { profile } = useProfileState();
  if (!profile) return null;
  return (
    <div className="glass w-full rounded-2xl p-3 sm:max-w-md">
      <p className="text-[11px] font-bold tracking-[0.16em] text-violet uppercase">{t.wallet}</p>
      <p className="mt-1 font-semibold">{profile.name}</p>
      <p className="text-sm text-muted" dir="ltr">
        @{profile.username} · {profile.email}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RoleBadge role={profile.role} />
        <span className="font-semibold tabular-nums">{money(profile.balanceCents, profile.currency)}</span>
        {onTopUp ? (
          <button type="button" onClick={onTopUp} className="min-h-11 rounded-full border border-white/15 px-3 text-sm font-semibold">
            {t.topUp}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const language = useNovaUi((state) => state.language);
  const setLanguage = useNovaUi((state) => state.setLanguage);
  const setTheme = useNovaUi((state) => state.setTheme);

  const refreshProfile = useCallback(async () => {
    const next = await readProfile();
    setProfile(next);
    setReady(true);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "ar" || saved === "en") setLanguage(saved);
      const currency = localStorage.getItem(CURRENCY_KEY);
      if (currency === "USD" || currency === "SYP") useNovaUi.setState({ previewCurrency: currency });
    } catch {
      /* ignore */
    }
  }, [setLanguage]);

  useEffect(() => {
    const saved = readSavedTheme();
    setTheme(saved);
    applyTheme(saved);
  }, [setTheme]);

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    let cancel = false;
    void warmupStore().finally(() => {
      if (cancel) return;
      void readProfile().then((next) => {
        if (cancel) return;
        setProfile(next);
        setReady(true);
      });
    });
    const stop = onStoreChange(() => {
      void readProfile().then((next) => {
        if (!cancel) {
          setProfile(next);
          setReady(true);
        }
      });
    });
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, ready, authPending: !ready, setProfile, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function ProfileSettingsModal() {
  const { t } = useI18n();
  const money = useMoney();
  const open = useNovaUi((state) => state.profileOpen);
  const closeProfile = useNovaUi((state) => state.closeProfile);
  const { profile, setProfile } = useProfileState();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !profile) return;
    setName(profile.name);
    setPhone(profile.phone);
    setAvatarUrl(profile.avatarUrl);
  }, [open, profile]);

  if (!open || !profile || profile.role === "ADMIN") return null;

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t.avatar);
      return;
    }
    if (file.size > 900_000) {
      toast.error("Use an image under 900 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatarUrl(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await updateProfile({ name, phone, avatarUrl });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setProfile(result.profile);
    toast.success(t.profileSaved);
    closeProfile();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label={t.menuClose} onClick={closeProfile} />
      <form onSubmit={(event) => void onSubmit(event)} className="glass relative z-10 w-full max-w-md rounded-3xl p-5">
        <p className="text-xs font-bold tracking-[0.16em] text-violet uppercase">{t.profile}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold">{t.profileTitle}</h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-16 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-lg font-bold">
            {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
          </span>
          <label className="text-sm text-muted">
            {t.avatar}
            <input
              className="mt-1 block text-xs"
              type="file"
              accept="image/*"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
          </label>
        </div>
        <label className="mt-4 block text-sm text-muted">
          {t.name}
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="mt-3 block text-sm text-muted">
          {t.phone}
          <input className="field mt-1" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        </label>
        <div className="mt-4">
          <VipMarginPicker />
          {Object.keys(profile.savedPlayerIds ?? {}).length ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-bold text-muted">{t.savedIds}</p>
              <ul className="mt-2 grid gap-1.5">
                {Object.entries(profile.savedPlayerIds).map(([slug, value]) => (
                  <li key={slug} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{slug}</span>
                    <code dir="ltr" className="truncate text-xs">
                      {value}
                    </code>
                    <button
                      type="button"
                      aria-label={t.idRemoved}
                      onClick={() =>
                        void setSavedPlayerId({ slug, playerId: null }).then((result) => {
                          if (result.ok) setProfile(result.profile);
                        })
                      }
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-xs"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3" />
          <ThemeSegmented label={t.appearance} />
          <div className="mt-3">
            <LanguageToggle />
          </div>
        </div>
        <p className="mt-3 text-sm">
          {t.balance}: <span className="font-semibold tabular-nums">{money(profile.balanceCents, profile.currency)}</span>
          <Link to="/wallet" onClick={closeProfile} className="ms-2 inline-flex min-h-9 items-center rounded-full border border-violet/40 px-3 text-xs font-bold text-violet">
            {t.openWalletView}
          </Link>
          <span className="ms-2 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-bold">{profile.currency === "SYP" ? "SYP ل.س" : "USD $"}</span>
        </p>
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={busy} className="btn-glow min-h-11 flex-1 rounded-full text-sm font-semibold disabled:opacity-60">
            {busy ? t.wait : t.saveProfile}
          </button>
          <button type="button" onClick={closeProfile} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold">
            {t.close}
          </button>
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <SignOutButton onDone={closeProfile} className="w-full" />
        </div>
      </form>
    </div>
  );
}

/* ============================ "حسابي" — account hub (bottom dock) ============================ */

export function MeView() {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const money = useMoney();
  const { profile, ready, setProfile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const openProfile = useNovaUi((state) => state.openProfile);
  const setSupportOpen = useNovaUi((state) => state.setSupportOpen);
  const setFeedOpen = useNovaUi((state) => state.setFeedOpen);
  const setDockView = useNovaUi((state) => state.setDockView);

  if (!ready) return <main className="mx-auto max-w-2xl px-4 py-6"><div className="h-40 animate-pulse rounded-3xl bg-white/5" /></main>;
  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted">{ar ? "سجّل الدخول لعرض حسابك ورصيدك." : "Sign in to see your account and balance."}</p>
        <Link to="/login" search={{ tab: undefined }} onClick={() => setDockView(null)} className="btn-glow keep-white mt-4 inline-flex min-h-12 items-center rounded-2xl px-6 text-sm font-bold text-white">
          {t.signIn}
        </Link>
      </main>
    );
  }
  const saved = Object.entries(profile.savedPlayerIds ?? {});
  const shortcut = "flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold";

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-28 sm:px-6">
      {/* identity */}
      <section className="me-card flex items-center gap-3 rounded-3xl p-4">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-xl font-extrabold text-white">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full object-cover" /> : profile.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="item-name truncate text-lg font-extrabold">{profile.name}</p>
          <p className="truncate text-xs text-muted" dir="ltr">
            {profile.email}
          </p>
        </div>
        <RoleBadge role={profile.role} />
      </section>

      {/* wallet */}
      <section className="me-wallet keep-white mt-3 rounded-3xl p-4 text-white">
        <p className="text-xs font-semibold text-white/75">{t.currentBalance}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <p className="price-num text-3xl !text-white whitespace-nowrap" dir="ltr">
            {money(profile.balanceCents, profile.currency)}
          </p>
          <button type="button" onClick={openSelfTopUp} className="min-h-11 rounded-2xl bg-white px-4 text-sm font-bold text-[#1e3a8a]">
            {t.chargeCta}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/70">
          {ar ? "عملة الحساب:" : "Account currency:"} {profile.currency === "SYP" ? (ar ? "الليرة السورية (ل.س)" : "Syrian pound (SYP)") : ar ? "الدولار ($)" : "US dollar ($)"}
        </p>
      </section>

      {/* VIP margin */}
      <div className="mt-3">
        <VipMarginPicker />
      </div>

      {/* saved IDs */}
      <section className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-bold">{t.savedIds}</p>
        {saved.length === 0 ? <p className="mt-1 text-xs text-muted">{t.saveIdChip}</p> : null}
        <ul className="mt-2 grid gap-1.5">
          {saved.map(([slug, value]) => (
            <li key={slug} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{slug}</span>
              <code dir="ltr" className="truncate text-xs">
                {value}
              </code>
              <button
                type="button"
                aria-label={t.idRemoved}
                onClick={() =>
                  void setSavedPlayerId({ slug, playerId: null }).then((result) => {
                    if (result.ok) setProfile(result.profile);
                  })
                }
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-xs"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* quick settings */}
      <section className="mt-3 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
        <ThemeSegmented label={t.appearance} />
        <LanguageToggle />
      </section>

      {/* shortcuts */}
      <nav className="mt-3 grid gap-2">
        <Link to="/orders" onClick={() => setDockView(null)} className={shortcut}>
          {ar ? "🧾 طلباتي" : "🧾 My orders"} <span aria-hidden>›</span>
        </Link>
        <Link to="/wallet" onClick={() => setDockView(null)} className={shortcut}>
          {ar ? "💳 المحفظة" : "💳 Wallet"} <span aria-hidden>›</span>
        </Link>
        <button type="button" onClick={() => setFeedOpen(true)} className={shortcut}>
          {ar ? "🔔 الإشعارات" : "🔔 Notifications"} <span aria-hidden>›</span>
        </button>
        <button type="button" onClick={() => setSupportOpen(true)} className={shortcut}>
          {t.supportCenter} <span aria-hidden>›</span>
        </button>
        <button type="button" onClick={openProfile} className={shortcut}>
          {ar ? "⚙️ إعدادات الحساب" : "⚙️ Account settings"} <span aria-hidden>›</span>
        </button>
      </nav>
      <div className="mt-4">
        <SignOutButton onDone={() => setDockView(null)} className="w-full" />
      </div>
    </main>
  );
}

