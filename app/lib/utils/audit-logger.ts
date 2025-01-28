import { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntity = 'TICKET' | 'USER' | 'MESSAGE' | 'TEAM';

interface AuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  userId: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  supabase: SupabaseClient;
}

export async function createAuditLog({
  action,
  entity,
  entityId,
  userId,
  oldData,
  newData,
  supabase
}: AuditLogParams): Promise<void> {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        action,
        entity,
        entity_id: entityId,
        user_id: userId,
        old_data: oldData,
        new_data: newData,
        timestamp: new Date().toISOString()
      }]);

    if (error) {
      console.error('Failed to create audit log:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in createAuditLog:', error);
    // We don't throw here to prevent audit log failures from breaking main operations
  }
}

// Helper function to get changes between old and new data
export function getChangedFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown>
): Record<string, { old: unknown | undefined; new: unknown }> {
  const changes: Record<string, { old: unknown | undefined; new: unknown }> = {};
  
  // Get all unique keys from both objects
  const oldObj = oldData as Record<string, unknown> | null;
  const newObj = newData as Record<string, unknown>;
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