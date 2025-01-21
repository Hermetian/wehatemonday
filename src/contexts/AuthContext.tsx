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
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      // Fetch user role from the user table
      const { data: userData, error: userError } = await supabase
        .from('User')
        .select('role')
        .eq('id', data.user.id)
        .single();
      if (userError) throw userError;
      setRole(userData.role);
    }
  };

  const signUp = async (email: string, password: string, role: UserRole): Promise<void> => {
    try {
      // First try to sign in if user exists
      const { data: existingAuth, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      let authUser;

      if (signInError?.message?.includes('Invalid login credentials')) {
        // User doesn't exist, create new auth user
        const { data: newAuth, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: role,
            },
          },
        });
        
        if (signUpError) throw signUpError;
        authUser = newAuth.user;
      } else if (signInError) {
        // Some other error occurred
        throw signInError;
      } else {
        // User exists and signed in successfully
        authUser = existingAuth.user;
      }
      
      if (authUser) {
        console.log('User authenticated:', authUser.id, 'with role:', role);
        
        // Upsert user record in the User table using admin client
        const { error: upsertError } = await supabaseAdmin
          .from('User')
          .upsert(
            {
              id: authUser.id,
              email: email,
              role: role,
              updatedAt: 'now()'
            },
            { 
              onConflict: 'id',
            }
          );
          
        if (upsertError) {
          console.error('Error upserting user record:', upsertError);
          await supabase.auth.signOut();
          throw upsertError;
        }
        
        setRole(role);
      }
    } catch (error) {
      console.error('Signup/signin error:', error);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 