import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
//import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '../../types';
import { UserRole } from '@prisma/client';
import { createAuditLog } from '../../lib/audit-logger';

const STAFF_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT] as const;
const ASSIGNMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

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

        const ticket = await ctx.prisma.ticket.create({
          data: {
            ...input,
            status: TicketStatus.OPEN,
            createdBy: {
              connect: { id: input.createdBy },
            },
          },
        });

        // Create audit log
        await createAuditLog({
          action: 'CREATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ctx.user.id,
          oldData: null,
          newData: ticket,
          prisma: ctx.prisma,
        });

        return ticket;
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.nativeEnum(TicketStatus).optional(),
        priority: z.nativeEnum(TicketPriority).optional(),
        assignedToId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Get the user's role
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true }
        });

        if (!user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User not found',
          });
        }

        // Get the current ticket for audit logging
        const existingTicket = await ctx.prisma.ticket.findUnique({
          where: { id: input.id },
          include: { createdBy: true }
        });

        if (!existingTicket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Check permissions
        const canEditAll = STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number]);
        const isTicketOwner = existingTicket.createdById === ctx.user.id;

        // If user is not authorized to edit all fields and trying to edit restricted fields
        if (!canEditAll && (input.title || input.status || input.priority || input.assignedToId || input.tags)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to edit these fields',
          });
        }

        // If trying to edit description, must be owner or have elevated permissions
        if (input.description && !canEditAll && !isTicketOwner) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to edit the description',
          });
        }

        // If trying to assign, must be admin or manager
        if (input.assignedToId && !ASSIGNMENT_ROLES.includes(user.role as typeof ASSIGNMENT_ROLES[number])) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins and managers can assign tickets',
          });
        }

        const updatedTicket = await ctx.prisma.ticket.update({
          where: { id: input.id },
          data: {
            ...(input.title && { title: input.title }),
            ...(input.description && { description: input.description }),
            ...(input.status && { status: input.status }),
            ...(input.priority && { priority: input.priority }),
            ...(input.assignedToId && { 
              assignedTo: { connect: { id: input.assignedToId } }
            }),
            ...(input.tags && { tags: input.tags }),
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

        // Create audit log
        await createAuditLog({
          action: 'UPDATE',
          entity: 'TICKET',
          entityId: input.id,
          userId: ctx.user.id,
          oldData: existingTicket,
          newData: updatedTicket,
          prisma: ctx.prisma,
        });

        return updatedTicket;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update ticket',
          cause: error,
        });
      }
    }),

  getStaffUsers: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.user.id },
          select: { role: true }
        });

        if (!user || !ASSIGNMENT_ROLES.includes(user.role as typeof ASSIGNMENT_ROLES[number])) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins and managers can view staff users',
          });
        }

        return await ctx.prisma.user.findMany({
          where: {
            role: {
              in: [...STAFF_ROLES] // Convert to regular array for Prisma
            }
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
          orderBy: {
            name: 'asc',
          },
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch staff users',
          cause: error,
        });
      }
    }),
}); 