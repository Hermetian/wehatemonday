import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as SupabaseUser, Session} from '@supabase/supabase-js';
import { supabase } from '@/app/lib/auth/supabase';
import { Role } from '@/app/types/auth';
import { setAccessToken } from '@/app/lib/trpc/client';

type AuthContextType = {
  user: SupabaseUser | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: Role) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const updateAuthState = useCallback(async (session: Session | null) => {
    console.log('AuthContext: Updating auth state');
    console.log('AuthContext: Session present:', !!session);
    if (session) {
      console.log('AuthContext: Session details:', {
        user: session.user.email,
        expires: new Date(session.expires_at! * 1000).toISOString(),
        access_token: !!session.access_token,
        refresh_token: !!session.refresh_token,
        provider: session.user.app_metadata?.provider,
        user_role: session.user.app_metadata?.user_role
      });
    }

    try {
      if (!session?.user) {
        console.log('AuthContext: No user in session, clearing state');
        setUser(null);
        setRole(null);
        setAccessToken(null);
        return null;
      }

      // Set user and token immediately
      console.log('AuthContext: Setting user and token');
      setUser(session.user);
      setAccessToken(session.access_token);

      // Get role from database (source of truth)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userError || !userData) {
        console.error('AuthContext: Error fetching user role from database:', userError);
        throw new Error('Failed to fetch user role from database');
      }

      const userRole = userData.role as Role;
      console.log('AuthContext: Got role from database:', userRole);

      if (!userRole) {
        console.error('AuthContext: No role in database');
        throw new Error('No role in database');
      }

      setRole(userRole);
      return userRole;

    } catch (error) {
      console.error('AuthContext: Error updating auth state:', error);
      setUser(null);
      setRole(null);
      setAccessToken(null);
      return null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    console.log('AuthContext: Refreshing session...');
    setLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('AuthContext: Error refreshing session:', error);
        throw error;
      }
      console.log('AuthContext: Got fresh session:', !!session);
      await updateAuthState(session);
    } catch (error) {
      console.error('AuthContext: Error in refresh:', error);
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
      console.log('AuthContext: Initializing auth...');
      if (!mounted) return;
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('AuthContext: Error getting initial session:', error);
          throw error;
        }

        console.log('AuthContext: Initial session present:', !!session);
        if (!mounted) return;

        if (session?.user) {
          // Get role from database (source of truth)
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          if (userError || !userData) {
            console.error('AuthContext: Error fetching user role:', userError);
            throw new Error('Failed to fetch user role');
          }

          if (!mounted) return;

          setUser(session.user);
          setRole(userData.role as Role);
          setAccessToken(session.access_token);
          console.log('AuthContext: Successfully initialized with role:', userData.role);
        } else {
          setUser(null);
          setRole(null);
          setAccessToken(null);
          console.log('AuthContext: No session, cleared auth state');
        }
      } catch (error) {
        console.error('AuthContext: Error in initialization:', error);
        if (mounted) {
          setUser(null);
          setRole(null);
          setAccessToken(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initializeAuth();
    return () => { mounted = false; };
  }, []);

  // Auth state change listener
  useEffect(() => {
    if (!initialized) return;

    console.log('AuthContext: Setting up auth state listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthContext: Auth state change:', event);
        console.log('AuthContext: New session present:', !!session);
        
        if (session?.user) {
          try {
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('role')
              .eq('id', session.user.id)
              .single();

            if (userError || !userData) {
              console.error('AuthContext: Error fetching user role:', userError);
              throw new Error('Failed to fetch user role');
            }

            setUser(session.user);
            setRole(userData.role as Role);
            setAccessToken(session.access_token);
            console.log('AuthContext: Updated auth state with role:', userData.role);
          } catch (error) {
            console.error('AuthContext: Error updating auth state:', error);
            setUser(null);
            setRole(null);
            setAccessToken(null);
          }
        } else {
          setUser(null);
          setRole(null);
          setAccessToken(null);
          console.log('AuthContext: Cleared auth state');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialized]);

  const signIn = async (email: string, password: string): Promise<void> => {
    console.log('AuthContext: Starting sign in...');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('AuthContext: Supabase auth error:', error);
        throw error;
      }
      
      if (!data.session) {
        console.error('AuthContext: No session after sign in');
        throw new Error('No session after sign in');
      }

      console.log('AuthContext: Sign in successful, got session');
      
      // Wait for session to be fully established
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const userRole = await updateAuthState(data.session);
      console.log('AuthContext: Updated auth state, role:', userRole);

      if (!userRole) {
        console.error('AuthContext: Failed to get user role');
        throw new Error('Failed to get user role');
      }

      // Verify session is accessible
      const { data: { session: verifySession } } = await supabase.auth.getSession();
      if (!verifySession) {
        console.error('AuthContext: Session verification failed');
        throw new Error('Session verification failed');
      }

      console.log('AuthContext: Session verified, auth flow complete');

    } catch (error) {
      console.error('AuthContext: Error signing in:', error);
      setUser(null);
      setRole(null);
      setAccessToken(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, initialRole: Role): Promise<void> => {
    setLoading(true);
    try {
      // First try to sign in to check if user exists
      const { data: existingData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (!signInError && existingData.user) {
        console.log('User exists, updating role...');
        
        // Update user role in database
        const { error: updateError } = await supabase
          .from('users')
          .update({
            role: initialRole,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingData.user.id);

        if (updateError) throw updateError;

        // Update user metadata
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { user_role: initialRole }
        });

        if (metadataError) throw metadataError;

        await updateAuthState(existingData.session);
        return;
      }

      // If user doesn't exist, proceed with signup
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: {
            user_role: initialRole
          }
        }
      });

      if (error) throw error;

      if (!data.session || !data.user) {
        throw new Error('No session or user after sign up');
      }

      // Create user in database with role
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          id: data.user.id,
          email,
          role: initialRole,
          created_at: new Date().toISOString()
        });

      if (upsertError) throw upsertError;

      await updateAuthState(data.session);
    } catch (error) {
      console.error('Error in signUp:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<void> => {
    console.log('AuthContext: Starting sign out...');
    setLoading(true);
    try {
      setUser(null);
      setRole(null);
      setAccessToken(null);
      
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('AuthContext: Error in signOut:', error);
        throw error;
      }

      console.log('AuthContext: Clearing storage');
      localStorage.clear();
      sessionStorage.clear();
      
      console.log('AuthContext: Verifying session cleared');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('AuthContext: Session after signOut:', !!session);
    } catch (error) {
      console.error('AuthContext: Error in signOut:', error);
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