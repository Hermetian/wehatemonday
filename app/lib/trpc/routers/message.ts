import { z } from 'zod';
import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { langSmithService } from '@/app/lib/services/langsmith';

export const messageRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        content_html: z.string(),
        ticket_id: z.string(),
        is_internal: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Check if the ticket exists and if the user has access to it
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select('customer_id')
          .eq('id', input.ticket_id)
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
        if (input.is_internal && userRole === 'CUSTOMER') {
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
            content_html: input.content_html,
            ticket_id: input.ticket_id,
            is_internal: input.is_internal ?? false,
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
        ticket_id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        // Check if the ticket exists and if the user has access to it
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select('customer_id')
          .eq('id', input.ticket_id)
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
          .eq('ticket_id', input.ticket_id)
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

        // Return messages with snake_case fields
        return messages || [];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch messages',
          cause: error,
        });
      }
    }),

  getSuggestion: protectedProcedure
    .input(z.object({
      ticket_id: z.string(),
      should_create_message: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Get ticket and messages
        const [ticketResult, messagesResult] = await Promise.all([
          ctx.supabase
            .from('tickets')
            .select('*')
            .eq('id', input.ticket_id)
            .single(),
          ctx.supabase
            .from('messages')
            .select('*')
            .eq('ticket_id', input.ticket_id)
            .order('created_at', { ascending: true })
        ]);

        if (ticketResult.error) throw ticketResult.error;
        if (messagesResult.error) throw messagesResult.error;

        const ticket = ticketResult.data;
        const messages = messagesResult.data;

        // Get marketplace conversation if it exists
        const { data: marketplaceConversation } = await ctx.supabase
          .from('marketplace_conversations')
          .select('raw_content, processed_content')
          .eq('ticket_id', input.ticket_id)
          .single();

        // Generate suggestion using LangSmith
        const suggestion = await langSmithService.generateMessageSuggestion({
          ticket,
          messages,
          marketplaceConversation
        });

        if (input.should_create_message) {
          // Create an internal message with the suggestion
          const formattedSuggestion = `***SUGGESTED RESPONSE***\n${suggestion}`;
          const { error: createError } = await ctx.supabase
            .from('messages')
            .insert({
              content: formattedSuggestion,
              content_html: formattedSuggestion.replace(/\n/g, '<br>'),
              ticket_id: input.ticket_id,
              is_internal: true,
              created_by_id: ctx.user.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (createError) {
            console.error('Error creating suggestion message:', createError);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create suggestion message',
              cause: createError,
            });
          }
        }

        // Return just the suggestion string
        return suggestion;
      } catch (error) {
        console.error('Error getting message suggestion:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get message suggestion',
          cause: error,
        });
      }
    }),
}); 