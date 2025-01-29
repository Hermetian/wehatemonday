import { Role } from '@/app/types/auth';
import { v4 as uuidv4 } from 'uuid';
import { WeightedItem, selectWeighted } from './test-data-generator';
import { supabase } from '@/app/lib/auth/supabase';

export interface TestTicketConfig {
  ticketCount?: number;
  originatingRole?: WeightedItem<Role>[];
  assignedRole?: WeightedItem<Role>[];
  testBatchId?: string;
  status?: WeightedItem<string>[];
  priority?: WeightedItem<string>[];
  tags?: WeightedItem<string>[][];
  creationTime?: Date;
  duration?: number;
}

interface TestTicketMetadata {
  isTest: boolean;
  batchId: string;
  originatingRole: string;
  assignedRole: string;
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

async function findTestUser(role: Role, batchId?: string): Promise<string> {
  // First try to find a user with the exact batch ID
  if (batchId) {
    const { data: exactUser, error: exactError } = await supabase
      .from('users')
      .select('id')
      .eq('role', role)
      .eq('test_batch_id', batchId)
      .limit(1)
      .single();
    
    if (!exactError && exactUser) return exactUser.id;
  }

  // Then try to find any test user with the correct role
  const { data: testUser, error: roleError } = await supabase
    .from('users')
    .select('id')
    .eq('role', role)
    .not('test_batch_id', 'is', null)
    .limit(1)
    .single();

  if (!roleError && testUser) return testUser.id;

  // Finally, try to find any test user
  const { data: anyTestUser, error: anyError } = await supabase
    .from('users')
    .select('id')
    .not('test_batch_id', 'is', null)
    .limit(1)
    .single();

  if (anyError || !anyTestUser) {
    throw new Error('No test users available');
  }

  return anyTestUser.id;
}

export async function generateTestTicketData(config: TestTicketConfig) {
  const {
    ticketCount = 1,
    originatingRole = [{ value: 'CUSTOMER', weight: 1 }],
    assignedRole = [{ value: 'AGENT', weight: 1 }],
    testBatchId,
    status = [{ value: "OPEN", weight: 1 }],
    priority = [{ value: "MEDIUM", weight: 1 }],
    tags = [],
    creationTime = new Date(),
    duration = 24
  } = config;

  const batchId = testBatchId || `test_${uuidv4()}`;
  const cleanupAt = new Date(creationTime.getTime() + duration * 60 * 60 * 1000);

  const tickets = await Promise.all(
    Array.from({ length: ticketCount }, async (_, index) => {
      const createdByRole = selectWeighted(originatingRole);
      const assignedToRole = selectWeighted(assignedRole);

      const createdById = await findTestUser(createdByRole, testBatchId);
      const assignedToId = await findTestUser(assignedToRole, testBatchId);

      const ticketData = {
        title: `[TEST] ${DEFAULT_TITLES[index % DEFAULT_TITLES.length]}`,
        description: DEFAULT_DESCRIPTIONS[index % DEFAULT_DESCRIPTIONS.length],
        description_html: DEFAULT_DESCRIPTIONS[index % DEFAULT_DESCRIPTIONS.length],
        status: selectWeighted(status),
        priority: selectWeighted(priority),
        created_by_id: createdById,
        assigned_to_id: assignedToId,
        customer_id: createdById,
        tags: tags.map(tagGroup => 
          tagGroup.length ? selectWeighted(tagGroup) : null
        ).filter(Boolean) as string[],
        test_batch_id: batchId,
        cleanup_at: cleanupAt.toISOString(),
        created_at: creationTime.toISOString(),
        updated_at: creationTime.toISOString(),
        metadata: {
          isTest: true,
          batchId,
          originatingRole: createdByRole,
          assignedRole: assignedToRole
        } as TestTicketMetadata
      };

      return ticketData;
    })
  );

  return tickets;
} 