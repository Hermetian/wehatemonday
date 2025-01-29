import { z } from 'zod';
import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

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

        // Get the user's role from context
        const userRole = ctx.user.role;

        // Only allow internal messages from staff
        if (input.isInternal && userRole === 'CUSTOMER') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only staff can create internal messages',
          });
        }

        // Customers can only message their own tickets
        if (userRole === 'CUSTOMER' && ticket.customer_id !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only message your own tickets',
          });
        }

        // Create the message
        const { data: message, error: messageError } = await ctx.supabase
          .from('messages')
          .insert([{
            content: input.content,
            content_html: input.contentHtml,
            ticket_id: input.ticketId,
            is_internal: input.isInternal ?? false,
            created_by_id: ctx.user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (messageError) {
          console.error('Error creating message:', messageError);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create message',
            cause: messageError,
          });
        }

        if (!message) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create message - no message returned',
          });
        }

        // Create audit log
        await createAuditLog({
          action: 'CREATE',
          entity: 'MESSAGE',
          entityId: message.id,
          userId: ctx.user.id,
          oldData: null,
          newData: message,
          supabase: ctx.supabase
        });

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
      })
    )
    .query(async ({ ctx, input }) => {
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

        // Get the user's role from context
        const userRole = ctx.user.role;

        // Customers can only view messages from their own tickets
        if (userRole === 'CUSTOMER' && ticket.customer_id !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only view messages from your own tickets',
          });
        }

        // For customers, exclude internal messages
        const query = ctx.supabase
          .from('messages')
          .select('*')
          .eq('ticket_id', input.ticketId)
          .order('created_at', { ascending: true });

        // Add internal message filter for customers
        if (userRole === 'CUSTOMER') {
          query.eq('is_internal', false);
        }

        const { data: messages, error: messagesError } = await query;

        if (messagesError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch messages',
          });
        }

        // Transform the messages to camelCase and proper types
        return (messages || []).map(message => ({
          id: message.id,
          content: message.content,
          contentHtml: message.content_html,
          ticketId: message.ticket_id,
          isInternal: message.is_internal,
          createdAt: new Date(message.created_at).toISOString(),
          updatedAt: new Date(message.updated_at).toISOString()
        }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch messages',
          cause: error,
        });
      }
    })
}); 