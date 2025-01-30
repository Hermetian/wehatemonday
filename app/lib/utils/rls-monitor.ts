import { createAdminClient } from '../auth/supabase';

interface RLSError {
  id: string;
  error_code: string;
  error_message: string;
  error_details: string;
  error_hint: string;
  table_name: string;
  operation: string;
  user_id: string;
  timestamp: Date;
}

interface ErrorStats {
  code: string;
  message: string;
  count: number;
}

interface ErrorMetrics {
  table_name: string;
  operation: string;
  error_count: number;
}

export async function logRLSError(error: RLSError) {
  const adminClient = createAdminClient(true);
  
  const { error: insertError } = await adminClient
    .from('rls_errors')
    .insert({
      error_code: error.error_code,
      error_message: error.error_message,
      error_details: error.error_details,
      error_hint: error.error_hint,
      table_name: error.table_name,
      operation: error.operation,
      user_id: error.user_id,
      timestamp: error.timestamp,
    });

  if (insertError) {
    console.error('Failed to log RLS error:', insertError);
  }
}

export async function getDailyMetrics(): Promise<ErrorMetrics[]> {
  const adminClient = createAdminClient(true);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: metrics, error } = await adminClient
    .rpc('get_daily_error_metrics', {
      start_date: startOfDay.toISOString()
    });

  if (error) {
    console.error('Failed to get daily metrics:', error);
    return [];
  }

  return metrics;
}

export async function getErrorStats(): Promise<ErrorStats[]> {
  const adminClient = createAdminClient(true);
  
  const { data: stats, error } = await adminClient
    .rpc('get_error_stats', {
      limit_count: 10
    });

  if (error) {
    console.error('Failed to get error stats:', error);
    return [];
  }

  return stats.map((stat: { error_code: string; error_message: string; count: string }) => ({
    code: stat.error_code,
    message: stat.error_message,
    count: parseInt(stat.count),
  }));
}
