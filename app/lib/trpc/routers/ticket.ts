import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { Role} from '@/app/types/auth';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { invalidateTicketCache, invalidateTicketDetail } from '@/app/lib/utils/cache-helpers';

// Role constants
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'AGENT'] as const;
type StaffRole = typeof STAFF_ROLES[number];

function isStaffRole(role: Role): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

const ASSIGNABLE_ROLES = STAFF_ROLES.filter(isStaffRole);

// Define the return type for tickets
/*
interface TicketWithRelations {
  id: string;
  title: string;
  description: string;
  description_html: string;
  status: TicketStatus;
  priority: TicketPriority;
  customer_id: string;
  assigned_to_id: string | null;
  created_by_id: string;
  tags: string[];
  created_by: {
    name: string | null;
    email: string | null;
  };
  assigned_to: {
    name: string | null;
    email: string | null;
  } | null;
  last_updated_by: {
    name: string | null;
    email: string | null;
  };
  message_count: number;
  created_at: string;
  updated_at: string;
}
*/
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
        description_html: z.string(),
        priority: z.nativeEnum(TicketPriority),
        customer_id: z.string(),
        created_by_id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify the user is creating a ticket for themselves
        if (input.customer_id !== ctx.user.id) {
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
      assigned_to_id: z.string().optional(),
      team_id: z.string().optional(),
      customer_id: z.string().optional(),
      sort_by: z.enum(['priority', 'created_at', 'updated_at']).default('created_at'),
      sort_order: z.enum(['asc', 'desc']).default('desc'),
      show_completed: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      include_untagged: z.boolean().optional(),
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

        if (input.show_completed === false) {
          query = query.neq('status', TicketStatus.CLOSED);
        }

        if (input.priority?.length) {
          query = query.in('priority', input.priority);
        }

        if (input.assigned_to_id) {
          query = query.eq('assigned_to_id', input.assigned_to_id);
        }

        if (input.customer_id) {
          query = query.eq('created_by_id', input.customer_id);
        }

        if (input.tags?.length) {
          query = query.overlaps('tags', input.tags);
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
          .limit(input.limit + 1);

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
            next_cursor: undefined
          };
        }

        // Check if we have a next page
        let next_cursor: string | undefined;
        if (tickets.length > input.limit) {
          const nextItem = tickets.pop(); // Remove the extra item
          next_cursor = nextItem?.id;
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
            tickets: tickets.map((ticket) => ({
              ...ticket,
              message_count: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
            })),
            next_cursor
          };
        }

        // Create map of ticket ID to last updater
        const lastUpdaterMap = new Map<string, { name: string | null; email: string | null; }>();
        
        if (auditLogs) {
          // Group audit logs by entity_id to get the latest for each ticket
          const latestAuditLogs = auditLogs.reduce<Record<string, {
            entity_id: string;
            user_id: string;
            timestamp: string;
          }>>((acc, log) => {
            if (!acc[log.entity_id] || new Date(log.timestamp) > new Date(acc[log.entity_id].timestamp)) {
              acc[log.entity_id] = log;
            }
            return acc;
          }, {});

          // Fetch all unique user IDs at once
          const userIds = [...new Set(Object.values(latestAuditLogs).map(log => log.user_id))];
          const { data: users } = await ctx.supabase
            .from('users')
            .select('id, name, email')
            .in('id', userIds);

          if (users) {
            const userMap = new Map(users.map(user => [user.id, user]));
            
            // Map users to tickets
            for (const [ticketId, log] of Object.entries(latestAuditLogs)) {
              const user = userMap.get(log.user_id);
              if (user) {
                lastUpdaterMap.set(ticketId, {
                  name: user.name,
                  email: user.email
                });
              }
            }
          }
        }

        // Sort tickets if needed
        if (input.sort_by === 'priority') {
          tickets.sort((a, b) => {
            const orderA = priorityOrder[a.priority as TicketPriority] ?? 999;
            const orderB = priorityOrder[b.priority as TicketPriority] ?? 999;
            return input.sort_order === 'asc' ? orderA - orderB : orderB - orderA;
          });
        }

        // Return tickets with proper types
        return {
          tickets: tickets.map((ticket) => ({
            ...ticket,
            message_count: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
            last_updated_by: lastUpdaterMap.get(ticket.id) || { name: null, email: null }
          })),
          next_cursor
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

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        description_html: z.string().optional(),
        status: z.nativeEnum(TicketStatus).optional(),
        priority: z.nativeEnum(TicketPriority).optional(),
        assigned_to_id: z.string().nullable().optional(),
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

        if (error) {
          console.error('Error updating ticket:', error);
          throw error;
        }
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
        console.error('Error in ticket.update:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update ticket',
          cause: error,
        });
      }
    }),

  getAssignableUsers: protectedProcedure
    .input(
      z.object({
        ticket_id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        // Use type guard to check role
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
          .eq('id', input.ticket_id)
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
            is_customer: false 
          })),
          { ...customer, is_customer: true },
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

  getAllTags: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const { data: tickets, error } = await ctx.supabase
          .from('tickets')
          .select('tags');

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch ticket tags',
            cause: error,
          });
        }

        // Get unique tags from all tickets
        const tagSet = new Set<string>();
        tickets?.forEach(ticket => {
          if (Array.isArray(ticket.tags)) {
            ticket.tags.forEach(tag => tag && tagSet.add(tag));
          }
        });

        return Array.from(tagSet).sort();
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch ticket tags',
          cause: error,
        });
      }
    }),
});