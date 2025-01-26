import { createClient } from '@supabase/supabase-js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntity = 'TICKET' | 'USER' | 'TEAM' | 'MESSAGE';

interface AuditLogEntry {
  id: string;
  created_at: string;
  action: AuditAction;
  entity: AuditEntity;
  entity_id: string;
  user_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

export async function createAuditLog(
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  userId: string,
  oldData: Record<string, unknown> | null = null,
  newData: Record<string, unknown> | null = null
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );

  const { error } = await supabase
    .from('audit_logs')
    .insert({
      action,
      entity,
      entity_id: entityId,
      user_id: userId,
      old_data: oldData,
      new_data: newData,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to create audit log:', error);
  }
}

// Helper function to get changes between old and new data
export function getChangedFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown>
): Record<string, { old: Record<string, unknown> | undefined; new: Record<string, unknown> }> {
  const changes: Record<string, { old: Record<string, unknown> | undefined; new: Record<string, unknown> }> = {};
  
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

export async function getAuditLogs(
  entity: AuditEntity,
  entityId: string,
  limit = 50,
  offset = 0
): Promise<AuditLogEntry[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    }
  );

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity', entity)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }

  return data as AuditLogEntry[];
}