import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/app/lib/auth/supabase';
import { UserClade } from '@/lib/supabase/types';
import { setAccessToken } from '@/app/lib/trpc/client';

type AuthContextType = {
  user: User | null;
  clade: UserClade | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, clade: UserClade) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clade, setClade] = useState<UserClade | null>(null);
  const [loading, setLoading] = useState(true);

  const updateAuthState = useCallback(async (session: Session | null) => {
    try {
      if (!session?.user) {
        setUser(null);
        setClade(null);
        setAccessToken(null);
        return;
      }

      setUser(session.user);
      setAccessToken(session.access_token);
      setClade((session.user.app_metadata?.clade as UserClade) || null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial session check and auth state change listener
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateAuthState(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      await updateAuthState(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateAuthState]);

  const signIn = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) throw error;
      
      if (data.session) {
        await updateAuthState(data.session);
      } else {
        throw new Error('No session after sign in');
      }
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, clade: UserClade): Promise<void> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            clade,
          },
        },
      });

      if (error) throw error;

      if (!data.session) {
        throw new Error('No session after sign up');
      }

      await updateAuthState(data.session);
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      setUser(null);
      setClade(null);
      setAccessToken(null);
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      localStorage.clear();
      sessionStorage.clear();
      
      await supabase.auth.getSession();
    } catch (error) {
      console.error('Error in signOut:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await updateAuthState(session);
    } catch (error) {
      console.error('Error refreshing session:', error);
      setUser(null);
      setClade(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, [updateAuthState]);

  const value = {
    user,
    clade,
    loading,
    signIn,
    signUp,
    signOut,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}