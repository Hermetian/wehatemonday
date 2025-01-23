import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '@/app/lib/auth/supabase';
import { UserRole } from '@prisma/client';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { prisma } from '@/app/lib/db/prisma';

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

  const fetchUserRole = async (userId: string) => {
    try {
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
    } catch (error) {
      console.error('Error in fetchUserRole:', error);
      setRole(null);
    }
  };

  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      if (session?.user) {
        setUser(session.user);
        await fetchUserRole(session.user.id);
      } else {
        setUser(null);
        setRole(null);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
      setUser(null);
      setRole(null);
    }
  };

  // Initial session check
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          setUser(session.user);
          await fetchUserRole(session.user.id);
        }
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
        if (session?.user) {
          setUser(session.user);
          await fetchUserRole(session.user.id);
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialized]);

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) throw error;
      
      if (data.user) {
        setUser(data.user);
        await fetchUserRole(data.user.id);
      }
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, role: UserRole): Promise<void> => {
    // First check if user exists
    const { data: existingUser } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (existingUser?.user) {
      // Get existing user data for audit log
      const existingUserData = await prisma.user.findUnique({
        where: { id: existingUser.user.id },
      });

      // User exists, update their role
      const { error: upsertError } = await supabaseAdmin
        .from('User')
        .upsert(
          { 
            id: existingUser.user.id, 
            email, 
            role,
            updatedAt: new Date().toISOString()
          },
          { 
            onConflict: 'id',
            ignoreDuplicates: false 
          }
        );
      if (upsertError) throw upsertError;

      // Create audit log for role update
      if (existingUserData) {
        await createAuditLog({
          action: 'UPDATE',
          entity: 'USER',
          entityId: existingUser.user.id,
          userId: existingUser.user.id,
          oldData: existingUserData,
          newData: { ...existingUserData, role },
          prisma,
        });
      }

      setRole(role);
      return;
    }

    // User doesn't exist, proceed with sign up
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    if (data.user) {
      // Create new user in the database with the specified role
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

      // Create audit log for new user
      await createAuditLog({
        action: 'CREATE',
        entity: 'USER',
        entityId: data.user.id,
        userId: data.user.id,
        oldData: null,
        newData: {
          id: data.user.id,
          email,
          role,
          updatedAt: new Date(),
        },
        prisma,
      });

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