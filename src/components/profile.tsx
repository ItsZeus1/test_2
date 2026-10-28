import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import { onStoreChange, readProfile, warmupStore } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import type { Profile } from "@/lib/store/types";
import { useNovaUi, type Lang } from "@/lib/ui-store";
import { RoleBadge } from "@/components/role-badge";

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
