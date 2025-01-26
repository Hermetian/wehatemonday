import { UserClade } from '@/lib/supabase/types';
import { v4 as uuidv4 } from 'uuid';
import { WeightedItem, selectWeighted } from './test-data-generator';
import { SupabaseClient } from '@supabase/supabase-js';
import { TicketStatus, TicketPriority } from '../../types/tickets';

export interface TestTicketConfig {
  ticketCount?: number;
  originatingClade?: WeightedItem<UserClade>[];
  assignedClade?: WeightedItem<UserClade>[];
  testBatchId?: string;
  status?: WeightedItem<TicketStatus>[];
  priority?: WeightedItem<TicketPriority>[];
  tags?: WeightedItem<string>[][];
  creationTime?: Date;
  duration?: number;
}

interface TestTicketMetadata {
  isTest: boolean;
  batchId: string;
  originatingClade: UserClade;
  assignedClade: UserClade;
}

const DEFAULT_TITLES = [
  "Cannot access dashboard",
  "Login issues",
  "Need help with setup",
  "Feature request",
  "Bug report",
  "Performance issues",
  "Integration problem",
  "Account locked",
  "Update failed",
  "Configuration error"
];

const DEFAULT_DESCRIPTIONS = [
  "Having trouble accessing the system",
  "Need assistance with configuration",
  "Experiencing unexpected behavior",
  "System is not responding as expected",
  "Would like to request a new feature",
  "Found a bug in the latest update",
  "Performance is degraded",
  "Integration with external system failed",
  "Account needs to be unlocked",
  "Update process failed to complete"
];

async function findTestUser(supabase: SupabaseClient, clade: UserClade, batchId?: string): Promise<string> {
  // First try to find a user with the exact batch ID
  if (batchId) {
    const { data: exactUser, error: exactError } = await supabase
      .from('users')
      .select('id')
      .eq('clade', clade)
      .eq('test_batch_id', batchId)
      .single();

    if (!exactError && exactUser) {
      return exactUser.id;
    }
  }

  // Then try to find any test user with the correct clade
  const { data: testUser, error: testError } = await supabase
    .from('users')
    .select('id')
    .eq('clade', clade)
    .not('test_batch_id', 'is', null)
    .single();

  if (!testError && testUser) {
    return testUser.id;
  }

  // Finally, try to find any test user
  const { data: anyUser, error: anyError } = await supabase
    .from('users')
    .select('id')
    .not('test_batch_id', 'is', null)
    .single();

  if (!anyError && anyUser) {
    return anyUser.id;
  }

  throw new Error('No test users available');
}

export async function generateTestTicketData(supabase: SupabaseClient, config: TestTicketConfig) {
  const {
    ticketCount = 1,
    originatingClade = [{ value: UserClade.CUSTOMER, weight: 1 }],
    assignedClade = [{ value: UserClade.AGENT, weight: 1 }],
    testBatchId,
    status = [{ value: TicketStatus.OPEN, weight: 1 }],
    priority = [{ value: TicketPriority.MEDIUM, weight: 1 }],
    tags = [],
    creationTime = new Date(),
    duration = 24
  } = config;

  const batchId = testBatchId || `test_${uuidv4()}`;
  const cleanupAt = new Date(creationTime.getTime() + duration * 60 * 60 * 1000);

  const tickets = await Promise.all(
    Array.from({ length: ticketCount }, async (_, index) => {
      const createdByClade = selectWeighted(originatingClade);
      const assignedToClade = selectWeighted(assignedClade);

      const createdById = await findTestUser(supabase, createdByClade, testBatchId);
      const assignedToId = await findTestUser(supabase, assignedToClade, testBatchId);

      const ticketData = {
        title: `[TEST] ${DEFAULT_TITLES[index % DEFAULT_TITLES.length]}`,
        description: DEFAULT_DESCRIPTIONS[index % DEFAULT_DESCRIPTIONS.length],
        status: selectWeighted(status),
        priority: selectWeighted(priority),
        created_by: createdById,
        assigned_to: assignedToId,
        customer_id: createdById,
        tags: tags.map(tagGroup => 
          tagGroup.length ? selectWeighted(tagGroup) : null
        ).filter(Boolean) as string[],
        test_batch_id: batchId,
        cleanup_at: cleanupAt,
        created_at: creationTime,
        updated_at: creationTime,
        metadata: {
          isTest: true,
          batchId,
          originatingClade: createdByClade,
          assignedClade: assignedToClade
        } satisfies TestTicketMetadata
      };

      return ticketData;
    })
  );

  return tickets;
}