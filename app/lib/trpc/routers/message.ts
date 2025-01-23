import { z } from 'zod';
import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { UserRole } from '@prisma/client';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

const STAFF_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT] as const;

export const messageRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        ticketId: z.string(),
        isInternal: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Get the user's role and the ticket
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true }
        });

        const ticket = await ctx.prisma.ticket.findUnique({
          where: { id: input.ticketId },
          select: { customerId: true }
        });

        if (!user || !ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User or ticket not found',
          });
        }

        // Only staff can create internal messages
        if (input.isInternal && !STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number])) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only staff can create internal messages',
          });
        }

        // Customers can only add messages to their own tickets
        if (user.role === UserRole.CUSTOMER && ticket.customerId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only add messages to your own tickets',
          });
        }

        const message = await ctx.prisma.message.create({
          data: {
            content: input.content,
            ticketId: input.ticketId,
            isInternal: input.isInternal,
          },
        });

        // Create audit log
        await createAuditLog({
          action: 'CREATE',
          entity: 'TICKET',
          entityId: input.ticketId,
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
        // Get the user's role and the ticket
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true }
        });

        const ticket = await ctx.prisma.ticket.findUnique({
          where: { id: input.ticketId },
          select: { customerId: true }
        });

        if (!user || !ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User or ticket not found',
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
        const where = {
          ticketId: input.ticketId,
          ...(user.role === UserRole.CUSTOMER ? { isInternal: false } : {}),
        };

        const messages = await ctx.prisma.message.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
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