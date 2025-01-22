import { router } from '../trpc';
import { ticketRouter } from './ticket';
import { userRouter } from './user';
import { messageRouter } from './message';

export const appRouter = router({
  ticket: ticketRouter,
  user: userRouter,
  message: messageRouter,
});

export type AppRouter = typeof appRouter; 