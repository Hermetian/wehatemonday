import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TicketStatus, TicketPriority } from '@/app/types/tickets';
import { UserClade } from '@/lib/supabase/types';

const STAFF_CLADES = [UserClade.ADMIN, UserClade.MANAGER, UserClade.AGENT] as const;
const ASSIGNMENT_CLADES = [UserClade.ADMIN, UserClade.MANAGER] as const;

interface TicketWithRelations {
  id: string;
  title: string;
  description: string;
  description_html: string;
  status: string;
  priority: string;
  customer_id: string;
  assigned_to_id: string | null;
  created_by_id: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  cleanup_at: string | null;
  test_batch_id: string | null;
  metadata: Record<string, unknown>;
  last_updated_by_id: string | null;
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

        // Create ticket
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .insert({
            title: input.title,
            description: input.description,
            description_html: input.descriptionHtml,
            status: TicketStatus.OPEN,
            priority: input.priority,
            customer_id: input.customerId,
            created_by_id: input.createdBy,
          })
          .select()
          .single();

        if (ticketError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketError.message,
          });
        }

        // Create audit log
        const { error: auditError } = await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'CREATE',
            entity: 'TICKET',
            entity_id: ticket.id,
            user_id: ctx.user.id,
            old_data: null,
            new_data: ticket,
          });

        if (auditError) {
          console.error('Failed to create audit log:', auditError);
        }

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
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const { user, supabase } = ctx;

        if (!user.clade) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User clade not found'
          });
        }

        // Get user clade
        const { data: userClade, error: userError } = await supabase
          .from('users')
          .select('clade')
          .eq('id', ctx.user.id)
          .single();

        if (userError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: userError.message,
          });
        }

        // Build query
        let query = supabase
          .from('tickets')
          .select(`
            *,
            created_by:users!created_by_id (
              name,
              email
            ),
            assigned_to:users!assigned_to_id (
              name,
              email
            ),
            last_updated_by:users!last_updated_by_id (
              name,
              email
            ),
            messages (count)
          `, { count: 'exact' });

        // Apply filters
        if (userClade.clade === UserClade.CUSTOMER) {
          query = query.eq('customer_id', ctx.user.id);
        } else if (input.filterByUser) {
          query = query.eq('assigned_to_id', input.filterByUser);
        }

        if (!input.showCompleted) {
          query = query.neq('status', TicketStatus.COMPLETED);
        }

        // Apply sorting
        for (const sort of input.sortConfig) {
          if (sort.field === 'assignedToMe') {
            // Handle special case for assignedToMe
            if (sort.direction === 'desc') {
              query = query.order('assigned_to_id', { ascending: false, nullsLast: true });
            } else {
              query = query.order('assigned_to_id', { ascending: true, nullsFirst: true });
            }
          } else if (sort.field === 'priority') {
            query = query.order('priority', { ascending: sort.direction === 'asc' });
          } else if (sort.field === 'updatedAt') {
            query = query.order('updated_at', { ascending: sort.direction === 'asc' });
          }
        }

        // Apply pagination
        if (input.cursor) {
          query = query.gt('id', input.cursor);
        }
        query = query.limit(input.limit || 50);

        const { data: tickets, error: ticketsError, count } = await query;

        if (ticketsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketsError.message,
          });
        }

        return {
          tickets: tickets.map(ticket => ({
            ...ticket,
            message_count: ticket.messages?.[0]?.count || 0,
          })) as TicketWithRelations[],
          nextCursor: tickets.length === (input.limit || 50) ? tickets[tickets.length - 1].id : undefined,
          total: count,
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

  byId: protectedProcedure
    .input(z.string())
    .query(async ({ input: ticketId, ctx }) => {
      try {
        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select(`
            *,
            created_by:users!created_by_id (
              name,
              email
            ),
            assigned_to:users!assigned_to_id (
              name,
              email
            ),
            last_updated_by:users!last_updated_by_id (
              name,
              email
            ),
            messages
          `)
          .eq('id', ticketId)
          .single();

        if (ticketError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketError.message,
          });
        }

        if (!ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        return ticket;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch ticket',
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
        const { id, ...updateData } = input;

        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (ticketError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketError.message,
          });
        }

        // Create audit log
        const { error: auditError } = await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'UPDATE',
            entity: 'TICKET',
            entity_id: ticket.id,
            user_id: ctx.user.id,
            old_data: input,
            new_data: ticket,
          });

        if (auditError) {
          console.error('Failed to create audit log:', auditError);
        }

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
        const { data: user, error: userError } = await ctx.supabase
          .from('users')
          .select('clade')
          .eq('id', ctx.user.id)
          .single();

        if (userError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: userError.message,
          });
        }

        if (!user || !ASSIGNMENT_CLADES.includes(user.clade as typeof ASSIGNMENT_CLADES[number])) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins and managers can view staff users',
          });
        }

        const { data: staffUsers, error: staffUsersError } = await ctx.supabase
          .from('users')
          .select('id, name, email, clade')
          .in('clade', [...STAFF_CLADES])
          .order('name', { ascending: true });

        if (staffUsersError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: staffUsersError.message,
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
        const { data: tickets, error: ticketsError } = await ctx.supabase
          .from('tickets')
          .select('tags');

        if (ticketsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketsError.message,
          });
        }

        const { data: teams, error: teamsError } = await ctx.supabase
          .from('teams')
          .select('tags');

        if (teamsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: teamsError.message,
          });
        }

        const tagSet = new Set<string>();
        tickets.forEach(ticket => {
          ticket.tags.forEach(tag => tagSet.add(tag));
        });
        teams.forEach(team => {
          team.tags.forEach(tag => tagSet.add(tag));
        });

        return Array.from(tagSet).sort();
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tags',
          cause: error,
        });
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
        const { data: user, error: userError } = await ctx.supabase
          .from('users')
          .select('clade')
          .eq('id', ctx.user.id)
          .single();

        if (userError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: userError.message,
          });
        }

        if (!user || !ASSIGNMENT_CLADES.includes(user.clade as typeof ASSIGNMENT_CLADES[number])) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to assign tickets',
          });
        }

        const { data: ticket, error: ticketError } = await ctx.supabase
          .from('tickets')
          .select('customer_id')
          .eq('id', input.ticketId)
          .single();

        if (ticketError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ticketError.message,
          });
        }

        if (!ticket) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Ticket not found',
          });
        }

        const { data: staffUsers, error: staffUsersError } = await ctx.supabase
          .from('users')
          .select('id, name, email, clade')
          .in('clade', [...STAFF_CLADES])
          .order('clade', { ascending: true })
          .order('name', { ascending: true });

        if (staffUsersError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: staffUsersError.message,
          });
        }

        const { data: customer, error: customerError } = await ctx.supabase
          .from('users')
          .select('id, name, email, clade')
          .eq('id', ticket.customer_id)
          .single();

        if (customerError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: customerError.message,
          });
        }

        if (!customer) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Customer not found',
          });
        }

        return [
          ...staffUsers.map(user => ({ ...user, isCustomer: false })),
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