import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { inferAsyncReturnType } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import { Role } from '@/app/types/auth';
import { createAdminClient } from '@/app/lib/auth/supabase';

// Shared function to create Supabase client
export function createSupabaseContext(req: Request) {
  const cookieHeader = req.headers.get('cookie');
  const authHeader = req.headers.get('authorization');
  const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieHeader?.split('; ')
            .find(c => c.startsWith(`${name}=`))
            ?.split('=')[1];
        },
        set() { return; },
        remove() { return; },
      },
      auth: {
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      },
    }
  );
}

interface CreateContextOptions {
  req: Request;
}

interface ContextUser extends User {
  role: Role;  // We use the Role type from auth.ts
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

async function verifyUserRole(supabase: ReturnType<typeof createServerClient>, user: User): Promise<Role> {
  try {
    // Get role from JWT metadata first
    const metadataRole = user.app_metadata?.user_role as Role;
    if (!metadataRole) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'No role found in user metadata',
      });
    }

    // Verify role exists in public.users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (dbError || !dbUser) {
      console.error('Error verifying user role in database:', dbError);
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User not found in database',
      });
    }

    const dbRole = dbUser.role as Role;
    if (dbRole !== metadataRole) {
      console.warn(`Role mismatch - Auth: ${metadataRole}, DB: ${dbRole}`);
      
      // If there's a mismatch, update the metadata to match the database
      const { error: updateError } = await supabase.auth.updateUser({
        data: { user_role: dbRole }
      });
      
      if (updateError) {
        console.error('Failed to sync auth metadata:', updateError);
      }

      // Use admin client to update database role claim
      const adminClient = createAdminClient();
      const { error: dbRoleError } = await adminClient.rpc('set_claim', {
        uid: user.id,
        claim: 'role',
        value: dbRole.toLowerCase()
      });

      if (dbRoleError) {
        console.error('Failed to sync database role:', dbRoleError);
      }
      
      return dbRole;
    }

    return metadataRole;
  } catch (error) {
    console.error(`Failed to verify user role for ${user.id}:`, error);
    throw error instanceof TRPCError ? error : new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to verify user role',
      cause: error,
    });
  }
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
        global: {
          headers: authToken ? {
            Authorization: `Bearer ${authToken}`
          } : undefined,
        },
      }
    );

    let session = null;
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

    // Get and verify user role
    try {
    const role = await verifyUserRole(supabase, session.user);
    const contextUser: ContextUser = {
      ...session.user,
      role
    };
      console.log('Verified user role:', role);

    return {
      req,
      user: contextUser,
      supabase,
    };
    } catch (error) {
      console.error('Error getting user role:', error);
      throw error instanceof TRPCError ? error : new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get user role',
        cause: error,
      });
    }
  } catch (error) {
    console.error('Context creation error:', error);
    throw error instanceof TRPCError ? error : new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Context creation failed',
      cause: error,
    });
  }
}

export type Context = inferAsyncReturnType<typeof createContext>;