import { router } from '../trpc';
import { ticketRouter } from './ticket';

export const appRouter = router({
  ticket: ticketRouter,
});

export type AppRouter = typeof appRouter; 