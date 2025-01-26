import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { UserClade } from '@/lib/supabase/types';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    };
  },
});

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ 
      code: 'UNAUTHORIZED',
      message: 'User not authenticated'
    });
  }

  if (!ctx.user.clade) {
    throw new TRPCError({ 
      code: 'UNAUTHORIZED',
      message: 'User clade not found'
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: {
        ...ctx.user,
        clade: ctx.user.clade as UserClade
      },
    },
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const middleware = t.middleware;