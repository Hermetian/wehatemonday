import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { inferAsyncReturnType } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import prisma from '@/app/prisma';

interface CreateContextOptions {
  req: Request;
}

interface ContextUser extends User {
  role?: string;
}

async function getUserRole(userId: string): Promise<string | undefined> {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    
    if (!dbUser) {
      console.warn(`No user found with ID: ${userId}`);
      return undefined;
    }
    
    return dbUser.role;
  } catch (error) {
    console.error(`Failed to get user role for ${userId}:`, error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch user role',
      cause: error
    });
  }
}

export async function createContext({ req }: CreateContextOptions) {
  try {
    const authHeader = req.headers.get('authorization');
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookie = req.headers.get('cookie')?.split('; ').find(c => c.startsWith(`${name}=`));
            return cookie ? cookie.split('=')[1] : undefined;
          },
          set(name: string, value: string, options: CookieOptions) {
            // Cookie setting is handled by middleware
            return;
          },
          remove(name: string, options: CookieOptions) {
            // Cookie removal is handled by middleware
            return;
          },
        },
        auth: {
          detectSessionInUrl: false,
          persistSession: false,
        },
      }
    );

    let user: ContextUser | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

      if (error) {
        console.error('Error getting user:', error);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }

      if (supabaseUser) {
        user = supabaseUser as ContextUser;
        try {
          const role = await getUserRole(supabaseUser.id);
          user.role = role;
        } catch (error) {
          console.error('Error getting user role:', error);
          // Don't throw here, just log the error and continue without role
          user.role = undefined;
        }
      }
    }

    return {
      req,
      prisma,
      user,
      supabase,
    };
  } catch (error) {
    console.error('Error in createContext:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create context',
      cause: error,
    });
  }
}

export type Context = inferAsyncReturnType<typeof createContext>; 