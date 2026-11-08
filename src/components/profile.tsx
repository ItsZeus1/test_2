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
import { SyriaGreenFlagIcon } from "@/components/pay-emblem";
import { ArrowLeft, Bell, MessageCircle, ReceiptText, Settings, Wallet } from "lucide-react";
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

/** Account settings as a clean in-page view inside "Me" (avatar, name, phone). */
function AccountSettingsView({ onBack }: { onBack: () => void }) {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const { profile, setProfile } = useProfileState();
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone);
    setAvatarUrl(profile.avatarUrl);
  }, [profile?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null;

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast.error(t.heroTooBig);
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
    onBack();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-28 sm:px-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-semibold text-muted">
        <ArrowLeft className="size-4 rtl:rotate-180" strokeWidth={1.75} />
        {ar ? "العودة للملف الشخصي" : "Back to Profile"}
      </button>
      <form onSubmit={(event) => void onSubmit(event)} className="me-card mt-3 rounded-3xl p-5">
        <h1 className="font-display text-2xl font-extrabold">{ar ? "إعدادات الحساب" : "Account settings"}</h1>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-16 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 text-lg font-bold">
            {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
          </span>
          <label className="text-sm text-muted">
            {t.avatar}
            <input className="mt-1 block text-xs" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
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
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          {ar ? "عملة الحساب:" : "Account currency:"}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 font-bold text-fg">
            {profile.currency === "SYP" ? <SyriaGreenFlagIcon /> : null}
            {profile.currency === "SYP" ? "SYP ل.س" : "USD $"}
          </span>
        </p>
        <button type="submit" disabled={busy} className="btn-glow keep-white mt-5 min-h-12 w-full rounded-2xl text-sm font-bold text-white disabled:opacity-60">
          {busy ? t.wait : t.saveProfile}
        </button>
      </form>
    </main>
  );
}

/* ============================ "حسابي" — account hub (bottom dock) ============================ */

export function MeView() {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const money = useMoney();
  const { profile, ready, setProfile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const meSub = useNovaUi((state) => state.meSub);
  const setMeSub = useNovaUi((state) => state.setMeSub);
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
  if (meSub === "settings") return <AccountSettingsView onBack={() => setMeSub("home")} />;
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
          <span className="inline-flex items-center gap-2.5">
            <ReceiptText className="lux-icon size-[18px]" strokeWidth={1.75} aria-hidden />
            {ar ? "طلباتي" : "My orders"}
          </span>
          <span aria-hidden>›</span>
        </Link>
        <Link to="/wallet" onClick={() => setDockView(null)} className={shortcut}>
          <span className="inline-flex items-center gap-2.5">
            <Wallet className="lux-icon size-[18px]" strokeWidth={1.75} aria-hidden />
            {ar ? "المحفظة" : "Wallet"}
          </span>
          <span aria-hidden>›</span>
        </Link>
        <button type="button" onClick={() => setFeedOpen(true)} className={shortcut}>
          <span className="inline-flex items-center gap-2.5">
            <Bell className="lux-icon size-[18px]" strokeWidth={1.75} aria-hidden />
            {ar ? "الإشعارات" : "Notifications"}
          </span>
          <span aria-hidden>›</span>
        </button>
        <button type="button" onClick={() => setSupportOpen(true)} className={shortcut}>
          <span className="inline-flex items-center gap-2.5">
            <MessageCircle className="lux-icon size-[18px]" strokeWidth={1.75} aria-hidden />
            {t.supportCenter}
          </span>
          <span aria-hidden>›</span>
        </button>
        <button type="button" onClick={() => setMeSub("settings")} className={shortcut}>
          <span className="inline-flex items-center gap-2.5">
            <Settings className="lux-icon size-[18px]" strokeWidth={1.75} aria-hidden />
            {ar ? "إعدادات الحساب" : "Account settings"}
          </span>
          <span aria-hidden>›</span>
        </button>
      </nav>
      <div className="mt-4">
        <SignOutButton onDone={() => setDockView(null)} className="w-full" />
      </div>
    </main>
  );
}

