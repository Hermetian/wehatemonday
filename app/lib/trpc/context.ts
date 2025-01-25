import { createServerClient } from '@supabase/ssr';
import type { User, Session } from '@supabase/supabase-js';
import { inferAsyncReturnType } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import prisma from '@/app/prisma';

interface CreateContextOptions {
  req: Request;
}

interface ContextUser extends User {
  role?: string;
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

async function getUserRole(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  
  try {
    // Test the Prisma connection first
    await prisma.$connect();
    
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    
    if (!dbUser) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User not found in database',
      });
    }
    
    return dbUser.role;
  } catch (error) {
    console.error(`Failed to get user role for ${userId}:`, error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database connection error',
      cause: error,
    });
  } finally {
    await prisma.$disconnect();
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

    const user = session.user as ContextUser;
    
    // Only try to get the role if we have a valid user
    try {
      const role = await getUserRole(user.id);
      user.role = role;
      console.log('User role:', role);
    } catch (error) {
      console.error('Error getting user role:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get user role',
        cause: error,
      });
    }

    return {
      req,
      prisma,
      user,
      supabase,
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