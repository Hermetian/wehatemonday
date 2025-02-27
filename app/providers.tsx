'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/app/lib/auth/AuthContext';
import { trpc } from '@/app/lib/trpc/client';
import { getTRPCClient } from '@/app/lib/trpc/client';
import { ThemeProvider } from 'next-themes';

function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5000,
        onError: (error) => {
          console.error('Query error:', error);
        },
      },
      mutations: {
        onError: (error) => {
          console.error('Mutation error:', error);
        },
      },
    },
  }));

  const [trpcClient] = useState(() => trpc.createClient(getTRPCClient()));

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <TrpcProvider>
          {children}
        </TrpcProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}