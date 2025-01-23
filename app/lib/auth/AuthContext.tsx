import { createContext, useContext, useEffect, useState } from 'react';
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

  const updateAuthState = async (session: Session | null) => {
    if (session?.user) {
      setUser(session.user);
      setAccessToken(session.access_token);
      
      // Only fetch role if we don't have it yet
      if (!role) {
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
        }
      }
    } else {
      setUser(null);
      setRole(null);
      setAccessToken(null);
    }
  };

  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await updateAuthState(session);
    } catch (error) {
      console.error('Error refreshing session:', error);
      setUser(null);
      setRole(null);
      setAccessToken(null);
    }
  };

  // Initial session check
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        await updateAuthState(session);
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initializeAuth();
  }, []);

  // Auth state change listener
  useEffect(() => {
    if (!initialized) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await updateAuthState(session);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialized, role, updateAuthState]);

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      // First authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) throw error;
      
      if (data.session) {
        // Then update our local state
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
    try {
      // First create the user in Supabase
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
      });

      if (error) throw error;

      if (!data.session) {
        throw new Error('No session after sign up');
      }

      // Then create the user in our database with role
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

      // Finally update our local state
      await updateAuthState(data.session);
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      // First clear all local state
      setUser(null);
      setRole(null);
      setAccessToken(null);
      
      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear any cached data or local storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Force a session check to ensure we're signed out
      await supabase.auth.getSession();
    } catch (error) {
      console.error('Error in signOut:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signUp, signOut, refreshSession }}>
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