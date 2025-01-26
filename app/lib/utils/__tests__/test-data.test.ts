import { createClient } from '@supabase/supabase-js';
import { generateTestUserData } from '../test-data-generator';
import { generateTestTicketData } from '../test-ticket-generator';
import { UserClade } from '@/lib/supabase/types';
import { TicketStatus, TicketPriority } from '../../../types/tickets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Test Data Generation', () => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  describe('User Generation', () => {
    it('generates users with default values', () => {
      const users = generateTestUserData({
        userCount: 3
      });

      expect(users).toHaveLength(3);
      users.forEach(user => {
        expect(user.email).toMatch(/^test\..+@(test\.com|example\.com|demo\.org)$/);
        expect(user.name).toMatch(/^Test User \d+$/);
        expect(user.clade).toBe(UserClade.CUSTOMER);
        expect(user.testBatchId).toMatch(/^test_.+/);
        expect(user.metadata.isTest).toBe(true);
        expect(user.cleanupAt).toBeInstanceOf(Date);
      });
    });

    it('generates users with custom values', () => {
      const users = generateTestUserData({
        userCount: 2,
        email: [{ value: 'custom@test.com', weight: 1 }],
        name: [{ value: 'Custom User', weight: 1 }],
        clade: [{ value: UserClade.AGENT, weight: 1 }],
        flags: [[{ value: 'premium', weight: 1 }]]
      });

      expect(users).toHaveLength(2);
      users.forEach(user => {
        expect(user.email).toMatch(/^custom\.test\d+\.\d+@test\.com$/);
        expect(user.name).toBe('Custom User');
        expect(user.clade).toBe(UserClade.AGENT);
        expect(user.metadata.flags).toContain('premium');
      });
    });
  });

  describe('Ticket Generation', () => {
    it('generates tickets with default values', async () => {
      const tickets = await generateTestTicketData(supabase, {
        ticketCount: 3
      });

      expect(tickets).toHaveLength(3);
      tickets.forEach(ticket => {
        expect(ticket.title).toMatch(/^\[TEST\]/);
        expect(ticket.status).toBe(TicketStatus.OPEN);
        expect(ticket.priority).toBe(TicketPriority.MEDIUM);
        expect(ticket.test_batch_id).toMatch(/^test_.+/);
        expect(ticket.metadata.isTest).toBe(true);
        expect(ticket.cleanup_at).toBeInstanceOf(Date);
      });
    });

    it('generates tickets with custom values', async () => {
      const tickets = await generateTestTicketData(supabase, {
        ticketCount: 2,
        originatingClade: [{ value: UserClade.CUSTOMER, weight: 1 }],
        assignedClade: [{ value: UserClade.AGENT, weight: 1 }],
        status: [{ value: TicketStatus.IN_PROGRESS, weight: 1 }],
        priority: [{ value: TicketPriority.HIGH, weight: 1 }],
        tags: [[{ value: 'urgent', weight: 1 }]]
      });

      expect(tickets).toHaveLength(2);
      tickets.forEach(ticket => {
        expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
        expect(ticket.priority).toBe(TicketPriority.HIGH);
        expect(ticket.tags).toContain('urgent');
        expect(ticket.metadata.originatingClade).toBe(UserClade.CUSTOMER);
        expect(ticket.metadata.assignedClade).toBe(UserClade.AGENT);
      });
    });
  });

  describe('Integration Tests', () => {
    it('creates and deletes test users and tickets', async () => {
      // Generate test data
      const users = generateTestUserData({
        userCount: 2,
        clade: [
          { value: UserClade.CUSTOMER, weight: 1 },
          { value: UserClade.AGENT, weight: 1 }
        ]
      });

      // Create users in Supabase
      const { data: createdUsers, error: userError } = await supabase
        .from('users')
        .insert(users)
        .select();

      expect(userError).toBeNull();
      expect(createdUsers).toHaveLength(2);

      // Generate tickets using the created users
      const tickets = await generateTestTicketData(supabase, {
        ticketCount: 3,
        originatingClade: [{ value: UserClade.CUSTOMER, weight: 1 }],
        assignedClade: [{ value: UserClade.AGENT, weight: 1 }]
      });

      // Create tickets in Supabase
      const { data: createdTickets, error: ticketError } = await supabase
        .from('tickets')
        .insert(tickets)
        .select();

      expect(ticketError).toBeNull();
      expect(createdTickets).toHaveLength(3);

      // Clean up test data
      const { error: deleteTicketError } = await supabase
        .from('tickets')
        .delete()
        .in('id', createdTickets!.map(t => t.id));

      expect(deleteTicketError).toBeNull();

      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .in('id', createdUsers!.map(u => u.id));

      expect(deleteUserError).toBeNull();
    });
  });
});
