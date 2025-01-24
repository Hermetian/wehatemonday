import { PrismaClient, Prisma } from '@prisma/client';

export async function cleanupExpiredTestData(prisma: PrismaClient) {
  try {
    // Find all expired test users
    const expiredUsers = await prisma.user.findMany({
      where: {
        testBatchId: { not: null },
        cleanupAt: { lte: new Date() }
      } as Prisma.UserWhereInput
    });

    if (expiredUsers.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete audit logs
      await tx.auditLog.deleteMany({
        where: {
          userId: {
            in: expiredUsers.map(u => u.id)
          }
        }
      });

      // Delete messages
      await tx.message.deleteMany({
        where: {
          ticket: {
            OR: [
              { createdById: { in: expiredUsers.map(u => u.id) } },
              { assignedToId: { in: expiredUsers.map(u => u.id) } }
            ]
          }
        }
      });

      // Delete tickets
      await tx.ticket.deleteMany({
        where: {
          OR: [
            { createdById: { in: expiredUsers.map(u => u.id) } },
            { assignedToId: { in: expiredUsers.map(u => u.id) } }
          ]
        }
      });

      // Delete users
      await tx.user.deleteMany({
        where: {
          id: { in: expiredUsers.map(u => u.id) }
        }
      });
    });

    return {
      success: true,
      deletedCount: expiredUsers.length
    };
  } catch (error) {
    console.error('Test data cleanup error:', error);
    return {
      success: false,
      error: 'Failed to cleanup test data'
    };
  }
} 