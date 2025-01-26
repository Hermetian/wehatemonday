import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';
import { inferAsyncReturnType } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import { UserClade } from '@/lib/supabase/types';

interface CreateContextOptions {
  req: Request;
}

interface ContextUser extends User {
  clade?: UserClade;
}

function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (name) {
      cookies[name] = parts[1]?.trim() || '';
    }
  });
  return cookies;
}

function getAuthToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

async function getUserProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<{ clade: UserClade } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('clade')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data;
}

export async function createContext({ req }: CreateContextOptions) {
  try {
    // Log headers for debugging
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));
    
    const cookieHeader = req.headers.get('cookie');
    console.log('Cookie header:', cookieHeader);
    
    const cookies = parseCookies(cookieHeader);
    console.log('Parsed cookies:', cookies);

    const authToken = getAuthToken(req);
    console.log('Auth token present:', !!authToken);

    // Create the Supabase client with the anon key for auth
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookies[name];
          },
          set() {
            // Cookie setting is handled by middleware
            return;
          },
          remove() {
            // Cookie removal is handled by middleware
            return;
          },
        },
        auth: {
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    );

    let session: Session | null = null;
    let sessionError = null;

    // Try getting session from cookies first
    const cookieSession = await supabase.auth.getSession();
    if (cookieSession.data.session) {
      session = cookieSession.data.session;
    } else if (authToken) {
      // If no cookie session, try using the auth token
      const { data, error } = await supabase.auth.getUser(authToken);
      if (data?.user) {
        session = {
          access_token: authToken,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: '',
          user: data.user,
        };
      } else {
        sessionError = error;
      }
    }
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid session',
        cause: sessionError,
      });
    }

    if (!session?.user) {
      console.error('No session found');
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'No session found',
      });
    }

    console.log('Session found for user:', session.user.email);

    // Create a service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );

    // Get the user's profile with clade
    const profile = await getUserProfile(serviceClient, session.user.id);
    
    const user: ContextUser = {
      ...session.user,
      clade: profile?.clade,
    };

    console.log('User profile loaded:', { id: user.id, email: user.email, clade: user.clade });

    return {
      req,
      user,
      supabase: serviceClient, // Use the service client for database operations
    };
  } catch (error) {
    console.error('Context creation error:', error);
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Context creation failed',
      cause: error,
    });
  }
}

export type Context = inferAsyncReturnType<typeof createContext>;