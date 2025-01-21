import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
//import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '../../types';

export const ticketRouter = router({
  create: protectedProcedure 
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string(),
        priority: z.nativeEnum(TicketPriority),
        customerId: z.string(),
        createdBy: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify the user is creating a ticket for themselves
        if (input.customerId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only create tickets for yourself',
          });
        }

        return await ctx.prisma.ticket.create({
          data: {
            ...input,
            status: TicketStatus.OPEN,
            createdBy: {
              connect: { id: input.createdBy },
            },
          },
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create ticket',
          cause: error,
        });
      }
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
        filterByUser: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }): Promise<{ tickets: any[]; nextCursor?: string }> => {
      try {
        const limit = input.limit ?? 50;
        const cursor = input.cursor;

        // If filterByUser is provided, verify the user has access
        if (input.filterByUser && input.filterByUser !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only view your own tickets',
          });
        }

        const tickets = await ctx.prisma.ticket.findMany({
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where: {
            customerId: input.filterByUser ?? ctx.user.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        let nextCursor: typeof cursor | undefined = undefined;
        if (tickets.length > limit) {
          const nextItem = tickets.pop();
          nextCursor = nextItem!.id;
        }

        return {
          tickets,
          nextCursor,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tickets',
          cause: error,
        });
      }
    }),
}); 