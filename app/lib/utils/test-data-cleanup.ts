import { createAdminClient } from '@/app/lib/auth/supabase';

export async function cleanupExpiredTestData() {
  try {
    const adminClient = createAdminClient();
    
    // Find all expired test users
    const { data: expiredUsers, error: userError } = await adminClient
      .from('users')
      .select('id')
      .not('test_batch_id', 'is', null)
      .lte('cleanup_at', new Date().toISOString());

    if (userError) throw userError;
    if (!expiredUsers?.length) {
      return { success: true, deletedCount: 0 };
    }

    const userIds = expiredUsers.map(u => u.id);

    // Delete all related data in order due to foreign key constraints
    // 1. Delete audit logs
    const { error: auditError } = await adminClient
      .from('audit_logs')
      .delete()
      .in('user_id', userIds);
    if (auditError) throw auditError;

    // 2. Delete team memberships
    const { error: teamMemberError } = await adminClient
      .from('team_members')
      .delete()
      .in('user_id', userIds);
    if (teamMemberError) throw teamMemberError;

    // 3. Delete messages (through tickets)
    const { data: userTickets, error: ticketQueryError } = await adminClient
      .from('tickets')
      .select('id')
      .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);
    if (ticketQueryError) throw ticketQueryError;

    if (userTickets?.length) {
      const ticketIds = userTickets.map(t => t.id);
      const { error: messageError } = await adminClient
        .from('messages')
        .delete()
        .in('ticket_id', ticketIds);
      if (messageError) throw messageError;

      // 4. Delete tickets
      const { error: ticketError } = await adminClient
        .from('tickets')
        .delete()
        .or(`created_by_id.in.(${userIds}),assigned_to_id.in.(${userIds})`);
      if (ticketError) throw ticketError;
    }

    // 5. Finally delete users
    const { error: userDeleteError } = await adminClient
      .from('users')
      .delete()
      .in('id', userIds);
    if (userDeleteError) throw userDeleteError;

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