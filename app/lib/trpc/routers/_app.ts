import { router } from '@/app/lib/trpc/trpc';
import { messageRouter } from './message';
import { ticketRouter } from './ticket';
import { userRouter } from './user';

export const appRouter = router({
  ticket: ticketRouter,
  user: userRouter,
  message: messageRouter,
});

export type AppRouter = typeof appRouter; 