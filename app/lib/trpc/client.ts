import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/app/lib/trpc/routers/_app';
import { transformer } from '@/app/lib/trpc/transformer';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
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
          }
          return headers;
        },
        fetch(url, options: RequestInit = {}) {
          return fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
              ...options.headers,
              'Content-Type': 'application/json',
            },
          });
        },
      }),
    ],
    transformer,
  };
}