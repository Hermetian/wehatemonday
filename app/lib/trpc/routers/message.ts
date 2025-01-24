import { z } from 'zod';
import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { UserRole } from '@prisma/client';
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
        const ticket = await ctx.prisma.ticket.findUnique({
          where: { id: input.ticketId },
          select: { customerId: true },
        });

        if (!ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Get the user's role
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Only allow internal messages from staff
        if (input.isInternal && user.role === UserRole.CUSTOMER) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only staff can create internal messages',
          });
        }

        // Customers can only message their own tickets
        if (user.role === UserRole.CUSTOMER && ticket.customerId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only message your own tickets',
          });
        }

        const message = await ctx.prisma.message.create({
          data: {
            content: input.content,
            contentHtml: input.contentHtml,
            ticketId: input.ticketId,
            isInternal: input.isInternal ?? false,
          },
        });

        // Update ticket's updatedAt
        await ctx.prisma.ticket.update({
          where: { id: input.ticketId },
          data: { updatedAt: new Date() },
        });

        // Create audit log
        await createAuditLog({
          action: 'CREATE',
          entity: 'MESSAGE',
          entityId: message.id,
          userId: ctx.user.id,
          oldData: null,
          newData: message,
          prisma: ctx.prisma,
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
    .query(async ({ input, ctx }) => {
      try {
        // Check if the ticket exists and if the user has access to it
        const ticket = await ctx.prisma.ticket.findUnique({
          where: { id: input.ticketId },
          select: { customerId: true },
        });

        if (!ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Get the user's role
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Customers can only view messages from their own tickets
        if (user.role === UserRole.CUSTOMER && ticket.customerId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only view messages from your own tickets',
          });
        }

        // For customers, exclude internal messages
        const messages = await ctx.prisma.message.findMany({
          where: {
            ticketId: input.ticketId,
            ...(user.role === UserRole.CUSTOMER
              ? { isInternal: false }
              : {}),
          },
          orderBy: { createdAt: 'asc' },
        });

        return messages;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch messages',
          cause: error,
        });
      }
    }),
}); 