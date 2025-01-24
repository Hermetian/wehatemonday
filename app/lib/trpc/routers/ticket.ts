import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { UserRole, Ticket } from '@prisma/client';
import { createAuditLog } from '@/app/lib/utils/audit-logger';

const STAFF_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT] as const;
const ASSIGNMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

// Define the return type for tickets
interface TicketWithRelations extends Ticket {
  createdBy: {
    name: string | null;
    email: string | null;
  };
  assignedTo: {
    name: string | null;
    email: string | null;
  } | null;
  lastUpdatedBy: {
    name: string | null;
    email: string | null;
  };
  messageCount: number;
}

export const ticketRouter = router({
  create: protectedProcedure 
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string(),
        descriptionHtml: z.string(),
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
        showCompleted: z.boolean().optional().default(false),
        sortConfig: z.array(z.object({
          field: z.enum(['assignedToMe', 'priority', 'updatedAt']),
          direction: z.enum(['asc', 'desc'])
        })).default([
          { field: 'assignedToMe', direction: 'desc' },
          { field: 'priority', direction: 'desc' },
          { field: 'updatedAt', direction: 'desc' }
        ]),
        tags: z.array(z.string()).optional(),
        includeUntagged: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }): Promise<{ tickets: TicketWithRelations[]; nextCursor?: string }> => {
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

        // Define the where clause based on user role and filters
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
          // Hide completed tickets unless explicitly requested
          ...(!input.showCompleted
            ? {
                NOT: {
                  status: {
                    in: [TicketStatus.CLOSED, TicketStatus.RESOLVED],
                  },
                },
              }
            : {}),
          // Handle tag filtering
          ...(input.tags?.length || input.includeUntagged
            ? {
                OR: [
                  ...(input.tags?.length ? [{ tags: { hasSome: input.tags } }] : []),
                  ...(input.includeUntagged ? [{ tags: { isEmpty: true } }] : []),
                ],
              }
            : {}),
        };

        // Get tickets with sorting
        const ticketsWithAuditLogs = await ctx.prisma.ticket.findMany({
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where,
          orderBy: [
            // We'll handle assignedToMe in memory
            { priority: 'desc' },
            { updatedAt: 'desc' },
          ],
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
            messages: {
              select: {
                id: true,
                isInternal: true,
              },
              where: user.role === UserRole.CUSTOMER ? { isInternal: false } : {},
            },
            _count: {
              select: {
                messages: true,
              },
            },
          },
        });

        // Get the last audit log for each ticket
        const ticketIds = ticketsWithAuditLogs.map(ticket => ticket.id);
        const lastAuditLogs = await ctx.prisma.auditLog.findMany({
          where: {
            entity: 'TICKET',
            entityId: { in: ticketIds },
            action: 'UPDATE',
          },
          orderBy: {
            timestamp: 'desc',
          },
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          distinct: ['entityId'],
        });

        // Create a map of ticket ID to last updater
        const lastUpdaterMap = new Map(
          lastAuditLogs.map(log => [log.entityId, log.user])
        );

        let nextCursor: typeof cursor | undefined = undefined;
        if (ticketsWithAuditLogs.length > limit) {
          const nextItem = ticketsWithAuditLogs.pop();
          nextCursor = nextItem!.id;
        }

        let tickets = ticketsWithAuditLogs.map(ticket => ({
          ...ticket,
          lastUpdatedBy: lastUpdaterMap.get(ticket.id) || ticket.createdBy,
          messageCount: ticket.messages.length,
        }));

        // Apply sorting based on sortConfig
        tickets = tickets.sort((a, b) => {
          for (const { field, direction } of input.sortConfig) {
            let comparison = 0;
            
            switch (field) {
              case 'assignedToMe':
                const aAssignedToMe = a.assignedToId === ctx.user.id;
                const bAssignedToMe = b.assignedToId === ctx.user.id;
                comparison = Number(bAssignedToMe) - Number(aAssignedToMe);
                break;
              
              case 'priority':
                const priorityOrder: Record<TicketPriority, number> = {
                  [TicketPriority.URGENT]: 3,
                  [TicketPriority.HIGH]: 2,
                  [TicketPriority.MEDIUM]: 1,
                  [TicketPriority.LOW]: 0,
                };
                comparison = priorityOrder[b.priority as TicketPriority] - priorityOrder[a.priority as TicketPriority];
                break;
              
              case 'updatedAt':
                comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                break;
            }

            if (comparison !== 0) {
              return direction === 'desc' ? comparison : -comparison;
            }
          }
          return 0;
        });

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
        title: z.string().optional(),
        description: z.string().optional(),
        descriptionHtml: z.string().optional(),
        status: z.nativeEnum(TicketStatus).optional(),
        priority: z.nativeEnum(TicketPriority).optional(),
        assignedToId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
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

        // Get the current ticket state
        const currentTicket = await ctx.prisma.ticket.findUnique({
          where: { id: input.id },
          select: {
            customerId: true,
            assignedToId: true,
            title: true,
            description: true,
            descriptionHtml: true,
            status: true,
            priority: true,
            tags: true,
          },
        });

        if (!currentTicket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        // Check permissions
        const canEditAll = STAFF_ROLES.includes(user.role as typeof STAFF_ROLES[number]);
        const canAssign = ASSIGNMENT_ROLES.includes(user.role as typeof ASSIGNMENT_ROLES[number]);
        const isCustomer = user.role === UserRole.CUSTOMER;

        // Customers can only update their own tickets
        if (isCustomer && currentTicket.customerId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only update your own tickets',
          });
        }

        // Validate update permissions
        if (!canEditAll) {
          // Customers can only update description
          if (isCustomer) {
            const allowedUpdates = ['description', 'descriptionHtml'];
            const attemptedUpdates = Object.keys(input).filter(key => key !== 'id');
            const hasDisallowedUpdates = attemptedUpdates.some(update => !allowedUpdates.includes(update));

            if (hasDisallowedUpdates) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'You can only update the description',
              });
            }
          }

          // Non-admin staff can't update certain fields
          if (!canAssign && input.assignedToId !== undefined) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to assign tickets',
            });
          }
        }

        // Update the ticket
        const ticket = await ctx.prisma.ticket.update({
          where: { id: input.id },
          data: {
            ...input,
            updatedAt: new Date(),
          },
        });

        // Create audit log
        await createAuditLog({
          action: 'UPDATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ctx.user.id,
          oldData: currentTicket,
          newData: ticket,
          prisma: ctx.prisma,
        });

        return ticket;
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