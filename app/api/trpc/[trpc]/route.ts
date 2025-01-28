import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/app/lib/trpc/routers/_app';
import { createContext } from '@/app/lib/trpc/context';

async function handler(req: Request) {
  try {
    const response = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req,
      router: appRouter,
      createContext: () => createContext({ req }),
      onError({ error, path }) {
        console.error(`Error in TRPC handler [${path}]:`, error);
      },
    });

    // Ensure proper content-type header
    if (!response.headers.has('content-type')) {
      response.headers.set('content-type', 'application/json');
    }

    return response;
  } catch (error) {
    console.error('TRPC handler error:', error);
    return new Response(
      JSON.stringify({
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}

export const GET = handler;
export const POST = handler;

export const runtime = 'nodejs';