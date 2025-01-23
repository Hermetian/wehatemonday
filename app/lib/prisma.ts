import { PrismaClient } from '@prisma/client';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';

// Configure Neon for Edge Runtime
if (process.env.NEXT_RUNTIME === 'edge') {
  neonConfig.webSocketConstructor = ws;
}

// Initialize the connection pool
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });

// Create Prisma Client with Neon adapter and logging
const prismaClientSingleton = () => {
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({
    // @ts-expect-error - Prisma doesn't have types for the adapter yet
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

declare global {
  var prisma: PrismaClientSingleton | undefined;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma; 