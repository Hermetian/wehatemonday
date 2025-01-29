import { NextResponse } from 'next/server';
import { generateTestUserData, TestUserConfig } from '@/app/lib/utils/test-data-generator';
import { createAuditLog } from '@/app/lib/utils/audit-logger';
import { createAdminClient } from '@/app/lib/auth/supabase';

export async function POST(request: Request) {
  try {
    const config: TestUserConfig = await request.json();
    const testUsers = generateTestUserData(config);
    const adminClient = createAdminClient();
    
    // Create users
    const { data: createdUsers, error: createError } = await adminClient
      .from('users')
      .insert(testUsers)
      .select();

    if (createError) throw createError;
    if (!createdUsers?.length) throw new Error('No users created');

    // Create audit logs for test users
    await Promise.all(
      createdUsers.map(user =>
        createAuditLog({
          action: 'CREATE',
          entity: 'USER',
          entityId: user.id,
          userId: user.id,
          oldData: null,
          newData: { ...user, type: 'TEST_USER' },
          supabase: adminClient
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      users: createdUsers,
      batchId: testUsers[0].test_batch_id 
    });
  } catch (error) {
    console.error('Test user creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create test users' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const adminClient = createAdminClient();

    if (!batchId) {
      return NextResponse.json(
        { error: 'Batch ID is required' },
        { status: 400 }
      );
    }

    // Find users to delete
    const { data: usersToDelete, error: findError } = await adminClient
      .from('users')
      .select('id')
      .eq('test_batch_id', batchId);

    if (findError) throw findError;
    if (!usersToDelete?.length) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    const userIds = usersToDelete.map(u => u.id);

    // Find and delete related tickets
    const { data: userTickets, error: ticketQueryError } = await adminClient
      .from('tickets')
      .select('id')
      .in('created_by_id', userIds);

    if (ticketQueryError) throw ticketQueryError;

    if (userTickets?.length) {
      const ticketIds = userTickets.map(t => t.id);

      // Delete ticket audit logs
      const { error: ticketAuditError } = await adminClient
        .from('audit_logs')
        .delete()
        .in('entity_id', ticketIds)
        .eq('entity', 'TICKET');

      if (ticketAuditError) throw ticketAuditError;

      // Delete tickets
      const { error: ticketError } = await adminClient
        .from('tickets')
        .delete()
        .in('id', ticketIds);

      if (ticketError) throw ticketError;
    }

    // Delete team memberships
    const { error: teamMemberError } = await adminClient
      .from('team_members')
      .delete()
      .in('user_id', userIds);

    if (teamMemberError) throw teamMemberError;

    // Delete user audit logs
    const { error: userAuditError } = await adminClient
      .from('audit_logs')
      .delete()
      .in('entity_id', userIds)
      .eq('entity', 'USER');

    if (userAuditError) throw userAuditError;

    // Delete users
    const { error: userError } = await adminClient
      .from('users')
      .delete()
      .in('id', userIds);

    if (userError) throw userError;

    return NextResponse.json({
      success: true,
      deletedCount: usersToDelete.length
    });
  } catch (error) {
    console.error('Test user deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete test users' },
      { status: 500 }
    );
  }
} 