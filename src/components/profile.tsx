import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import { onStoreChange, readProfile, updateProfile, warmupStore } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import type { Profile } from "@/lib/store/types";
import { useNovaUi, readSavedTheme, type Lang } from "@/lib/ui-store";
import { ThemeSegmented } from "@/components/theme-toggle";
import { RoleBadge } from "@/components/role-badge";
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
        <span className="font-semibold tabular-nums">{formatUsd(profile.balanceCents)}</span>
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
    } catch {
      /* ignore */
    }
  }, [setLanguage]);

  useEffect(() => {
    // New visitors (nothing saved) start in Light; a saved choice always wins.
    setTheme(readSavedTheme() ?? "light", false);
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
      toast.error(t.avatarTooBig);
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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label={t.menuClose} onClick={closeProfile} />
      <form onSubmit={(event) => void onSubmit(event)} className="glass relative z-10 my-auto w-full max-w-md rounded-3xl p-4 sm:p-5">
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
        <ThemeSegmented />
        <p className="mt-4 text-sm">
          {t.balance}: <span className="font-semibold tabular-nums">{formatUsd(profile.balanceCents)}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn-glow min-h-11 flex-1 rounded-full text-sm font-semibold disabled:opacity-60">
            {busy ? t.wait : t.saveProfile}
          </button>
          <button type="button" onClick={closeProfile} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold">
            {t.close}
          </button>
        </div>
      </form>
    </div>
  );
}
