import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
//import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '../../types';
import { UserRole } from '@prisma/client';

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

        // Get the user's role from the database
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true }
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Define the where clause based on user role
        const where = {
          ...(user.role === UserRole.CUSTOMER
            ? { customerId: ctx.user.id }
            : user.role === UserRole.AGENT
            ? {} // Agents can see all tickets
            : user.role === UserRole.MANAGER
            ? {} // Managers can see all tickets
            : user.role === UserRole.ADMIN
            ? {} // Admins can see all tickets
            : { customerId: ctx.user.id }), // Default to only seeing own tickets
          // Add filterByUser if provided and user has permission
          ...(input.filterByUser && (user.role !== UserRole.CUSTOMER)
            ? { customerId: input.filterByUser }
            : {}),
        };

        const tickets = await ctx.prisma.ticket.findMany({
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            assignedTo: {
              select: {
                name: true,
                email: true,
              },
            },
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