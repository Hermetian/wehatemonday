import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { supabase } from '../lib/supabase';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

const isAuthed = t.middleware(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.authorization;
  if (!authHeader) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing authorization header',
    });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Auth error:', error);
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user,
      },
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid authentication',
    });
  }
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const middleware = t.middleware; 