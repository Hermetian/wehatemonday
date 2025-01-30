import { router } from '@/app/lib/trpc/trpc';
import { messageRouter } from './message';
import { ticketRouter } from './ticket';
import { userRouter } from './user';
import { teamRouter } from './team';
import { marketplaceRouter } from './marketplace';

export const appRouter = router({
  ticket: ticketRouter,
  user: userRouter,
  message: messageRouter,
  team: teamRouter,
  marketplace: marketplaceRouter,
});

export type AppRouter = typeof appRouter;