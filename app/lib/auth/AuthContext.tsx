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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AuthContext] Updating auth state:`, { 
      hasSession: !!session,
      currentRole: role,
      currentUser: !!user,
      loading
    });
    
    if (session?.user) {
      console.log(`[${timestamp}] [AuthContext] Valid session found for:`, session.user.email);
      setUser(session.user);
      setAccessToken(session.access_token);
      
      if (!role) {
        console.log(`[${timestamp}] [AuthContext] Fetching role for user:`, session.user.email);
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
            console.log(`[${timestamp}] [AuthContext] Role fetch successful:`, data);
            setRole(data.role);
            // Set loading to false after we have both user and role
            setLoading(false);
          } else {
            const error = await response.json();
            console.error(`[${timestamp}] [AuthContext] Role fetch failed:`, error);
            // Set loading to false even if role fetch fails
            setLoading(false);
          }
        } catch (error) {
          console.error(`[${timestamp}] [AuthContext] Error fetching role:`, error);
          // Set loading to false on error
          setLoading(false);
        }
      } else {
        // If we already have a role, we can set loading to false immediately
        setLoading(false);
      }
    } else {
      console.log(`[${timestamp}] [AuthContext] No session, clearing auth state`);
      setUser(null);
      setRole(null);
      setAccessToken(null);
      // Set loading to false when clearing auth state
      setLoading(false);
    }
  }, [role, user, loading]);

  const refreshSession = useCallback(async () => {
    console.log('[AuthContext] Refreshing session');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      await updateAuthState(session);
    } catch (error) {
      console.error('[AuthContext] Error refreshing session:', error);
      setUser(null);
      setRole(null);
      setAccessToken(null);
      setLoading(false);
    }
  }, [updateAuthState]);

  // Force loading to false after a timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('[AuthContext] Force ending loading state after timeout');
        setLoading(false);
      }
    }, 5000); // 5 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  // Initial session check
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AuthContext] Starting auth initialization. Current state:`, {
      initialized,
      loading,
      hasUser: !!user,
      hasRole: !!role
    });
    
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        console.log(`[${timestamp}] [AuthContext] Got initial session:`, { hasSession: !!session });
        await updateAuthState(session);
      } catch (error) {
        console.error(`[${timestamp}] [AuthContext] Error initializing auth:`, error);
        // Set loading to false on error
        setLoading(false);
      } finally {
        console.log(`[${timestamp}] [AuthContext] Auth initialization complete. State:`, {
          hasUser: !!user,
          hasRole: !!role,
          loading
        });
        setInitialized(true);
      }
    };

    initializeAuth();
  }, [updateAuthState, user, role, loading, initialized]);

  // Auth state change listener
  useEffect(() => {
    if (!initialized) {
      console.log('[AuthContext] Skipping auth listener setup - not initialized');
      return;
    }

    console.log('[AuthContext] Setting up auth state listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [AuthContext] Auth state changed:`, { 
          event, 
          hasSession: !!session,
          currentState: { hasUser: !!user, hasRole: !!role, loading }
        });
        await updateAuthState(session);
      }
    );

    return () => {
      console.log('[AuthContext] Cleaning up auth state listener');
      subscription.unsubscribe();
    };
  }, [initialized, role, updateAuthState, user, loading]);

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
    <AuthContext.Provider value={{ 
      user, 
      role, 
      loading, 
      signIn, 
      signUp, 
      signOut,
      refreshSession 
    }}>
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