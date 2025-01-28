import { initTRPC, TRPCError } from '@trpc/server';
import { transformer } from './transformer';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer,
  errorFormatter({ shape, error }) {
    if (error.code === 'UNAUTHORIZED') {
      return {
        ...shape,
        data: {
          code: 'UNAUTHORIZED',
          httpStatus: 401,
          path: shape.data?.path,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      };
    }
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
      message: 'Not authenticated',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const middleware = t.middleware;