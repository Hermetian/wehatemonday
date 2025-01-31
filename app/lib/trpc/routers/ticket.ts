import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { Role} from '@/app/types/auth';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { invalidateTicketCache, invalidateTicketDetail } from '@/app/lib/utils/cache-helpers';
import { createAdminClient } from '@/app/lib/auth/supabase';

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

        // Use the admin client
        const adminClient = createAdminClient();

        // Get ticket data from Supabase
        const { data: ticket, error } = await adminClient
          .from('tickets')
          .insert([{
            ...input,
            status: TicketStatus.OPEN,
            last_updated_by_id: ctx.user.id,
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
          supabase: adminClient
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
      tags: z.array(z.string()).default([]),
      include_untagged: z.boolean().default(false),
      assigned_to_me: z.boolean().default(false),
      cursor: z.string().nullish(),
      sort_criteria: z.array(z.object({
        field: z.enum(['priority', 'updated_at']),
        order: z.enum(['asc', 'desc'])
      })).default([{ field: 'priority', order: 'desc' }, { field: 'updated_at', order: 'desc' }]),
      show_completed: z.boolean().default(false)
    }))
    .query(async ({ ctx, input }) => {
      try {
        // Use regular client to respect RLS
        const query = ctx.supabase
          .from('tickets')
          .select(`
            *,
            created_by:created_by_id(id, name, email),
            assigned_to:assigned_to_id(id, name, email),
            last_updated_by:last_updated_by_id(id, name, email),
            messages(id)
          `);

        // Apply filters
        if (!input.show_completed) {
          query.neq('status', 'CLOSED');
        }
        
        if (input.status && input.status.length > 0) {
          query.in('status', input.status);
        }

        if (input.priority && input.priority.length > 0) {
          query.in('priority', input.priority);
        }

        if (input.assigned_to_me) {
          query.eq('assigned_to_id', ctx.user.id);
        }

        if (input.tags.length > 0) {
          query.overlaps('tags', input.tags);
        } else if (!input.include_untagged) {
          query.not('tags', 'is', null)
            .not('tags', 'eq', '{}');
        }

        // Apply sorting
        for (const criteria of input.sort_criteria) {
          const isAscending = criteria.order === 'asc';
          
          switch (criteria.field) {
            case 'priority':
              // Sort by priority (using enum ordering: URGENT > HIGH > MEDIUM > LOW)
              query.order('priority', {
                ascending: isAscending,
                nullsFirst: false
              });
              break;
            
            case 'updated_at':
              // Sort by last update time
              query.order('updated_at', {
                ascending: isAscending,
                nullsFirst: false
              });
              break;
          }
        }

        // Always include ID as final sort for stability
        query.order('id', { ascending: false });

        // Apply cursor-based pagination if cursor exists
        if (input.cursor) {
          const [timestamp, id] = input.cursor.split('_');
          const lastCriteria = input.sort_criteria[input.sort_criteria.length - 1];
          const isAscending = lastCriteria.order === 'asc';
          
          if (lastCriteria.field === 'updated_at') {
            query.or(`or(updated_at.${isAscending ? 'gt' : 'lt'}.${timestamp},and(updated_at.eq.${timestamp},id.${isAscending ? 'gt' : 'lt'}.${id}))`);
          }
        }

        // Get one more than limit for cursor
        query.limit(input.limit + 1);

        const { data: tickets, error } = await query;

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch tickets',
            cause: error,
          });
        }

        // Log the first ticket to see its structure
        if (tickets && tickets.length > 0) {
          console.log('First ticket structure:', JSON.stringify(tickets[0], null, 2));
        }

        // Use admin client only for additional metadata that doesn't need RLS
        const adminClient = createAdminClient();
        
        // Get last audit logs for tickets
        const ticketIds = tickets.map(t => t.id);
        const { data: auditLogs } = await adminClient
          .from('audit_logs')
          .select('*')
          .in('entity_id', ticketIds)
          .eq('entity', 'TICKET')
          .order('timestamp', { ascending: false });

        // Create map of ticket ID to last updater
        const lastUpdaterMap = new Map();
        if (auditLogs) {
          for (const log of auditLogs) {
            if (!lastUpdaterMap.has(log.entity_id)) {
              lastUpdaterMap.set(log.entity_id, {
                name: log.user_name,
                email: log.user_email
              });
            }
          }
        }

        // Check if we have an extra item for cursor
        const hasNextPage = tickets.length > input.limit;
        const items = hasNextPage ? tickets.slice(0, -1) : tickets;

        // Create the next cursor using the last item's updated_at and id
        const nextCursor = hasNextPage 
          ? `${items[items.length - 1].updated_at || 'null'}_${items[items.length - 1].id}`
          : undefined;

        return {
          tickets: items.map((ticket) => ({
            ...ticket,
            message_count: Array.isArray(ticket.messages) ? ticket.messages.length : 0,
          })),
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

        // Use the admin client
        const adminClient = createAdminClient();

        const { data: ticket, error } = await adminClient
          .from('tickets')
          .update({
            ...updateData,
            last_updated_by_id: ctx.user.id,
          })
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
          supabase: adminClient
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

        // Use the admin client
        const adminClient = createAdminClient();

        // Get ticket and customer data in sequence to avoid undefined ticket
        const { data: ticket, error: ticketError } = await adminClient
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
          adminClient
            .from('users')
            .select('id, name, email, role')
            .in('role', ASSIGNABLE_ROLES)
            .order('role', { ascending: true })
            .order('name', { ascending: true }),
          adminClient
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
    .query(async () => {
      try {
        // Use the admin client
        const adminClient = createAdminClient();

        const { data: tickets, error } = await adminClient
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