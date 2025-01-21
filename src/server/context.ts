//import * as trpc from '@trpc/server';
import { inferAsyncReturnType } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { prisma } from './prisma';
import { supabase } from '../lib/supabase';

export async function createContext({
  req,
  res,
}: CreateNextContextOptions) {
  // Get the session from the request
  const authHeader = req.headers.authorization;
  let user = null;

  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } catch (error) {
      console.error('Error getting user in context:', error);
    }
  }

  return {
    req,
    res,
    prisma,
    user,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>; 