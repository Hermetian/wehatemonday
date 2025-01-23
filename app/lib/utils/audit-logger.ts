import { PrismaClient, Prisma } from '@prisma/client';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
type AuditEntity = 'TICKET' | 'USER';

interface AuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  userId: string;
  oldData?: Prisma.InputJsonValue | null;
  newData: Prisma.InputJsonValue;
  prisma: PrismaClient;
}

export async function createAuditLog({
  action,
  entity,
  entityId,
  userId,
  oldData,
  newData,
  prisma,
}: AuditLogParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        userId,
        oldData: oldData ?? Prisma.JsonNull,
        newData,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // We don't want to throw here as audit logging should not block the main operation
    return null;
  }
}

// Helper function to get changes between old and new data
export function getChangedFields(
  oldData: Prisma.JsonValue | null,
  newData: Prisma.JsonValue
): Record<string, { old: Prisma.JsonValue | undefined; new: Prisma.JsonValue }> {
  const changes: Record<string, { old: Prisma.JsonValue | undefined; new: Prisma.JsonValue }> = {};
  
  // Get all unique keys from both objects
  const oldObj = oldData as Record<string, Prisma.JsonValue> | null;
  const newObj = newData as Record<string, Prisma.JsonValue>;
  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj)]);
  
  for (const key of keys) {
    if (JSON.stringify(oldObj?.[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = {
        old: oldObj?.[key],
        new: newObj[key],
      };
    }
  }
  
  return changes;
} 