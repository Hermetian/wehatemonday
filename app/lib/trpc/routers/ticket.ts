import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { Role} from '@/app/types/auth';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { withCache, CACHE_KEYS } from '@/app/lib/utils/cache';
import { invalidateTicketCache, invalidateTicketDetail } from '@/app/lib/utils/cache-helpers';

// Role constants
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'AGENT'] as const;
type StaffRole = typeof STAFF_ROLES[number];

function isStaffRole(role: Role): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

const ASSIGNABLE_ROLES = STAFF_ROLES.filter(isStaffRole);

// Define the return type for tickets
interface TicketWithRelations {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string;
  assignedToId: string | null;
  createdById: string;
  tags: string[];
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
  createdAt: string;
  updatedAt: string;
}

// Sorting helpers
const priorityOrder: Record<TicketPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

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

        // Get ticket data from Supabase
        const { data: ticket, error } = await ctx.supabase
          .from('tickets')
          .insert([{
            ...input,
            status: TicketStatus.OPEN,
            created_by_id: input.createdBy,
          }])
          .select()
          .single();

        if (error) throw error;
        if (!ticket) throw new Error('Failed to create ticket');

        // Create audit log
        await createAuditLog({
          action: 'CREATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ctx.user.id,
          oldData: null,
          newData: ticket,
          supabase: ctx.supabase
        });

        // Invalidate ticket list cache
        invalidateTicketCache();

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
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      status: z.array(z.nativeEnum(TicketStatus)).optional(),
      priority: z.array(z.nativeEnum(TicketPriority)).optional(),
      assignedToId: z.string().optional(),
      teamId: z.string().optional(),
      customerId: z.string().optional(),
      sortBy: z.enum(['priority', 'created_at', 'updated_at']).default('created_at'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      showCompleted: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      includeUntagged: z.boolean().optional(),
      cursor: z.string().nullish(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        // Build query
        let query = ctx.supabase
          .from('tickets')
          .select(`
            *,
            created_by:created_by_id(id, name, email),
            assigned_to:assigned_to_id(id, name, email),
            messages(id)
          `);

        // Apply filters
        if (input.status?.length) {
          query = query.in('status', input.status);
        }

        if (input.showCompleted === false) {
          query = query.neq('status', TicketStatus.CLOSED);
        }

        if (input.priority?.length) {
          query = query.in('priority', input.priority);
        }

        if (input.assignedToId) {
          query = query.eq('assigned_to_id', input.assignedToId);
        }

        if (input.customerId) {
          query = query.eq('created_by_id', input.customerId);
        }

        if (input.tags?.length) {
          query = query.contains('tags', input.tags);
        }

        // Apply role-based filtering
        if (!isStaffRole(ctx.user.role)) {
          // Non-staff users can only see their own tickets
          query = query.eq('created_by_id', ctx.user.id);
        }

        // Apply cursor-based pagination
        if (input.cursor) {
          query = query.gt('id', input.cursor);
        }

        // Get tickets with pagination
        const { data: tickets, error } = await query
          .order('id', { ascending: true })
          .limit(input.limit + 1); // Fetch one extra to determine if there's a next page

        if (error) {
          console.error('Error fetching tickets:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch tickets',
            cause: error,
          });
        }

        if (!tickets) {
          return {
            tickets: [],
            nextCursor: undefined
          };
        }

        // Check if we have a next page
        let nextCursor: string | undefined;
        if (tickets.length > input.limit) {
          const nextItem = tickets.pop(); // Remove the extra item
          nextCursor = nextItem?.id;
        }

        // Get last audit logs for tickets
        const ticketIds = tickets.map(t => t.id);
        const { data: auditLogs, error: auditError } = await ctx.supabase
          .from('audit_logs')
          .select('*')
          .in('entity_id', ticketIds)
          .eq('entity', 'TICKET')
          .order('timestamp', { ascending: false });

        if (auditError) {
          console.error('Error fetching audit logs:', auditError);
          // Don't throw error, just proceed without audit logs
          return {
            tickets: tickets.map((ticket) => {
              const ticketData = {
                id: ticket.id,
                title: ticket.title,
                description: ticket.description,
                descriptionHtml: ticket.description_html,
                status: ticket.status,
                priority: ticket.priority,
                customerId: ticket.customer_id,
                assignedToId: ticket.assigned_to_id,
                createdById: ticket.created_by_id,
                tags: Array.isArray(ticket.tags) ? ticket.tags : [],
                createdBy: ticket.created_by ? {
                  name: ticket.created_by.name ?? null,
                  email: ticket.created_by.email ?? null,
                } : null,
                assignedTo: ticket.assigned_to ? {
                  name: ticket.assigned_to.name ?? null,
                  email: ticket.assigned_to.email ?? null,
                } : null,
                lastUpdatedBy: {
                  name: null,
                  email: null,
                },
                messageCount: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
                createdAt: ticket.created_at,
                updatedAt: ticket.updated_at,
              };

              return ticketData;
            }),
            nextCursor
          };
        }

        // Create map of ticket ID to last updater
        const lastUpdaterMap = new Map<string, { name: string | null; email: string | null; }>();
        
        if (auditLogs) {
          for (const log of auditLogs) {
            if (!lastUpdaterMap.has(log.entity_id)) {
              const { data: user } = await ctx.supabase
                .from('users')
                .select('name, email')
                .eq('id', log.user_id)
                .single();
              
              lastUpdaterMap.set(log.entity_id, {
                name: user?.name ?? null,
                email: user?.email ?? null,
              });
            }
          }
        }

        // Sort tickets if needed
        if (input.sortBy === 'priority') {
          tickets.sort((a, b) => {
            const orderA = priorityOrder[a.priority as TicketPriority] ?? 999;
            const orderB = priorityOrder[b.priority as TicketPriority] ?? 999;
            return input.sortOrder === 'asc' ? orderA - orderB : orderB - orderA;
          });
        }

        // Map tickets to response format
        return {
          tickets: tickets.map((ticket) => {
            const ticketData = {
              id: ticket.id,
              title: ticket.title,
              description: ticket.description,
              descriptionHtml: ticket.description_html,
              status: ticket.status,
              priority: ticket.priority,
              customerId: ticket.customer_id,
              assignedToId: ticket.assigned_to_id,
              createdById: ticket.created_by_id,
              tags: Array.isArray(ticket.tags) ? ticket.tags : [],
              createdBy: ticket.created_by ? {
                name: ticket.created_by.name ?? null,
                email: ticket.created_by.email ?? null,
              } : null,
              assignedTo: ticket.assigned_to ? {
                name: ticket.assigned_to.name ?? null,
                email: ticket.assigned_to.email ?? null,
              } : null,
              lastUpdatedBy: lastUpdaterMap.get(ticket.id) ?? {
                name: null,
                email: null,
              },
              messageCount: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
              createdAt: ticket.created_at,
              updatedAt: ticket.updated_at,
            };

            return ticketData;
          }),
          nextCursor
        };
      } catch (error) {
        console.error('Error in ticket.list:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tickets',
          cause: error,
        });
      }
    }),

  byId: protectedProcedure
    .input(z.string())
    .query(async ({ input: ticketId, ctx }) => {
      return withCache(
        `${CACHE_KEYS.TICKET_DETAIL}:${ticketId}`,
        { ticketId },
        async () => {
          const { data: ticket, error } = await ctx.supabase
            .from('tickets')
            .select(`
              *,
              created_by:created_by_id(id, name, email),
              assigned_to:assigned_to_id(id, name, email),
              messages(*)
            `)
            .eq('id', ticketId)
            .single();

          if (error || !ticket) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Ticket not found',
            });
          }

          return {
            ...ticket,
            createdBy: ticket.created_by,
            assignedTo: ticket.assigned_to,
            createdAt: ticket.created_at,
            updatedAt: ticket.updated_at,
            assignedToId: ticket.assigned_to_id,
            createdById: ticket.created_by_id,
          } as TicketWithRelations;
        },
        { revalidate: 30 }
      );
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
        const { id, ...updateData } = input;

        const { data: ticket, error } = await ctx.supabase
          .from('tickets')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!ticket) throw new Error('Failed to update ticket');

        await createAuditLog({
          action: 'UPDATE',
          entity: 'TICKET',
          entityId: ticket.id,
          userId: ctx.user.id,
          oldData: input,
          newData: ticket,
          supabase: ctx.supabase
        });

        // Invalidate both list and detail caches
        invalidateTicketCache();
        invalidateTicketDetail(id);

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
        // Use type guard to check role
        if (!isStaffRole(ctx.user.role)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins and managers can view staff users',
          });
        }

        // Get staff users from Supabase
        const { data: staffUsers, error } = await ctx.supabase
          .from('users')
          .select('id, name, email, role')
          .in('role', STAFF_ROLES)
          .order('name', { ascending: true });

        if (error) throw error;
        if (!staffUsers) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No staff users found',
          });
        }

        return staffUsers;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch staff users',
          cause: error,
        });
      }
    }),

  getAllTags: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // Get tags from tickets and teams
        const [ticketsResult, teamsResult] = await Promise.all([
          ctx.supabase
            .from('tickets')
            .select('tags'),
          ctx.supabase
            .from('teams')
            .select('tags')
        ]);

        // Get unique tags from both sources
        const tagSet = new Set<string>();
        
        // Handle tickets tags
        if (ticketsResult.data) {
          ticketsResult.data.forEach((ticket: { tags: string[] | null }) => {
            if (Array.isArray(ticket.tags)) {
              ticket.tags.forEach(tag => tag && tagSet.add(tag));
            }
          });
        }
        
        // Handle teams tags
        if (teamsResult.data) {
          teamsResult.data.forEach((team: { tags: string[] | null }) => {
            if (Array.isArray(team.tags)) {
              team.tags.forEach(tag => tag && tagSet.add(tag));
            }
          });
        }

        // Always return a sorted array, even if empty
        return Array.from(tagSet).filter(Boolean).sort() as string[];
      } catch (error) {
        console.error('Error in getAllTags:', error);
        // Return empty array instead of throwing
        return [] as string[];
      }
    }),

  getAssignableUsers: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        // Use type guard to check role from context
        if (!isStaffRole(ctx.user.role)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to assign tickets',
            });
          }

        // Get ticket and customer data in sequence to avoid undefined ticket
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

        // Get staff users and customer
        const [{ data: staffUsers }, { data: customer }] = await Promise.all([
          ctx.supabase
            .from('users')
            .select('id, name, email, role')
            .in('role', ASSIGNABLE_ROLES)
            .order('role', { ascending: true })
            .order('name', { ascending: true }),
          ctx.supabase
            .from('users')
            .select('id, name, email, role')
            .eq('id', ticket.customer_id)
            .single()
        ]);

        if (!staffUsers || !customer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
            message: 'Required data not found',
          });
        }

        // Combine staff users and customer, marking the customer
        return [
          ...staffUsers.map((user: { id: string; name: string | null; email: string | null; role: Role }) => ({ 
            ...user, 
            isCustomer: false 
          })),
          { ...customer, isCustomer: true },
        ];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get assignable users',
          cause: error,
        });
      }
    }),
}); 