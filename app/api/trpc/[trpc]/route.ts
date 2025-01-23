import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/app/lib/trpc/routers/_app';
import { createContext } from '@/app/lib/trpc/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };

export const runtime = 'edge'; 