import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { langSmithService } from '@/app/lib/services/langsmith';
import { TRPCError } from '@trpc/server';

export const marketplaceRouter = router({
  create: publicProcedure
    .input(z.object({
      rawContent: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Must be logged in to create marketplace conversation',
        });
      }

      const { data: conversation, error } = await ctx.supabase
        .from('marketplace_conversations')
        .insert({
          raw_content: input.rawContent,
          created_by_id: ctx.user.id,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return conversation;
    }),

  process: publicProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ input }) => {
      return langSmithService.processConversation(input.id);
    }),
});
