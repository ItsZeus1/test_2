import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { onStoreChange, readProfile, warmupStore } from "@/lib/store/api";
import type { Profile } from "@/lib/store/types";

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

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const refreshProfile = useCallback(async () => {
    const next = await readProfile();
    setProfile(next);
    setReady(true);
  }, []);

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
