import { z } from 'zod';
import { publicProcedure, router, protectedProcedure } from '../trpc';
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

  getById: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { data: conversation, error } = await ctx.supabase
        .from('marketplace_conversations')
        .select('*')
        .eq('id', input.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
          cause: error,
        });
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

  provideFeedback: protectedProcedure
    .input(z.object({
      runId: z.string(),
      originalProcessed: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        status: z.string(),
        tags: z.array(z.string()),
        created_by_id: z.string()
      }),
      finalTicket: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        status: z.string(),
        tags: z.array(z.string()),
        created_by_id: z.string()
      }),
      feedbackText: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      return langSmithService.provideConversationFeedback(input);
    }),

  updateTicketId: publicProcedure
    .input(z.object({
      id: z.string(),
      ticketId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Must be logged in to update marketplace conversation',
        });
      }

      console.log('Updating marketplace conversation:', input);

      const { data, error } = await ctx.supabase
        .from('marketplace_conversations')
        .update({ ticket_id: input.ticketId })
        .eq('id', input.id)
        .eq('created_by_id', ctx.user.id)
        .select()
        .single();

      if (error) {
        console.error('Failed to update marketplace conversation:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update marketplace conversation',
          cause: error,
        });
      }

      console.log('Updated marketplace conversation:', data);
      return { success: true, data };
    }),
});
