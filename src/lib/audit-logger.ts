import { PrismaClient } from '@prisma/client';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
type AuditEntity = 'TICKET' | 'USER';

interface AuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  userId: string;
  oldData?: any;
  newData: any;
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
        oldData,
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
export function getChangedFields(oldData: any, newData: any): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  
  // Get all unique keys from both objects
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  
  for (const key of keys) {
    if (JSON.stringify(oldData?.[key]) !== JSON.stringify(newData?.[key])) {
      changes[key] = {
        old: oldData?.[key],
        new: newData?.[key],
      };
    }
  }
  
  return changes;
} 