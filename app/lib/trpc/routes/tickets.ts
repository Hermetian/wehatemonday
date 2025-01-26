import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const ticketRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string(),
        priority: z.string(),
        customerId: z.string(),
        tags: z.array(z.string()),
        descriptionHtml: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;
      
      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({
          title: input.title,
          description: input.description,
          priority: input.priority,
          customer_id: input.customerId,
          created_by_id: user.id,
          tags: input.tags,
          description_html: input.descriptionHtml,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }

      return ticket;
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(10),
        cursor: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      
      let query = supabase
        .from('tickets')
        .select('*, assigned_to:users!assigned_to_id(*), created_by:users!created_by_id(*)', { count: 'exact' });

      if (input.status) {
        query = query.eq('status', input.status);
      }

      const { data: tickets, error, count } = await query
        .range(input.cursor, input.cursor + input.limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }

      return {
        tickets,
        nextCursor: count && input.cursor + input.limit < count ? input.cursor + input.limit : null,
      };
    }),
});
