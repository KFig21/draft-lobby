import { avatarSchema, type Avatar as AvatarData } from '@draft-lobby/shared';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../supabase';

interface MyProfile {
  username: string | null;
  avatar: AvatarData | null;
  /** When the user finished first-run onboarding; null = not yet onboarded. */
  onboardedAt: string | null;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** The signed-in user's profile row (username + chosen avatar). */
  profile: MyProfile | null;
  /** True once the profile fetch has resolved (found or not) for the current
   * session — lets route guards tell "still loading" from "no profile". */
  profileLoaded: boolean;
  /** Reload the profile after the user edits it. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  profile: null,
  profileLoaded: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const userId = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileLoaded(false);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('username, avatar, onboarded_at')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const parsed = avatarSchema.safeParse(data.avatar);
      setProfile({
        username: data.username ?? null,
        avatar: parsed.success ? parsed.data : null,
        onboardedAt: data.onboarded_at ?? null,
      });
    }
    setProfileLoaded(true);
  }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, profile, profileLoaded, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
