import { UserRole, PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { WeightedItem, selectWeighted } from './test-data-generator';

export interface TestTicketConfig {
  ticketCount?: number;
  originatingRole?: WeightedItem<UserRole>[];
  assignedRole?: WeightedItem<UserRole>[];
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
  originatingRole: UserRole;
  assignedRole: UserRole;
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

async function findTestUser(prisma: PrismaClient, role: UserRole, batchId?: string): Promise<string> {
  // First try to find a user with the exact batch ID
  if (batchId) {
    const exactUser = await prisma.user.findFirst({
      where: {
        role,
        testBatchId: batchId
      },
      select: { id: true }
    });
    if (exactUser) return exactUser.id;
  }

  // Then try to find any test user with the correct role
  const testUser = await prisma.user.findFirst({
    where: {
      role,
      testBatchId: { not: null }
    },
    select: { id: true }
  });
  if (testUser) return testUser.id;

  // Finally, try to find any test user
  const anyTestUser = await prisma.user.findFirst({
    where: {
      testBatchId: { not: null }
    },
    select: { id: true }
  });

  if (!anyTestUser) {
    throw new Error('No test users available');
  }

  return anyTestUser.id;
}

export async function generateTestTicketData(prisma: PrismaClient, config: TestTicketConfig) {
  const {
    ticketCount = 1,
    originatingRole = [{ value: UserRole.CUSTOMER, weight: 1 }],
    assignedRole = [{ value: UserRole.AGENT, weight: 1 }],
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

      const createdById = await findTestUser(prisma, createdByRole, testBatchId);
      const assignedToId = await findTestUser(prisma, assignedToRole, testBatchId);

      const ticketData: Omit<Prisma.TicketUncheckedCreateInput, 'metadata'> = {
        title: `[TEST] ${DEFAULT_TITLES[index % DEFAULT_TITLES.length]}`,
        description: DEFAULT_DESCRIPTIONS[index % DEFAULT_DESCRIPTIONS.length],
        status: selectWeighted(status),
        priority: selectWeighted(priority),
        createdById,
        assignedToId,
        customerId: createdById,
        tags: tags.map(tagGroup => 
          tagGroup.length ? selectWeighted(tagGroup) : null
        ).filter(Boolean) as string[],
        testBatchId: batchId,
        cleanupAt,
        createdAt: creationTime,
        updatedAt: creationTime
      };

      const metadata: TestTicketMetadata = {
        isTest: true,
        batchId,
        originatingRole: createdByRole,
        assignedRole: assignedToRole
      };

      return {
        ...ticketData,
        metadata
      };
    })
  );

  return tickets;
} 