import { z } from 'zod';
import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { UserClade } from '@/lib/supabase/types';

export const messageRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        contentHtml: z.string(),
        ticketId: z.string(),
        isInternal: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Check if the ticket exists and if the user has access to it
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select('customer_id')
          .eq('id', input.ticketId)
          .single();

        if (ticketError || !ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Get the user's clade
        const { data: user, error: userError } = await ctx.supabase
          .from('users')
          .select('clade')
          .eq('id', ctx.user.id)
          .single();

        if (userError || !user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Only allow internal messages from staff
        if (input.isInternal && user.clade === UserClade.CUSTOMER) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only staff can create internal messages',
          });
        }

        // Customers can only message their own tickets
        if (user.clade === UserClade.CUSTOMER && ticket.customer_id !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only message your own tickets',
          });
        }

        // Create message
        const { data: message, error: messageError } = await ctx.supabase
          .from('messages')
          .insert({
            content: input.content,
            content_html: input.contentHtml,
            ticket_id: input.ticketId,
            is_internal: input.isInternal ?? false,
          })
          .select()
          .single();

        if (messageError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: messageError.message,
          });
        }

        // Update ticket's updated_at
        const { error: updateError } = await ctx.supabase
          .from('tickets')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', input.ticketId);

        if (updateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: updateError.message,
          });
        }

        // Create audit log
        const { error: auditError } = await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'CREATE',
            entity: 'MESSAGE',
            entity_id: message.id,
            user_id: ctx.user.id,
            old_data: null,
            new_data: message,
          });

        if (auditError) {
          console.error('Failed to create audit log:', auditError);
        }

        return message;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create message',
          cause: error,
        });
      }
    }),

  list: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        // Check if the ticket exists and if the user has access to it
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select('customer_id')
          .eq('id', input.ticketId)
          .single();

        if (ticketError || !ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Get the user's clade
        const { data: user, error: userError } = await ctx.supabase
          .from('users')
          .select('clade')
          .eq('id', ctx.user.id)
          .single();

        if (userError || !user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Customers can only view their own tickets' messages
        if (user.clade === UserClade.CUSTOMER && ticket.customer_id !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only view messages from your own tickets',
          });
        }

        // Query messages
        let query = ctx.supabase
          .from('messages')
          .select('*', { count: 'exact' })
          .eq('ticket_id', input.ticketId)
          .order('created_at', { ascending: false });

        // Hide internal messages from customers
        if (user.clade === UserClade.CUSTOMER) {
          query = query.eq('is_internal', false);
        }

        if (input.cursor) {
          query = query.range(input.cursor, input.cursor + (input.limit || 50) - 1);
        } else {
          query = query.limit(input.limit || 50);
        }

        const { data: messages, error: messagesError, count } = await query;

        if (messagesError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: messagesError.message,
          });
        }

        return {
          messages,
          nextCursor: count && messages.length === (input.limit || 50) ? (input.cursor || 0) + messages.length : null,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list messages',
          cause: error,
        });
      }
    }),
});