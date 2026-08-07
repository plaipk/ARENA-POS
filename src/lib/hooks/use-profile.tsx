"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

interface ProfileContextValue {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
}

const ProfileContext = createContext<ProfileContextValue>({
  user: null,
  profile: null,
  isAdmin: false,
});

/**
 * Provides the current auth user + profile (role) to the whole app tree.
 * Seeded with server-fetched initial values (see (app)/layout.tsx) to avoid a
 * loading flash, then kept in sync if the auth session changes client-side.
 */
export function ProfileProvider({
  initialUser,
  initialProfile,
  children,
}: {
  initialUser: User | null;
  initialProfile: Profile | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [profile, setProfile] = useState(initialProfile);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setProfile(data ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <ProfileContext.Provider value={{ user, profile, isAdmin: profile?.role === "admin" }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
