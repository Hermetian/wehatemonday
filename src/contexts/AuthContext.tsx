import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { UserRole } from '@prisma/client';

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

  const fetchUserRole = async (userId: string) => {
    const { data: userData, error: userError } = await supabaseAdmin
      .from('User')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (!userError && userData) {
      setRole(userData.role);
    } else {
      console.error('Error fetching user role:', userError);
      setRole(null);
    }
  };

  const refreshSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await fetchUserRole(session.user.id);
    }
  };

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserRole(session.user.id);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await fetchUserRole(data.user.id);
    }
  };

  const signUp = async (email: string, password: string, role: UserRole): Promise<void> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    // If error indicates user already exists, try to sign in
    if (error?.message?.includes('User already registered')) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      if (signInError) throw signInError;
      if (signInData.user) {
        // Upsert user in the database with the specified role
        const { error: upsertError } = await supabaseAdmin
          .from('User')
          .upsert(
            { 
              id: signInData.user.id, 
              email, 
              role,
              updatedAt: 'now()'
            },
            { 
              onConflict: 'id',
              ignoreDuplicates: false 
            }
          );
        if (upsertError) throw upsertError;
        setRole(role);
        return;
      }
    }
    
    // Handle normal sign up flow
    if (error) throw error;
    if (data.user) {
      // Upsert user in the database with the specified role
      const { error: upsertError } = await supabaseAdmin
        .from('User')
        .upsert(
          { 
            id: data.user.id, 
            email, 
            role,
            updatedAt: 'now()'
          },
          { 
            onConflict: 'id',
            ignoreDuplicates: false 
          }
        );
      if (upsertError) throw upsertError;
      setRole(role);
    }
  };

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setRole(null);
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