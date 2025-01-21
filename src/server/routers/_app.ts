import { router } from '../trpc';
import { ticketRouter } from './ticket';
import { userRouter } from './user';

export const appRouter = router({
  ticket: ticketRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter; 