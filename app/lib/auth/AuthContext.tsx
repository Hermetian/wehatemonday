import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/app/lib/auth/supabase';
import { UserRole } from '@prisma/client';
import { setAccessToken } from '@/app/lib/trpc/client';

type AuthContextType = {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const updateAuthState = useCallback(async (session: Session | null) => {
    try {
      if (!session?.user) {
        setUser(null);
        setRole(null);
        setAccessToken(null);
        return;
      }

      setUser(session.user);
      setAccessToken(session.access_token);
      
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ 
            email: session.user.email,
            action: 'signin'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setRole(data.role);
        } else {
          console.warn('Failed to fetch role:', await response.text());
          setRole(null);
        }
      } catch (error) {
        console.error('Error fetching role:', error);
        setRole(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await updateAuthState(session);
    } catch (error) {
      console.error('Error refreshing session:', error);
      setUser(null);
      setRole(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, [updateAuthState]);

  // Initial session check
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) {
          await updateAuthState(session);
          setInitialized(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initializeAuth();
    return () => { mounted = false; };
  }, [updateAuthState]);

  // Auth state change listener
  useEffect(() => {
    if (!initialized) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await updateAuthState(session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialized, updateAuthState]);

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

  const signUp = async (email: string, password: string, role: UserRole): Promise<void> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
      });

      if (error) throw error;

      if (!data.session) {
        throw new Error('No session after sign up');
      }

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({ 
          email, 
          role, 
          action: 'signup' 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create user in database');
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
      setRole(null);
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

  const value = {
    user,
    role,
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