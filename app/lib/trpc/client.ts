import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';
import { transformer } from '@/app/lib/trpc/transformer';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  console.log('Setting TRPC access token:', token ? 'present' : 'null');
  accessToken = token;
}

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return {
    links: [
      httpBatchLink({
        url: '/api/trpc',
        headers() {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            console.log('Adding auth token to TRPC request');
          } else {
            console.log('No auth token available for TRPC request');
          }

          return headers;
        },
        fetch(url, options) {
          console.log('Making TRPC request:', { url, method: options?.method });
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
    transformer,
  };
}